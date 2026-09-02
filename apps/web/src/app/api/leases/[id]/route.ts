import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase service credentials');
    return createClient(url, key);
}

function parseCurrency(value: string): number {
    if (!value) return 0;
    const cleaned = value.replace(/[R$\s.]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

const VALID_STATUSES = ['DRAFT', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'TERMINATED', 'CANCELLED'];
const VALID_MANAGEMENT = ['SELF_MANAGED', 'AGENCY', 'AGENT'];
const VALID_ADJUSTMENT = ['IPCA', 'IGP_M', 'INPC', 'IVAR', 'CUSTOM', 'NONE', ''];
const VALID_CHARGE_TYPES = ['CONDOMINIUM', 'IPTU', 'WATER', 'ELECTRICITY', 'GAS', 'INTERNET', 'OTHER'];
const VALID_RESPONSIBILITIES = ['TENANT', 'LANDLORD', 'INCLUDED'];
const VALID_TENANT_ROLES = ['CO_TENANT', 'OCCUPANT'];

type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/leases/[id] ─────────────────────────────────────────────

export async function GET(_request: Request, context: RouteContext) {
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

        // Fetch lease with joined names
        const { data: lease, error } = await supabase
            .from('leases')
            .select(`
                *,
                property:properties!property_id(name),
                primary_tenant:tenants!primary_tenant_id(full_name),
                agency:agencies!agency_id(name),
                agent:agents!agent_id(full_name)
            `)
            .eq('id', leaseId)
            .eq('user_id', profile.id)
            .is('deleted_at', null)
            .maybeSingle();

        if (error || !lease) {
            return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 });
        }

        // Fetch related data
        const [tenantsRes, chargesRes, docsRes] = await Promise.all([
            supabase
                .from('lease_tenants')
                .select('*, tenant:tenants!tenant_id(full_name)')
                .eq('lease_id', leaseId),
            supabase
                .from('lease_charges')
                .select('*')
                .eq('lease_id', leaseId),
            supabase
                .from('lease_documents')
                .select('*')
                .eq('lease_id', leaseId)
                .order('uploaded_at', { ascending: false }),
        ]);

        const formatted = {
            ...lease,
            property_name: (lease.property as Record<string, unknown>)?.name || null,
            primary_tenant_name: (lease.primary_tenant as Record<string, unknown>)?.full_name || null,
            agency_name: (lease.agency as Record<string, unknown>)?.name || null,
            agent_name: (lease.agent as Record<string, unknown>)?.full_name || null,
            property: undefined,
            primary_tenant: undefined,
            agency: undefined,
            agent: undefined,
            additional_tenants: (tenantsRes.data || []).map((t: Record<string, unknown>) => ({
                ...t,
                tenant_name: (t.tenant as Record<string, unknown>)?.full_name || null,
                tenant: undefined,
            })),
            charges: chargesRes.data || [],
            documents: docsRes.data || [],
        };

        return NextResponse.json({ lease: formatted });
    } catch (err) {
        console.error('[Lease GET] Error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

// ── PUT /api/leases/[id] ─────────────────────────────────────────────

export async function PUT(request: Request, context: RouteContext) {
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

        // Verify lease exists and belongs to user
        const { data: existingLease } = await supabase
            .from('leases')
            .select('id')
            .eq('id', leaseId)
            .eq('user_id', profile.id)
            .is('deleted_at', null)
            .maybeSingle();

        if (!existingLease) {
            return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 });
        }

        const body = await request.json();

        // ── Validation ───────────────────────────────────────────────
        const errors: Record<string, string> = {};

        if (!body.property_id) errors.property_id = 'Selecione um imóvel.';
        if (!body.primary_tenant_id) errors.primary_tenant_id = 'Selecione um inquilino.';
        if (!body.management_type || !VALID_MANAGEMENT.includes(body.management_type)) {
            errors.management_type = 'Tipo de gestão é obrigatório.';
        }
        if (body.management_type === 'AGENCY' && !body.agency_id) {
            errors.agency_id = 'Selecione a imobiliária.';
        }
        if (body.management_type === 'AGENT' && !body.agent_id) {
            errors.agent_id = 'Selecione o corretor.';
        }
        if (!body.start_date) errors.start_date = 'Data de início é obrigatória.';
        if (body.end_date && body.start_date && body.end_date <= body.start_date) {
            errors.end_date = 'Data de término deve ser posterior à data de início.';
        }

        const monthlyRent = parseCurrency(body.monthly_rent);
        if (!body.monthly_rent || monthlyRent <= 0) {
            errors.monthly_rent = 'Valor do aluguel deve ser maior que zero.';
        }

        const dueDay = parseInt(body.rent_due_day, 10);
        if (!body.rent_due_day || isNaN(dueDay) || dueDay < 1 || dueDay > 31) {
            errors.rent_due_day = 'Dia de vencimento deve ser entre 1 e 31.';
        }

        const status = body.status || 'ACTIVE';
        if (!VALID_STATUSES.includes(status)) {
            errors.status = 'Status inválido.';
        }

        if (Object.keys(errors).length > 0) {
            return NextResponse.json({ errors }, { status: 400 });
        }

        // ── Ownership verification ───────────────────────────────────

        const { data: property } = await supabase
            .from('properties')
            .select('id')
            .eq('id', body.property_id)
            .eq('owner_id', profile.id)
            .maybeSingle();

        if (!property) {
            return NextResponse.json({
                errors: { property_id: 'Imóvel não encontrado.' }
            }, { status: 400 });
        }

        const { data: tenantCheck } = await supabase
            .from('tenants')
            .select('id')
            .eq('id', body.primary_tenant_id)
            .eq('user_id', profile.id)
            .is('deleted_at', null)
            .maybeSingle();

        if (!tenantCheck) {
            return NextResponse.json({
                errors: { primary_tenant_id: 'Inquilino não encontrado.' }
            }, { status: 400 });
        }

        // Verify agency if applicable
        if (body.management_type === 'AGENCY' && body.agency_id) {
            const { data: agencyMember } = await supabase
                .from('agency_members')
                .select('id')
                .eq('agency_id', body.agency_id)
                .eq('user_id', profile.id)
                .maybeSingle();

            if (!agencyMember) {
                // Fallback: check if agency exists and is not deleted
                const { data: agency } = await supabase
                    .from('agencies')
                    .select('id')
                    .eq('id', body.agency_id)
                    .is('deleted_at', null)
                    .maybeSingle();

                if (!agency) {
                    return NextResponse.json({
                        errors: { agency_id: 'Imobiliária não encontrada.' }
                    }, { status: 400 });
                }
            }
        }

        // Verify agent if applicable
        if (body.agent_id && ['AGENCY', 'AGENT'].includes(body.management_type)) {
            const { data: agentRow } = await supabase
                .from('agents')
                .select('id, agency_id')
                .eq('id', body.agent_id)
                .eq('user_id', profile.id)
                .is('deleted_at', null)
                .maybeSingle();

            if (!agentRow) {
                return NextResponse.json({
                    errors: { agent_id: 'Corretor não encontrado.' }
                }, { status: 400 });
            }
        }

        // ── Active lease warning ─────────────────────────────────────
        let warning: string | null = null;
        if (status === 'ACTIVE') {
            const { data: existingActive } = await supabase
                .from('leases')
                .select('id, reference_name')
                .eq('property_id', body.property_id)
                .eq('user_id', profile.id)
                .eq('status', 'ACTIVE')
                .is('deleted_at', null)
                .neq('id', leaseId)
                .limit(1);

            if (existingActive && existingActive.length > 0) {
                warning = `Este imóvel já possui outro contrato ativo: "${existingActive[0].reference_name || 'Sem referência'}".`;
            }
        }

        // ── Update lease ─────────────────────────────────────────────

        const securityDeposit = body.security_deposit ? parseCurrency(body.security_deposit) : null;
        const depositMonths = body.deposit_months ? parseInt(body.deposit_months, 10) : null;
        const adjFreq = body.adjustment_frequency ? parseInt(body.adjustment_frequency, 10) : 12;

        const leaseData = {
            reference_name: body.reference_name?.trim() || null,
            property_id: body.property_id,
            primary_tenant_id: body.primary_tenant_id,
            management_type: body.management_type,
            agency_id: body.management_type === 'AGENCY' ? (body.agency_id || null) : null,
            agent_id: ['AGENCY', 'AGENT'].includes(body.management_type) ? (body.agent_id || null) : null,
            start_date: body.start_date,
            end_date: body.end_date?.trim() || null,
            monthly_rent: monthlyRent,
            rent_due_day: dueDay,
            security_deposit: securityDeposit,
            deposit_months: depositMonths && !isNaN(depositMonths) ? depositMonths : null,
            adjustment_index: body.adjustment_index && VALID_ADJUSTMENT.includes(body.adjustment_index) && body.adjustment_index !== ''
                ? body.adjustment_index : null,
            adjustment_frequency: adjFreq && !isNaN(adjFreq) ? adjFreq : 12,
            next_adjustment_date: body.next_adjustment_date?.trim() || null,
            status,
            notes: body.notes?.trim() || null,
        };

        const { data: lease, error: updateError } = await supabase
            .from('leases')
            .update(leaseData)
            .eq('id', leaseId)
            .select()
            .single();

        if (updateError) {
            console.error('[Lease PUT] Update error:', updateError);
            return NextResponse.json({ error: 'Erro ao atualizar contrato.' }, { status: 500 });
        }

        // ── Replace additional tenants ───────────────────────────────

        await supabase.from('lease_tenants').delete().eq('lease_id', leaseId);

        if (body.additional_tenants && Array.isArray(body.additional_tenants) && body.additional_tenants.length > 0) {
            const tenantRows = body.additional_tenants
                .filter((t: { tenant_id: string; role: string }) => t.tenant_id && VALID_TENANT_ROLES.includes(t.role))
                .map((t: { tenant_id: string; role: string }) => ({
                    lease_id: leaseId,
                    tenant_id: t.tenant_id,
                    role: t.role,
                }));

            if (tenantRows.length > 0) {
                await supabase.from('lease_tenants').insert(tenantRows);
            }
        }

        // ── Replace charges ──────────────────────────────────────────

        await supabase.from('lease_charges').delete().eq('lease_id', leaseId);

        if (body.charges && Array.isArray(body.charges) && body.charges.length > 0) {
            const chargeRows = body.charges
                .filter((c: { charge_type: string; responsibility: string }) =>
                    VALID_CHARGE_TYPES.includes(c.charge_type) &&
                    VALID_RESPONSIBILITIES.includes(c.responsibility)
                )
                .map((c: { charge_type: string; label?: string; responsibility: string; amount?: string }) => ({
                    lease_id: leaseId,
                    charge_type: c.charge_type,
                    label: c.label?.trim() || null,
                    responsibility: c.responsibility,
                    amount: c.amount ? parseCurrency(c.amount) : null,
                }));

            if (chargeRows.length > 0) {
                await supabase.from('lease_charges').insert(chargeRows);
            }
        }

        return NextResponse.json({ lease, warning });
    } catch (err) {
        console.error('[Lease PUT] Error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

// ── DELETE /api/leases/[id] ──────────────────────────────────────────

export async function DELETE(_request: Request, context: RouteContext) {
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
            .select('id')
            .eq('id', leaseId)
            .eq('user_id', profile.id)
            .is('deleted_at', null)
            .maybeSingle();

        if (!lease) {
            return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 });
        }

        // Soft delete
        const { error: deleteError } = await supabase
            .from('leases')
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: profile.id,
            })
            .eq('id', leaseId);

        if (deleteError) {
            console.error('[Lease DELETE] Error:', deleteError);
            return NextResponse.json({ error: 'Erro ao excluir contrato.' }, { status: 500 });
        }

        return NextResponse.json({ message: 'Contrato excluído com sucesso.' });
    } catch (err) {
        console.error('[Lease DELETE] Error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
