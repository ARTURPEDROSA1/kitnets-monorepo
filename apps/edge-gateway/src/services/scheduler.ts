import cron from 'node-cron';
import { modbusService } from './modbus';
import { mqttService } from './mqtt';
import db from '../database/db';
import { DailySnapshot, MeterConfig } from '../types';

import { getLocalDateStr } from '../utils/date';

export const startScheduler = () => {
    // Scheduler for V1.2

    // Reset Daily Counters for live tracking at 00:00
    cron.schedule('0 0 * * *', async () => {
        console.log("Resetting daily start counters...");
        const meters = await db.all<MeterConfig>('SELECT * FROM meter_config WHERE enabled = 1');
        for (const m of meters) {
            const current = modbusService.latestCounters[m.meter_id];
            if (current !== undefined) {
                modbusService.dailyStartCounters[m.meter_id] = current;
            }
        }
    });

    // Daily processing at 23:59
    cron.schedule('59 23 * * *', async () => {
        console.log("Running daily processing...");
        await runDailyProcessing();
    });

    // Monthly Processing: 00:01 1st day of month
    cron.schedule('1 0 1 * *', async () => {
        console.log("Running monthly processing...");
        try {
            const meters = await db.all<MeterConfig>('SELECT * FROM meter_config WHERE enabled = 1');
            const now = new Date();
            // We want the *previous* month.
            const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const year = prevMonthDate.getFullYear();
            const month = prevMonthDate.getMonth() + 1; // 1-12

            const monthStr = `${year}-${String(month).padStart(2, '0')}`;

            for (const meter of meters) {
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
                     ON CONFLICT(meter_id, year, month) DO UPDATE SET monthly_liters=excluded.monthly_liters, monthly_m3=excluded.monthly_m3`,
                    [meter.meter_id, year, month, monthlyLiters, monthlyM3, count]
                );

                mqttService.publishMonthly(meter.meter_id, {
                    year, month,
                    monthlyLiters,
                    monthlyM3
                });
            }
        } catch (e) {
            console.error("Monthly processing failed:", e);
        }
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

                mqttService.publishLive(m.meter_id, {
                    meter: m.meter_id,
                    timestamp: now.toISOString(),
                    pulse_count: current,
                    raw_gateway_m3: raw_m3,
                    offset_m3: offset,
                    effective_m3: effective_m3,
                    daily_liters_so_far: dailyLiters
                });
            }
        } catch (e) {
            console.error("Live publish failed", e);
        }
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
                for (const m of meters) {
                    const current = modbusService.latestCounters[m.meter_id];
                    if (current !== undefined) {
                        modbusService.dailyStartCounters[m.meter_id] = current;
                    }
                }
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

            mqttService.publishDaily(meter.meter_id, {
                date: dateStr,
                liters,
                counter: currentCounter
            });
        }
        console.log(`Daily processing completed for ${dateStr}`);
    } catch (e) {
        console.error("Daily processing failed:", e);
    }
}
