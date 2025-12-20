import ModbusRTU from "modbus-serial";
import { CONFIG } from "../config";
import db from "../database/db";
import { MeterConfig, GatewayHealth } from "../types";
import { EventEmitter } from "events";

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
        // Start polling loop
        this.intervalTimer = setInterval(async () => {
            if (this.status === 'DOWN' && !this.client.isOpen) {
                console.log("Attempting reconnection...");
                await this.connect();
            } else {
                await this.poll();
            }
        }, CONFIG.MODBUS.POLL_INTERVAL_MS);
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
