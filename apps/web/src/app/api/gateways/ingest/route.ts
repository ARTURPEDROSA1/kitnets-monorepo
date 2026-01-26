import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase/admin';

export async function POST(request: Request) {
    // 1. Authenticate the Gateway
    const token = request.headers.get('x-gateway-token');
    if (token !== process.env.GATEWAY_INGEST_KEY) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { readings } = body;

        if (!Array.isArray(readings) || readings.length === 0) {
            return NextResponse.json({ error: 'Invalid payload: readings array expected' }, { status: 400 });
        }

        const supabase = createAdminClient();

        // Deduplicate readings in this batch (Postgres upsert fails if batch contains duplicates for the same key)
        const uniqueReadings = Array.from(new Map(readings.map((r: any) => [`${r.meter_id}_${r.timestamp}`, r])).values());

        // 2. Insert Readings
        const { error } = await supabase
            .from('meter_readings')
            .upsert(
                uniqueReadings.map((r: any) => ({
                    meter_id: r.meter_id,
                    value: r.value,
                    read_at: r.timestamp,
                    synced_at: new Date().toISOString()
                })),
                { onConflict: 'meter_id, read_at' } // Idempotency
            );

        if (error) {
            console.error('Supabase Insert Error:', error);
            return NextResponse.json({ error: 'Database error', details: error.message, hint: error.hint }, { status: 500 });
        }

        return NextResponse.json({ success: true, count: readings.length });

    } catch (e) {
        console.error('Ingest Error:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
