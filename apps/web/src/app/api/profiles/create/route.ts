import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Use service role key to bypass RLS — this is a server-side API route.
// Required because the browser anon client doesn't have a JWT yet
// at the moment of signup (Clerk session was just created).
function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase service credentials');
    return createClient(url, key);
}

export async function POST(request: Request) {
    try {
        const { clerkId, fullName, email } = await request.json();

        if (!clerkId || !email) {
            return NextResponse.json({ error: 'Missing clerkId or email' }, { status: 400 });
        }

        const supabase = getServiceSupabase();

        // Check if profile already exists (prevent duplicates)
        const { data: existing } = await supabase
            .from('profiles')
            .select('id')
            .eq('clerk_id', clerkId)
            .maybeSingle();

        if (existing) {
            console.log('[Profile Create] Profile already exists for clerk_id:', clerkId);
            return NextResponse.json({ success: true, profile: existing, existing: true });
        }

        // Create new profile
        const { data: profile, error } = await supabase
            .from('profiles')
            .insert({
                id: crypto.randomUUID(),
                clerk_id: clerkId,
                role: 'landlord',
                full_name: fullName || '',
                email: email
            })
            .select()
            .single();

        if (error) {
            console.error('[Profile Create] Insert error:', error.message, error.code);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log('[Profile Create] Created profile:', profile.id, 'for clerk_id:', clerkId);
        return NextResponse.json({ success: true, profile });
    } catch (err) {
        console.error('[Profile Create] Unexpected error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
