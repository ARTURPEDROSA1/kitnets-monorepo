
import { createClient } from '../../../../utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    const { code, userId } = await request.json();

    if (!code || !userId) {
        return NextResponse.json({ error: 'Missing code or userId' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Check if gateway exists and is unclaimed
    const { data: gateway, error: fetchError } = await supabase
        .from('gateways')
        .select('*')
        .eq('serial_number', code)
        .single();

    if (fetchError || !gateway) {
        return NextResponse.json({ error: 'Invalid gateway code' }, { status: 404 });
    }

    if (gateway.status !== 'unclaimed') {
        return NextResponse.json({ error: 'Gateway already claimed' }, { status: 409 });
    }

    // 2. Link gateway to user
    // First get the user's profile ID (which is the UUID we inserted, linked to Clerk ID)
    // Actually, in our schema logic we used Clerk ID as a column but ID as UUID? 
    // Let's check schema: id uuid, clerk_id text.
    // We need to find the profile.id where clerk_id = userId

    const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('clerk_id', userId)
        .single();

    if (!profile) {
        return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const { error: updateError } = await supabase
        .from('gateways')
        .update({
            owner_id: profile.id,
            status: 'online', // Assume online or just 'claimed'
            label: 'My Gateway'
        })
        .eq('id', gateway.id);

    if (updateError) {
        return NextResponse.json({ error: 'Failed to claim gateway' }, { status: 500 });
    }

    return NextResponse.json({ success: true, gateway });
}
