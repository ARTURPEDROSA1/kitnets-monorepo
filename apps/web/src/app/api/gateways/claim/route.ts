
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Use service role key to bypass RLS — this API route runs server-side only.
// Required because unclaimed gateways (owner_id=NULL) are invisible under RLS.
function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase service credentials');
    return createClient(url, key);
}

export async function POST(request: Request) {
    const { code, userId } = await request.json();

    if (!code || !userId) {
        return NextResponse.json({ error: 'Missing code or userId' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // 1. Check if gateway exists and is unclaimed
    const { data: gateway, error: fetchError } = await supabase
        .from('gateways')
        .select('*')
        .eq('serial_number', code)
        .single();

    if (fetchError || !gateway) {
        console.error('[Claim] Gateway lookup failed:', fetchError?.message, 'code:', code);
        return NextResponse.json({ error: 'Invalid gateway code' }, { status: 404 });
    }

    if (gateway.status !== 'unclaimed') {
        return NextResponse.json({ error: 'Gateway already claimed' }, { status: 409 });
    }

    // 2. Find the user's profile
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('clerk_id', userId)
        .single();

    if (profileError || !profile) {
        console.error('[Claim] Profile lookup failed:', profileError?.message, 'clerk_id:', userId);
        return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // 3. Claim the gateway — link to user's profile
    const { error: updateError } = await supabase
        .from('gateways')
        .update({
            owner_id: profile.id,
            status: 'online',
            label: gateway.label || 'My Gateway' // Preserve existing label
        })
        .eq('id', gateway.id);

    if (updateError) {
        console.error('[Claim] Gateway update failed:', updateError.message);
        return NextResponse.json({ error: 'Failed to claim gateway' }, { status: 500 });
    }

    console.log('[Claim] Gateway', code, 'claimed by profile', profile.id);
    return NextResponse.json({ success: true, gateway: { ...gateway, owner_id: profile.id, status: 'online' } });
}
