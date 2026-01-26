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
    async processQueue() {
        if (!this.token || this.token === 'MISSING_KEY') {
            console.warn('[Sync] No Ingest Key configured. Skipping sync.');
            return;
        }

        try {
            // 1. Get Batch
            const batch = await db.all<QueuedReading>(
                `SELECT * FROM readings_queue ORDER BY created_at ASC LIMIT 50`
            );

            if (batch.length === 0) return; // Empty queue

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
            } else {
                console.error(`[Sync] Failed: ${response.status} ${response.statusText}`);
                // Increment retry count ? (Optional, currently just stays in queue)
            }
        } catch (e) {
            console.error('[Sync] Network/Logic Error:', e);
        }
    }
};
