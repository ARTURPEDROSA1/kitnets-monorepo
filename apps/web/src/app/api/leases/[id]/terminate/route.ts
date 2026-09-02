import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase service credentials');
    return createClient(url, key);
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/leases/[id]/terminate
 * Terminates a lease — sets status, date, and reason without deleting.
 */
export async function POST(request: Request, context: RouteContext) {
    try {
        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const { id: leaseId } = await context.params;
        const supabase = getServiceSupabase();

        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('clerk_id', user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
        }

        // Verify ownership
        const { data: lease } = await supabase
            .from('leases')
            .select('id, status')
            .eq('id', leaseId)
            .eq('user_id', profile.id)
            .is('deleted_at', null)
            .maybeSingle();

        if (!lease) {
            return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 });
        }

        if (lease.status === 'TERMINATED') {
            return NextResponse.json({ error: 'Contrato já foi rescindido.' }, { status: 400 });
        }

        if (lease.status === 'CANCELLED') {
            return NextResponse.json({ error: 'Contrato cancelado não pode ser rescindido.' }, { status: 400 });
        }

        const body = await request.json();

        // Validate termination date
        if (!body.termination_date) {
            return NextResponse.json({
                errors: { termination_date: 'Data de rescisão é obrigatória.' }
            }, { status: 400 });
        }

        const { data: updated, error: updateError } = await supabase
            .from('leases')
            .update({
                status: 'TERMINATED',
                termination_date: body.termination_date,
                termination_reason: body.termination_reason?.trim() || null,
                notes: body.notes?.trim() || lease.status,  // Preserve existing notes, append if new provided
            })
            .eq('id', leaseId)
            .select()
            .single();

        if (updateError) {
            console.error('[Lease Terminate] Update error:', updateError);
            return NextResponse.json({ error: 'Erro ao rescindir contrato.' }, { status: 500 });
        }

        return NextResponse.json({ lease: updated, message: 'Contrato rescindido com sucesso.' });
    } catch (err) {
        console.error('[Lease Terminate] Error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
