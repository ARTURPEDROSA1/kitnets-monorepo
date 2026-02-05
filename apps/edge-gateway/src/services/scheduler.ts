import cron from 'node-cron';
import { modbusService } from './modbus';
// import { mqttService } from './mqtt'; // DEPRECATED: Replaced by syncService
import { syncService } from './sync';
import db from '../database/db';
import { DailySnapshot, MeterConfig } from '../types';

import { getLocalDateStr } from '../utils/date';

export const startScheduler = () => {
    // Scheduler for V1.2

    // Reset Daily Counters for live tracking at 00:00
    cron.schedule('0 0 * * *', async () => {
        console.log("Resetting daily start counters...");
        const meters = await db.all<MeterConfig>('SELECT * FROM meter_config WHERE enabled = 1');

        const newCounters = { ...modbusService.dailyStartCounters };

        for (const m of meters) {
            const current = modbusService.latestCounters[m.meter_id];
            if (current !== undefined) {
                newCounters[m.meter_id] = current;
            }
        }
        modbusService.setStartCounters(newCounters);
    });

    // Daily processing at 23:59
    cron.schedule('59 23 * * *', async () => {
        console.log("Running daily processing...");
        await runDailyProcessing();

        // Update Monthly Stats for CURRENT month immediately after daily close (V1.4)
        console.log("Running monthly aggregation update...");
        await runMonthlyProcessing();
    });

    // Monthly Processing: 00:01 1st day of month (Legacy/Backup - mostly redundant now)
    cron.schedule('1 0 1 * *', async () => {
        // Redundant with daily runner, but can act as final check for PREVIOUS month?
        // Actually, if we run it on the 1st, we want the PREVIOUS month.
        // Let's keep it but use the shared function for the previous month.
        console.log("Running monthly finalization...");
        const now = new Date();
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        await runMonthlyProcessing(prevMonthDate);
    });
    // Live Data Publishing (Every 2 minutes) V1.2
    cron.schedule('*/2 * * * *', async () => {
        try {
            const meters = await db.all<MeterConfig>('SELECT * FROM meter_config WHERE enabled = 1');
            const now = new Date();

            for (const m of meters) {
                const current = modbusService.latestCounters[m.meter_id];
                if (current === undefined) continue;

                const startOfDay = modbusService.dailyStartCounters[m.meter_id] || current; // If restarted today, might use current as fallback or need persistence. Ideally we fetch last daily snapshot end on boot.

                // Handle wrap for partial day
                let delta = 0;
                if (current >= startOfDay) {
                    delta = current - startOfDay;
                } else {
                    delta = (4294967295 - startOfDay) + current + 1;
                }
                const dailyLiters = delta * m.pulse_volume_liters;

                const raw_m3 = (current * m.pulse_volume_liters) / 1000;
                const offset = m.physical_meter_offset_m3 || 0;
                const effective_m3 = offset + raw_m3;

                // NEW: Store-and-Forward Queue (Replaces MQTT Live Publish)
                // We queue the Daily Liters (not raw counter) so Supabase updates "Today's Consumption".
                // Timestamp is set to the DATE string (YYYY-MM-DD) so that UPSERT overwrites the same row for this day.

                const todayDateStr = getLocalDateStr(); // e.g., "2026-01-26"
                await syncService.enqueue(m.meter_id, dailyLiters, todayDateStr);
                /*
                deprecated: mqttService.publishLive
                */
            }
        } catch (e) {
            console.error("Live publish failed", e);
        }
    });

    // SYNC JOB (Store-and-Forward Upload) - V1.3
    cron.schedule('*/5 * * * *', async () => {
        // Runs every 5 minutes
        await syncService.processQueue();
    });

    // STARTUP CHECK: Did we miss yesterday's close due to downtime/timezone bugs?
    setTimeout(async () => {
        try {
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);
            const yesterdayStr = getLocalDateStr(yesterday);

            // Check if we have data for yesterday
            const hasData = await db.get(`SELECT 1 FROM daily_snapshots WHERE date = ?`, [yesterdayStr]);

            if (!hasData) {
                console.log(`[Startup] Missing daily snapshot for ${yesterdayStr}. Running catch-up logic...`);

                // 1. Force "End of Day" snapshot relative to NOW (Best Effort)
                await runDailyProcessing(yesterdayStr);

                // 2. Reset "Start of Day" counters to current values so "Today" starts fresh
                console.log("[Startup] Resetting daily start counters to current values.");
                const meters = await db.all<MeterConfig>('SELECT * FROM meter_config WHERE enabled = 1');
                const newCounters = { ...modbusService.dailyStartCounters };

                for (const m of meters) {
                    const current = modbusService.latestCounters[m.meter_id];
                    if (current !== undefined) {
                        newCounters[m.meter_id] = current;
                    }
                }
                modbusService.setStartCounters(newCounters);
            }
        } catch (e) {
            console.error("[Startup] Failed to run catch-up logic:", e);
        }
    }, 10000); // Run 10s after boot to ensure Modbus has first poll
};

// Extracted Daily Processing Function (Reusable)
async function runDailyProcessing(customDateStr?: string) {
    try {
        const meters = await db.all<MeterConfig>('SELECT * FROM meter_config WHERE enabled = 1');
        const dateStr = customDateStr || getLocalDateStr();

        for (const meter of meters) {
            const currentCounter = modbusService.latestCounters[meter.meter_id] || 0;

            const lastSnapshot = await db.get<DailySnapshot>(
                `SELECT * FROM daily_snapshots WHERE meter_id = ? ORDER BY date DESC LIMIT 1`,
                [meter.meter_id]
            );

            let prevCounter = lastSnapshot ? lastSnapshot.counter_value_end_day : 0;

            if (!lastSnapshot) {
                const sessionStart = modbusService.dailyStartCounters[meter.meter_id];
                if (sessionStart !== undefined) {
                    prevCounter = sessionStart;
                } else {
                    prevCounter = currentCounter;
                }
            }

            let delta = 0;
            if (currentCounter >= prevCounter) {
                delta = currentCounter - prevCounter;
            } else {
                delta = (4294967295 - prevCounter) + currentCounter + 1;
            }

            const liters = delta * meter.pulse_volume_liters;

            await db.run(
                `INSERT OR REPLACE INTO daily_snapshots (meter_id, date, counter_value_end_day, counter_value_prev_day, delta_pulses, daily_liters) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [meter.meter_id, dateStr, currentCounter, prevCounter, delta, liters]
            );
        }
        console.log(`Daily processing completed for ${dateStr}`);
    } catch (e) {
        console.error("Daily processing failed:", e);
    }
}

// NEW: Monthly Aggregation Function (Runs Daily to keep Month-to-Date up to date)
async function runMonthlyProcessing(targetDate?: Date) {
    try {
        const meters = await db.all<MeterConfig>('SELECT * FROM meter_config WHERE enabled = 1');
        const now = targetDate || new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1; // 1-12

        const monthStr = `${year}-${String(month).padStart(2, '0')}`;

        for (const meter of meters) {
            // Aggregate all DAILY snapshots for this month so far
            const res = await db.get<{ sum_liters: number, count: number }>(
                `SELECT sum(daily_liters) as sum_liters, count(*) as count FROM daily_snapshots WHERE meter_id = ? AND date LIKE ?`,
                [meter.meter_id, `${monthStr}%`]
            );

            const monthlyLiters = res?.sum_liters || 0;
            const monthlyM3 = monthlyLiters / 1000;
            const count = res?.count || 0;

            await db.run(
                `INSERT INTO monthly_consumption (meter_id, year, month, monthly_liters, monthly_m3, source_days_count)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(meter_id, year, month) DO UPDATE SET monthly_liters=excluded.monthly_liters, monthly_m3=excluded.monthly_m3, source_days_count=excluded.source_days_count, created_at=CURRENT_TIMESTAMP`,
                [meter.meter_id, year, month, monthlyLiters, monthlyM3, count]
            );
        }
        console.log(`Monthly aggregation updated for ${monthStr}`);
    } catch (e) {
        console.error("Monthly aggregation failed:", e);
    }
}
