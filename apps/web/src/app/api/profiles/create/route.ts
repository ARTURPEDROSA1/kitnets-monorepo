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
        const { clerkId, fullName, email, role } = await request.json();

        if (!clerkId || !email) {
            return NextResponse.json({ error: 'Missing clerkId or email' }, { status: 400 });
        }

        const supabase = getServiceSupabase();
        const cleanEmail = email.trim().toLowerCase();

        // 1. Check if profile already exists by clerk_id
        const { data: existingByClerk } = await supabase
            .from('profiles')
            .select('*')
            .eq('clerk_id', clerkId)
            .maybeSingle();

        if (existingByClerk) {
            console.log('[Profile Create] Profile already exists for clerk_id:', clerkId);
            return NextResponse.json({ success: true, profile: existingByClerk, existing: true });
        }

        // 2. Check if profile exists by email (case-insensitive) - handles re-signups / OAuth / changed Clerk ID
        const { data: existingByEmail } = await supabase
            .from('profiles')
            .select('*')
            .ilike('email', cleanEmail)
            .maybeSingle();

        if (existingByEmail) {
            console.log(`[Profile Create] Re-linking existing profile ${existingByEmail.id} to new clerk_id ${clerkId}`);
            const updatePayload: Record<string, unknown> = {
                clerk_id: clerkId,
                email: cleanEmail,
                updated_at: new Date().toISOString()
            };
            if (fullName && (!existingByEmail.full_name || existingByEmail.full_name === 'EMPTY')) {
                updatePayload.full_name = fullName;
            }
            if (role && !existingByEmail.role) {
                updatePayload.role = role;
            }
            // Clean up unconfigured profile legacy default 'single'
            if (existingByEmail.property_type === 'single' &&
                (!existingByEmail.property_address || Object.keys(existingByEmail.property_address).length === 0) &&
                (!existingByEmail.property_details || Object.keys(existingByEmail.property_details).length === 0)) {
                updatePayload.property_type = null;
                updatePayload.property_address = null;
                updatePayload.property_details = null;
            }

            const { data: updated, error: updateError } = await supabase
                .from('profiles')
                .update(updatePayload)
                .eq('id', existingByEmail.id)
                .select()
                .single();

            if (updateError) {
                console.error('[Profile Create] Update error linking clerk_id:', updateError);
                return NextResponse.json({ error: updateError.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, profile: updated, linked: true });
        }

        // 3. Create new profile (starts with 0 properties; user creates explicitly)
        const { data: profile, error } = await supabase
            .from('profiles')
            .insert({
                id: crypto.randomUUID(),
                clerk_id: clerkId,
                role: role || 'landlord',
                full_name: fullName || '',
                email: cleanEmail,
                property_type: null,
                property_address: null,
                property_details: null,
                additional_properties: []
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
