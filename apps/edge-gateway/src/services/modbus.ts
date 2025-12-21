import ModbusRTU from "modbus-serial";
import { CONFIG } from "../config";
import db from "../database/db";
import { MeterConfig, GatewayHealth } from "../types";
import { EventEmitter } from "events";
import { loadRuntimeState, saveRuntimeState } from "./state";

export class ModbusService extends EventEmitter {
    private client: ModbusRTU;
    private intervalTimer: NodeJS.Timeout | null = null;
    private failureCount = 0;
    private maxFailures = 3;
    public status: GatewayHealth = 'HEALTHY';
    public latestCounters: Record<string, number> = {};
    public dailyStartCounters: Record<string, number> = {}; // V1.2 to track daily consumption live
    public lastUpdate: Date = new Date();
    public digitalInputRegisterValue: number = 0;

    constructor() {
        super();
        this.client = new ModbusRTU();
    }

    async start() {
        await this.connect();
        await this.initDailyStats(); // Load 'start of day' values from DB or State

        // Start polling loop
        this.intervalTimer = setInterval(async () => {
            // Check connection status
            if (this.status === 'DOWN' && !this.client.isOpen) {
                console.log("Attempting reconnection...");
                await this.connect();
            } else {
                await this.poll();
                // If dailyStartCounters are empty (fresh install), set them to current on first successful poll
                this.ensureStartCounters();
            }
        }, CONFIG.MODBUS.POLL_INTERVAL_MS);
    }

    // New helper to seed start counters if missing
    private ensureStartCounters() {
        let changed = false;
        for (const id in this.latestCounters) {
            if (this.dailyStartCounters[id] === undefined) {
                // No history found, so "Start of Day" = "Now" (First run behavior)
                this.dailyStartCounters[id] = this.latestCounters[id];
                changed = true;
            }
        }
        if (changed) {
            saveRuntimeState(this.dailyStartCounters);
        }
    }

    public async initDailyStats() {
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            // 1. Try loading from Runtime State File (Crash Recovery)
            const savedState = loadRuntimeState();
            if (savedState) {
                this.dailyStartCounters = savedState;
                console.log("Loaded Daily Start Counters from State File:", this.dailyStartCounters);
            } else {
                // 2. Fallback to DB
                console.log("No state file found, checking DB for previous day...");
                const meters = await db.all<MeterConfig>('SELECT meter_id FROM meter_config');

                for (const m of meters) {
                    const yesterdayRow = await db.get<{ counter_value_end_day: number }>(
                        "SELECT counter_value_end_day FROM daily_snapshots WHERE meter_id = ? AND date = ?",
                        [m.meter_id, yesterdayStr]
                    );

                    if (yesterdayRow) {
                        this.dailyStartCounters[m.meter_id] = yesterdayRow.counter_value_end_day;
                    }
                }
            }
            console.log("Initialized Daily Start Counters:", this.dailyStartCounters);

            // Save initial state if loaded
            if (Object.keys(this.dailyStartCounters).length > 0) {
                saveRuntimeState(this.dailyStartCounters);
            }

        } catch (e) {
            console.error("Failed to init daily stats:", e);
        }
    }

    private async connect() {
        try {
            // Close existing if open
            if (this.client.isOpen) {
                this.client.close(() => { });
            }

            await this.client.connectTCP(CONFIG.MODBUS.HOST, { port: CONFIG.MODBUS.PORT });
            this.client.setID(CONFIG.MODBUS.UNIT_ID);
            this.client.setTimeout(CONFIG.MODBUS.TIMEOUT);
            console.log(`Connected to Modbus Gateway at ${CONFIG.MODBUS.HOST}:${CONFIG.MODBUS.PORT}`);
            this.triggerHealthChange('HEALTHY');
        } catch (e) {
            console.error("Modbus connection failed:", e);
            this.handleFailure();
        }
    }

    private async poll() {
        if (!this.client.isOpen) {
            this.handleFailure();
            return;
        }

        try {
            // 1. Read Digital Input Register (30016)
            // 30016 is Input Register. Address 30016 -> 15 (if 0-based) or 16?
            // Standard: 30001 -> 0. 30016 -> 15.
            const diAddr = 30016 - 30001;
            const diRes = await this.client.readInputRegisters(diAddr, 1);
            this.digitalInputRegisterValue = diRes.data[0];

            // 2. Read Meters
            const meters = await db.all<MeterConfig>('SELECT * FROM meter_config WHERE enabled = 1');

            for (const meter of meters) {
                const addrLSB = this.toAddress(meter.counter_lsb_register);
                const addrMSB = this.toAddress(meter.counter_msb_register);

                let valLSB = 0;
                let valMSB = 0;

                // Optimization: attempt contiguous read if adjacent
                // We use 'readHoldingRegisters' because '40xxx' are holding.
                // Note: Some devices map counters to Input Registers (3xxxx). The configured defaults are 4xxxx.
                // The code must handle checking the range.

                if (this.isHolding(meter.counter_lsb_register) && this.isHolding(meter.counter_msb_register)) {
                    // Both Holding
                    if (Math.abs(addrMSB - addrLSB) === 1) {
                        const start = Math.min(addrLSB, addrMSB);
                        const data = await this.client.readHoldingRegisters(start, 2);
                        if (addrLSB < addrMSB) {
                            valLSB = data.data[0];
                            valMSB = data.data[1];
                        } else {
                            valMSB = data.data[0];
                            valLSB = data.data[1];
                        }
                    } else {
                        valLSB = (await this.client.readHoldingRegisters(addrLSB, 1)).data[0];
                        valMSB = (await this.client.readHoldingRegisters(addrMSB, 1)).data[0];
                    }
                } else {
                    // Fallback to separate reads if mixed or Input registers (not implemented for simplicity as per defaults)
                    // Assuming defaults 4xxxx.
                    console.warn(`Meter ${meter.meter_id} registers not supported range (only 4xxxx implemented for counters)`);
                    continue;
                }

                const counter = (valMSB << 16) | valLSB;
                this.latestCounters[meter.meter_id] = counter;
            }

            this.lastUpdate = new Date();
            this.triggerHealthChange('HEALTHY');

        } catch (e) {
            console.error("Poll cycle failed:", e);
            this.handleFailure();
        }
    }

    private toAddress(reg: number): number {
        if (reg >= 40000) return reg - 40001;
        if (reg >= 30000) return reg - 30001;
        return reg;
    }

    private isHolding(reg: number): boolean {
        return reg >= 40000 && reg < 50000;
    }

    private handleFailure() {
        this.failureCount++;
        if (this.failureCount >= this.maxFailures) {
            this.triggerHealthChange('DOWN');
        } else if (this.failureCount > 0) {
            // Maybe DEGRADED?
            this.triggerHealthChange('DEGRADED');
        }
    }

    private triggerHealthChange(newStatus: GatewayHealth) {
        if (newStatus === 'HEALTHY') {
            this.failureCount = 0;
        }

        if (this.status !== newStatus) {
            const oldStatus = this.status;
            this.status = newStatus;
            console.log(`Gateway Health Changed: ${oldStatus} -> ${newStatus}`);
            this.emit('health_change', { from: oldStatus, to: newStatus });
        }
    }

    public async resetCounter(counterIndex: number) {
        // "Counter Reset Register: 40022. Bit-based reset per counter"
        // If counterIndex is 1 (for Counter 1), we set bit 0? Or bit 1?
        // SRS: "Bit-based reset per counter". 
        // Usually bit 0 = Counter 1, bit 1 = Counter 2 etc.
        const resetReg = 40022;
        const address = this.toAddress(resetReg);

        // We need to write a 1 to the specific bit.
        // Usually we write the bit mask, then maybe clear it? 
        // Or is it a coil? "Register 40022" is a Holding Register (16-bit word).
        // So we write a mask.

        try {
            const mask = 1 << (counterIndex - 1);
            // Write mask
            await this.client.writeRegister(address, mask);
            // Wait brief moment and clear? Or does the device clear it?
            // "Bit-based reset". Usually pulse-triggered.
            // Let's assume we need to clear it back to 0 to avoid continuous reset.
            setTimeout(async () => {
                try {
                    // Read current to make sure we don't clear other bits if manipulated concurrently?
                    // But here we just write 0 if we assume exclusive access.
                    // A safer way is read-modify-write but here we just triggered a reset.
                    // Let's write 0.
                    await this.client.writeRegister(address, 0);
                } catch (e) { console.error("Error clearing reset bit", e); }
            }, 500);

            return true;
        } catch (e) {
            console.error("Failed to reset counter", e);
            throw e;
        }
    }
}

export const modbusService = new ModbusService();
