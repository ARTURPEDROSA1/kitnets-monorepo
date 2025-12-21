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
            const raw = fs.readFileSync(STATE_FILE, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error("Failed to load runtime state", e);
    }
    return null;
};
