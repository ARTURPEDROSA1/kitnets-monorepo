import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase service credentials');
    return createClient(url, key);
}

/**
 * GET /api/tenants/properties
 * Returns a simplified list of the user's properties for the tenant form dropdown.
 */
export async function GET() {
    try {
        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const supabase = getServiceSupabase();

        // Find user's profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('clerk_id', user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ properties: [] });
        }

        // Fetch user's properties
        const { data: properties, error } = await supabase
            .from('properties')
            .select('id, name')
            .eq('owner_id', profile.id)
            .order('name', { ascending: true });

        if (error) {
            console.error('[Tenants Properties GET] Error:', error);
            return NextResponse.json({ properties: [] });
        }

        return NextResponse.json({ properties: properties || [] });
    } catch (err) {
        console.error('[Tenants Properties GET] Error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
