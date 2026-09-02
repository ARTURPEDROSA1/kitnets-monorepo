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
 * GET /api/leases/dropdowns
 * Returns properties, tenants, agencies, and agents for form dropdowns.
 */
export async function GET() {
    try {
        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const supabase = getServiceSupabase();

        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('clerk_id', user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({
                properties: [],
                tenants: [],
                agencies: [],
                agents: [],
            });
        }

        // Fetch all dropdown data in parallel
        const [propertiesRes, tenantsRes, agenciesRes, agentsRes] = await Promise.all([
            supabase
                .from('properties')
                .select('id, name')
                .eq('owner_id', profile.id)
                .order('name', { ascending: true }),
            supabase
                .from('tenants')
                .select('id, full_name')
                .eq('user_id', profile.id)
                .is('deleted_at', null)
                .order('full_name', { ascending: true }),
            supabase
                .from('agencies')
                .select('id, name')
                .eq('user_id', profile.id)
                .is('deleted_at', null)
                .order('name', { ascending: true }),
            supabase
                .from('agents')
                .select('id, full_name, agency_id')
                .eq('user_id', profile.id)
                .is('deleted_at', null)
                .order('full_name', { ascending: true }),
        ]);

        return NextResponse.json({
            properties: propertiesRes.data || [],
            tenants: tenantsRes.data || [],
            agencies: agenciesRes.data || [],
            agents: agentsRes.data || [],
        });
    } catch (err) {
        console.error('[Leases Dropdowns GET] Error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
