import db from '../database/db';
import fetch from 'node-fetch';

interface QueuedReading {
    id: number;
    meter_id: string;
    value: number;
    timestamp: string;
}

export const syncService = {
    // Config (Load from DB later, hardcoded for now until UI update)
    apiUrl: 'https://kitnets.com/api/gateways/ingest', // Production URL
    token: process.env.GATEWAY_INGEST_KEY || 'MISSING_KEY',

    // State
    lastSyncSuccess: null as string | null,
    lastSyncResult: 'Idle' as string, // Debug info
    consecutiveFailures: 0,

    /**
     * Enqueues a reading to be synced.
     */
    async enqueue(meterId: string, value: number, timestamp: string) {
        try {
            await db.run(
                `INSERT INTO readings_queue (meter_id, value, timestamp) VALUES (?, ?, ?)`,
                [meterId, value, timestamp]
            );
        } catch (e) {
            console.error("Failed to enqueue reading:", e);
        }
    },

    /**
     * Process the queue: Pick oldest 50 -> Send -> Delete on Success
     */
    async processQueue(isManual = false) {
        if (!this.token || this.token === 'MISSING_KEY') {
            this.lastSyncResult = 'Error: No Gateway Token configured';
            console.warn('[Sync] No Ingest Key configured. Skipping sync.');
            return;
        }

        try {
            // 1. Get Batch
            const batch = await db.all<QueuedReading>(
                `SELECT * FROM readings_queue ORDER BY created_at ASC LIMIT 50`
            );

            if (batch.length === 0) {
                if (isManual) {
                    this.lastSyncResult = 'Queue Empty';
                    console.log('[Sync] Queue is empty.');
                }
                return;
            }

            console.log(`[Sync] Processing ${batch.length} readings...`);

            // 2. Send to Cloud
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-gateway-token': this.token
                },
                body: JSON.stringify({
                    readings: batch.map(r => ({
                        meter_id: r.meter_id,
                        value: r.value,
                        timestamp: r.timestamp
                    }))
                })
            });

            if (response.ok) {
                // 3. Delete from Local DB on Success
                const ids = batch.map(r => r.id).join(',');
                await db.run(`DELETE FROM readings_queue WHERE id IN (${ids})`);
                console.log(`[Sync] Successfully synced ${batch.length} readings.`);
                this.lastSyncSuccess = new Date().toISOString();
                this.lastSyncResult = `Success: Sent ${batch.length} items`;
                this.consecutiveFailures = 0; // Reset on success
            } else {
                const text = await response.text();
                this.lastSyncResult = `Failed: ${response.status} ${response.statusText} - ${text.substring(0, 50)}`;
                console.error(`[Sync] Failed: ${response.status} ${response.statusText}`);
                this.handleFailure();
            }
        } catch (e) {
            this.lastSyncResult = `Network Error: ${String(e)}`;
            console.error('[Sync] Network/Logic Error:', e);
            this.handleFailure();
        }
    },

    handleFailure() {
        this.consecutiveFailures++;
        console.warn(`[Sync] Consecutive Failure Count: ${this.consecutiveFailures}/10`);

        if (this.consecutiveFailures >= 10) {
            console.error(`[Sync] CRITICAL: 10 consecutive failures. Rebooting System to recover network...`);
            this.lastSyncResult = 'CRITICAL: Rebooting System...';

            // Execute Reboot
            const { exec } = require('child_process');
            exec('sudo reboot', (error: any, stdout: any, stderr: any) => {
                if (error) {
                    console.error(`[Sync] Reboot command failed: ${error.message}`);
                    return;
                }
                console.log(`[Sync] Reboot initiated.`);
            });
        }
    }
};
