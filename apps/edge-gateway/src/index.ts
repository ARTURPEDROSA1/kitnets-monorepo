import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import path from 'path';
import { CONFIG } from './config';
import { modbusService } from './services/modbus';
import { mqttService } from './services/mqtt';
import { startScheduler } from './services/scheduler';
import { getLocalDateStr } from "./utils/date";
import db from './database/db';
import { MeterConfig } from './types';

const server = Fastify({
    logger: true
});

server.register(cors, {
    origin: true
});

// Serve static frontend
server.register(staticFiles, {
    root: path.join(__dirname, '../client/dist'),
    prefix: '/',
    // Fallback?
    // SPA fallback: if file not found, serve index.html?
    // @fastify/static supports wildcards but for SPA fallback we usually register a wildcard route.
});

server.setNotFoundHandler((req, reply) => {
    // Check if API call
    if (req.raw.url && req.raw.url.startsWith('/api')) {
        reply.code(404).send({ error: 'Endpoint not found' });
    } else {
        // Serve index.html for client routing
        reply.sendFile('index.html');
    }
});

const BUILD_ID = Date.now().toString();

// API Routes
server.get('/api/health', async (request, reply) => {
    return {
        status: modbusService.status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        build_id: BUILD_ID,
        modbus_last_update: modbusService.lastUpdate,
        digital_input: modbusService.digitalInputRegisterValue
    };
});

// GET Settings (System + Meters)
server.get('/api/config', async (req, reply) => {
    const meters = await db.all('SELECT * FROM meter_config');
    const systemRows = await db.all<{ key: string, value: string }>('SELECT * FROM system_settings');

    // Merge DB settings into the CONFIG object for display
    const mergedConfig = JSON.parse(JSON.stringify(CONFIG)); // Deep copy defaults

    systemRows.forEach(row => {
        if (row.key === 'MODBUS_HOST') mergedConfig.MODBUS.HOST = row.value;
        if (row.key === 'POLL_INTERVAL_MS') mergedConfig.MODBUS.POLL_INTERVAL_MS = parseInt(row.value);
        if (row.key === 'MQTT_BROKER_URL') mergedConfig.MQTT.BROKER_URL = row.value;
    });

    return {
        config: mergedConfig,
        meters
    };
});

// Update System Settings
server.put('/api/settings', async (req, reply) => {
    const body = req.body as any;
    try {
        if (body.MODBUS_HOST) await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['MODBUS_HOST', body.MODBUS_HOST]);
        if (body.POLL_INTERVAL_MS) await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['POLL_INTERVAL_MS', String(body.POLL_INTERVAL_MS)]);
        if (body.MQTT_BROKER_URL) await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['MQTT_BROKER_URL', body.MQTT_BROKER_URL]);

        return { success: true };
    } catch (e) {
        server.log.error(e);
        reply.code(500).send({ error: "Failed to update settings" });
    }
});

// Restart Service
server.post('/api/restart', async (req, reply) => {
    setTimeout(() => {
        process.exit(0); // Systemd will restart it
    }, 1000);
    return { success: true, message: "Restarting..." };
});

server.put('/api/config', async (req, reply) => {
    const body = req.body as any;
    try {
        if (body.meters) {
            for (const m of body.meters) {
                await db.run(
                    `UPDATE meter_config SET display_name=?, pulse_volume_liters=?, counter_lsb_register=?, counter_msb_register=?, physical_meter_offset_m3=?, enabled=? WHERE meter_id=?`,
                    [m.display_name, m.pulse_volume_liters, m.counter_lsb_register, m.counter_msb_register, m.physical_meter_offset_m3, m.enabled, m.meter_id]
                );
            }
        }
        return { success: true };
    } catch (e) {
        server.log.error(e);
        reply.code(500).send({ error: "Failed to update config" });
    }
});

server.get('/api/meters/:id/daily', async (req: any, reply) => {
    const { id } = req.params;
    const history = await db.all<any>('SELECT * FROM daily_snapshots WHERE meter_id = ? ORDER BY date DESC LIMIT 365', [id]);

    // Inject "Today" live data if not present in DB
    const todayStr = new Date().toISOString().split('T')[0];
    const hasToday = history.some(r => r.date === todayStr);

    if (!hasToday) {
        // Calculate live today
        const meter = await db.get<MeterConfig>('SELECT * FROM meter_config WHERE meter_id = ?', [id]);
        if (meter) {
            const current = modbusService.latestCounters[id] || 0;
            const startOfDay = modbusService.dailyStartCounters[id] || current;

            let delta = 0;
            if (current >= startOfDay) delta = current - startOfDay;
            else delta = (4294967295 - startOfDay) + current + 1;

            const todayLiters = delta * meter.pulse_volume_liters;

            // Allow showing live bar even if 0, but usually charts handle 0 fine.
            history.unshift({
                id: -1, // temporary ID
                meter_id: id,
                date: todayStr,
                daily_liters: todayLiters,
                effective_m3: (meter.physical_meter_offset_m3 || 0) + ((current * meter.pulse_volume_liters) / 1000), // Approximate effective for chart tooltip if needed
                is_live: true // Flag for frontend if needed
            });
        }
    }

    return history;
});

server.get('/api/history-consolidated/:type', async (req: any, reply) => {
    const { type } = req.params;
    const isDaily = type === 'daily';
    const meters = await db.all<MeterConfig>('SELECT * FROM meter_config WHERE enabled = 1');

    // Grouped Result Map
    const dataMap: Record<string, any> = {};

    // 1. Fetch History from DB
    let records: any[] = [];
    if (isDaily) {
        records = await db.all('SELECT * FROM daily_snapshots ORDER BY date DESC LIMIT 365'); // Limit might affect total grouping if meters differ
        // Better: Select distinct dates first? No, just get all recent data.
        // Actually, for multiple meters, LIMIT 365 on the whole table is risky. 
        // We want last 30 days for ALL meters? Or last 365 days?
        // Let's do LIMIT 2000 to cover typically 5 meters * 365 days.
        records = await db.all('SELECT * FROM daily_snapshots WHERE date > date("now", "-60 days") ORDER BY date ASC');
    } else {
        records = await db.all('SELECT * FROM monthly_consumption ORDER BY year ASC, month ASC');
    }

    records.forEach(r => {
        const key = isDaily ? r.date : `${r.year}-${String(r.month).padStart(2, '0')}`;
        if (!dataMap[key]) dataMap[key] = { date: key };

        // Use Display Name or ID as key? 
        // Ideally use ID as key for data, and map to Name in frontend.
        // Value: Daily -> liters, Monthly -> m3
        dataMap[key][r.meter_id] = isDaily ? r.daily_liters : r.monthly_m3;
    });

    // 2. Inject TODAY (Live) data for Daily view
    if (isDaily) {
        const todayStr = getLocalDateStr();
        if (!dataMap[todayStr]) dataMap[todayStr] = { date: todayStr };

        for (const m of meters) {
            const current = modbusService.latestCounters[m.meter_id] || 0;
            let startOfDay = modbusService.dailyStartCounters[m.meter_id];
            if (startOfDay === undefined) startOfDay = current;

            let delta = 0;
            if (current >= startOfDay) delta = current - startOfDay;
            else delta = (4294967295 - startOfDay) + current + 1;

            const todayLiters = delta * m.pulse_volume_liters;

            // Only overwrite/set if not finalized in DB (which it shouldn't be for today)
            dataMap[todayStr][m.meter_id] = todayLiters;
        }
    }

    // Convert to Array and Sort
    return Object.values(dataMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
});

server.get('/api/meters/:id/monthly', async (req: any, reply) => {
    const { id } = req.params;
    const history = await db.all('SELECT * FROM monthly_consumption WHERE meter_id = ? ORDER BY year DESC, month DESC LIMIT 60', [id]);
    return history;
});

server.post('/api/meters/:id/reset', async (req: any, reply) => {
    const { id } = req.params;

    // Logic to map meter ID to counter index for reset
    // Default Map:
    // C1: 40023(LSB) -> Index 1
    // C2: 40025 -> Index 2
    // C3: 40027 -> Index 3
    // C4: 40029 -> Index 4
    // C5: 40031 -> Index 5

    try {
        const meter = await db.get<MeterConfig>('SELECT * FROM meter_config WHERE meter_id = ?', [id]);
        if (!meter) {
            reply.code(404).send({ error: "Meter not found" });
            return;
        }

        const base = 40023;
        const offset = meter.counter_lsb_register - base;

        let index = -1;
        // Check if registers match standard spacing
        if (offset >= 0 && offset % 2 === 0) {
            index = (offset / 2) + 1;
        }

        if (index < 1 || index > 32) { // 32 is max bits in 32-bit register usually, though Modbus reset likely supports fewer.
            // If we can't determine index, we fail for safety.
            reply.code(400).send({ error: "Cannot determine reset bit index from register address" });
            return;
        }

        await modbusService.resetCounter(index);
        return { success: true, message: `Counter ${index} reset triggered` };
    } catch (e) {
        reply.code(500).send({ error: "Reset failed", details: String(e) });
    }
});

server.post('/api/meters/poll', async (req, reply) => {
    await (modbusService as any).poll();
    return {
        latest: modbusService.latestCounters,
        digital: modbusService.digitalInputRegisterValue
    };
});

server.get('/api/dashboard', async (req, reply) => {
    const meters = await db.all<MeterConfig>('SELECT * FROM meter_config WHERE enabled = 1');
    const dbOk = await db.healthCheck();

    // Aggregations
    let total_effective_m3 = 0;
    let today_m3 = 0;
    let month_m3 = 0;
    let prev_month_m3 = 0;
    let yesterday_m3 = 0;
    let yesterday_liters = 0;

    const todayStr = getLocalDateStr();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const prevDate = new Date(currentYear, currentMonth - 2, 1); // prev month
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth() + 1;

    // Yesterday Date
    const yesterDate = new Date(now);
    yesterDate.setDate(yesterDate.getDate() - 1);
    const yesterdayStr = getLocalDateStr(yesterDate);

    // 1. Prev Month Total (from DB)
    const prevMonthRow = await db.get<{ sum: number }>(
        'SELECT sum(monthly_m3) as sum FROM monthly_consumption WHERE year = ? AND month = ?',
        [prevYear, prevMonth]
    );
    prev_month_m3 = prevMonthRow?.sum || 0;

    // 2. Yesterday Total (from DB)
    const yesterdayRow = await db.get<{ sum: number }>(
        'SELECT sum(daily_liters) as sum FROM daily_snapshots WHERE date = ?',
        [yesterdayStr]
    );
    yesterday_liters = yesterdayRow?.sum || 0;
    yesterday_m3 = yesterday_liters / 1000;

    // 3. This Month (Stored Days)
    const thisMonthStored = await db.get<{ sum: number }>(
        `SELECT sum(daily_liters) as sum FROM daily_snapshots WHERE date LIKE ? AND date < ?`,
        [`${currentYear}-${String(currentMonth).padStart(2, '0')}%`, todayStr]
    );
    const monthStoredM3 = (thisMonthStored?.sum || 0) / 1000;

    const meterData = meters.map(m => {
        const current = modbusService.latestCounters[m.meter_id] || 0;

        // Effective Total
        const raw = (current * m.pulse_volume_liters) / 1000;
        const effective = (m.physical_meter_offset_m3 || 0) + raw;
        total_effective_m3 += effective;

        // Today Live
        // If dailyStartCounters is missing (restarted mid-day without history), use current to report 0 for today
        // rather than full lifetime consumption which is confusing.
        // We ensure dailyStartCounters are populated in modbus service, but as fallback:
        // if startOfDay is 0, it implies we missed initialization. 
        // Better to explicitly check modbusService.dailyStartCounters
        let startOfDay = modbusService.dailyStartCounters[m.meter_id];

        if (startOfDay === undefined) {
            startOfDay = current; // Fallback to 0 consumption today if unknown
        }

        let delta = 0;
        if (current >= startOfDay) delta = current - startOfDay;
        else delta = (4294967295 - startOfDay) + current + 1;

        // Sanity check: if delta is impossibly high (e.g. > 100,000 pulses in a day for domestic) and startOfDay was suspiciously 0?
        // But startOfDay=0 is valid for a new meter. 
        // We trust the subtraction logic.

        const todayLiters = delta * m.pulse_volume_liters;
        today_m3 += (todayLiters / 1000);

        return {
            ...m,
            current_counter: current,
            status: modbusService.latestCounters[m.meter_id] !== undefined ? 'OK' : 'WAITING',
            effective_m3: effective
        };
    });

    month_m3 = monthStoredM3 + today_m3;
    const today_liters_aggregated = today_m3 * 1000;

    return {
        gateway_status: modbusService.status,
        db_status: dbOk ? 'OK' : 'ERROR',
        uptime: process.uptime(),
        digital_input: modbusService.digitalInputRegisterValue,
        meters: meterData,
        last_update: modbusService.lastUpdate,
        aggregates: {
            total_effective_m3,
            today_m3,
            today_liters: today_liters_aggregated,
            yesterday_m3,
            yesterday_liters,
            month_m3,
            prev_month_m3
        }
    };
});


const start = async () => {
    try {
        // Load System Settings overrides
        const settings = await db.all<{ key: string, value: string }>('SELECT * FROM system_settings');
        settings.forEach(row => {
            if (row.key === 'MODBUS_HOST') CONFIG.MODBUS.HOST = row.value;
            if (row.key === 'POLL_INTERVAL_MS') CONFIG.MODBUS.POLL_INTERVAL_MS = parseInt(row.value);
            if (row.key === 'MQTT_BROKER_URL') CONFIG.MQTT.BROKER_URL = row.value;
        });

        console.log("Starting with Config:", JSON.stringify(CONFIG, null, 2));

        await modbusService.start();
        mqttService.start(); // Start MQTT lazy
        startScheduler();

        await server.listen({ port: CONFIG.SERVER.PORT, host: CONFIG.SERVER.HOST });
        console.log(`Server listening at http://${CONFIG.SERVER.HOST}:${CONFIG.SERVER.PORT}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
