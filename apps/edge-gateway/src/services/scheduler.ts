import cron from 'node-cron';
import { modbusService } from './modbus';
import { mqttService } from './mqtt';
import db from '../database/db';
import { DailySnapshot, MeterConfig } from '../types';

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
        try {
            const meters = await db.all<MeterConfig>('SELECT * FROM meter_config WHERE enabled = 1');
            const today = new Date().toISOString().split('T')[0];

            for (const meter of meters) {
                const currentCounter = modbusService.latestCounters[meter.meter_id] || 0;

                // Get previous day snapshot to calc delta
                const lastSnapshot = await db.get<DailySnapshot>(
                    `SELECT * FROM daily_snapshots WHERE meter_id = ? ORDER BY date DESC LIMIT 1`,
                    [meter.meter_id]
                );

                let prevCounter = lastSnapshot ? lastSnapshot.counter_value_end_day : 0;

                // Handle Wrap-around (32-bit). Max 4,294,967,295.
                // If current < prev, likely wrap around.
                let delta = 0;
                if (currentCounter >= prevCounter) {
                    delta = currentCounter - prevCounter;
                } else {
                    // Wrap around
                    delta = (4294967295 - prevCounter) + currentCounter + 1;
                }

                const liters = delta * meter.pulse_volume_liters;

                // Insert snapshot
                await db.run(
                    `INSERT INTO daily_snapshots (meter_id, date, counter_value_end_day, counter_value_prev_day, delta_pulses, daily_liters) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [meter.meter_id, today, currentCounter, prevCounter, delta, liters]
                );

                // Publish MQTT
                mqttService.publishDaily(meter.meter_id, {
                    date: today,
                    liters,
                    counter: currentCounter
                });
            }
        } catch (e) {
            console.error("Daily processing failed:", e);
        }
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

};
