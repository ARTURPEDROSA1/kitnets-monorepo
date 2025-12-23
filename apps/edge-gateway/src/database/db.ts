import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'kitnets-gateway.db');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

export class DatabaseService {
    private db: sqlite3.Database;

    constructor() {
        this.db = new sqlite3.Database(DB_PATH);
        this.init();
    }

    private init() {
        this.db.serialize(() => {
            // system_settings (v1.2)
            this.db.run(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY, 
                value TEXT
            )`);

            // meter_config
            this.db.run(`
            CREATE TABLE IF NOT EXISTS meter_config (
                meter_id TEXT PRIMARY KEY, 
                display_name TEXT,
                pulse_volume_liters REAL DEFAULT 10.0,
                counter_lsb_register INTEGER,
                counter_msb_register INTEGER,
                physical_meter_offset_m3 REAL DEFAULT 0.0, -- V1.2
                enabled INTEGER DEFAULT 1,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Migration for V1.2: Add physical_meter_offset_m3 if missing
            this.db.all("PRAGMA table_info(meter_config)", (err, rows: any[]) => {
                if (!err && rows) {
                    const hasCol = rows.some(r => r.name === 'physical_meter_offset_m3');
                    if (!hasCol) {
                        this.db.run(`ALTER TABLE meter_config ADD COLUMN physical_meter_offset_m3 REAL DEFAULT 0.0`);
                        console.log("Migrated: Added physical_meter_offset_m3 to meter_config");
                    }
                }
            });

            // daily_snapshots
            this.db.run(`
            CREATE TABLE IF NOT EXISTS daily_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meter_id TEXT REFERENCES meter_config(meter_id),
                date TEXT, 
                counter_value_end_day INTEGER,
                counter_value_prev_day INTEGER,
                delta_pulses INTEGER,
                daily_liters REAL,
                effective_m3 REAL DEFAULT 0.0, -- V1.2
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(meter_id, date)
            )`);

            // Migration for V1.2: Add effective_m3 if missing
            this.db.all("PRAGMA table_info(daily_snapshots)", (err, rows: any[]) => {
                if (!err && rows) {
                    const hasCol = rows.some(r => r.name === 'effective_m3');
                    if (!hasCol) {
                        this.db.run(`ALTER TABLE daily_snapshots ADD COLUMN effective_m3 REAL DEFAULT 0.0`);
                        console.log("Migrated: Added effective_m3 to daily_snapshots");
                    }
                }
            });

            // monthly_consumption
            this.db.run(`
            CREATE TABLE IF NOT EXISTS monthly_consumption (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meter_id TEXT REFERENCES meter_config(meter_id),
                year INTEGER,
                month INTEGER, 
                monthly_liters REAL,
                monthly_m3 REAL,
                source_days_count INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(meter_id, year, month)
            )`);

            // Seed defaults...
            this.db.get("SELECT count(*) as c FROM meter_config", [], (err, row: any) => {
                if (!err && row && row.c === 0) {
                    // ... seeding logic ...
                    const defaults = [
                        { meter_id: 'HIDROMETRO35', display_name: 'Kitnet c/ Garagem', pulse_volume_liters: 10, counter_lsb_register: 40023, counter_msb_register: 40024 },
                        { meter_id: 'HIDROMETRO35A', display_name: 'Kitnet 35A', pulse_volume_liters: 10, counter_lsb_register: 40025, counter_msb_register: 40026 },
                        { meter_id: 'HIDROMETRO35B', display_name: 'Kitnet 35B', pulse_volume_liters: 10, counter_lsb_register: 40027, counter_msb_register: 40028 },
                        { meter_id: 'HIDROMETRO35C', display_name: 'Kitnet 35C', pulse_volume_liters: 10, counter_lsb_register: 40029, counter_msb_register: 40030 },
                        { meter_id: 'HIDROMETRO35D', display_name: 'Casa 35D', pulse_volume_liters: 10, counter_lsb_register: 40031, counter_msb_register: 40032 },
                    ];
                    const stmt = this.db.prepare(`INSERT INTO meter_config (meter_id, display_name, pulse_volume_liters, counter_lsb_register, counter_msb_register) VALUES (?, ?, ?, ?, ?)`);
                    defaults.forEach(d => {
                        stmt.run(d.meter_id, d.display_name, d.pulse_volume_liters, d.counter_lsb_register, d.counter_msb_register);
                    });
                    stmt.finalize();
                    console.log("Seeded default meters.");
                }
            });

            // Cleanup Anomalies (Fix for "Start of Day" reset bug)
            // If consumption is > 50,000 Liters in one day, it's definitely an error for these units.
            this.db.run(`DELETE FROM daily_snapshots WHERE daily_liters > 50000`, (err) => {
                if (!err) console.log("Cleaned up anomalous daily snapshots.");
            });

            // Cleanup Future Dates (Fix for UTC/Local mismatch)
            this.db.run(`DELETE FROM daily_snapshots WHERE date > date('now', 'localtime')`, (err) => {
                if (!err) console.log("Cleaned up future daily snapshots.");
            });
        });
    }

    public get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row as T);
            });
        });
    }

    public all<T>(sql: string, params: any[] = []): Promise<T[]> {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows as T[]);
            });
        });
    }

    public run(sql: string, params: any[] = []): Promise<{ lastID: number, changes: number }> {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    public healthCheck(): Promise<boolean> {
        return new Promise((resolve) => {
            this.db.get("SELECT 1", (err) => {
                if (err) resolve(false);
                else resolve(true);
            });
        });
    }
}

const db = new DatabaseService();
export default db;
