import fs from 'fs';
import path from 'path';

const STATE_FILE = path.join(process.cwd(), 'data', 'runtime_state.json');

export const saveRuntimeState = (state: any) => {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state));
    } catch (e) {
        console.error("Failed to save runtime state", e);
    }
};

export const loadRuntimeState = (): any | null => {
    try {
        if (fs.existsSync(STATE_FILE)) {
            // Safety: If state file is older than 24h, it's likely stale (system down or stuck).
            // Loading it would cause massive spikes if we just restarted.
            // Better to fall back to DB or current values.
            const stats = fs.statSync(STATE_FILE);
            const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);

            if (ageHours > 26) { // 26h buffer to allow for some drift/downtime, but preventing weeks-old data.
                console.warn(`[State] Runtime state file is stale (${ageHours.toFixed(1)} hours old). Ignoring.`);
                return null;
            }

            const raw = fs.readFileSync(STATE_FILE, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error("Failed to load runtime state", e);
    }
    return null;
};
