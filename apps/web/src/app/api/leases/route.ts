import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase service credentials');
    return createClient(url, key);
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseCurrency(value: string): number {
    if (!value) return 0;
    // Remove R$, dots (thousands), replace comma with dot
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

// ── GET /api/leases ──────────────────────────────────────────────────

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
            return NextResponse.json({ leases: [] });
        }

        // Fetch all leases with joined names
        const { data: leases, error } = await supabase
            .from('leases')
            .select(`
                *,
                property:properties!property_id(name),
                primary_tenant:tenants!primary_tenant_id(full_name),
                agency:agencies!agency_id(name),
                agent:agents!agent_id(full_name)
            `)
            .eq('user_id', profile.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Leases GET] Error:', error);
            return NextResponse.json({ error: 'Erro ao carregar contratos.' }, { status: 500 });
        }

        // Flatten joined names
        const formatted = (leases || []).map((l: Record<string, unknown>) => ({
            ...l,
            property_name: (l.property as Record<string, unknown>)?.name || null,
            primary_tenant_name: (l.primary_tenant as Record<string, unknown>)?.full_name || null,
            agency_name: (l.agency as Record<string, unknown>)?.name || null,
            agent_name: (l.agent as Record<string, unknown>)?.full_name || null,
            property: undefined,
            primary_tenant: undefined,
            agency: undefined,
            agent: undefined,
        }));

        return NextResponse.json({ leases: formatted });
    } catch (err) {
        console.error('[Leases GET] Error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

// ── POST /api/leases ─────────────────────────────────────────────────

export async function POST(request: Request) {
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
            return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
        }

        const body = await request.json();

        // ── Validation ───────────────────────────────────────────────
        const errors: Record<string, string> = {};

        if (!body.property_id) {
            errors.property_id = 'Selecione um imóvel.';
        }

        if (!body.primary_tenant_id) {
            errors.primary_tenant_id = 'Selecione um inquilino.';
        }

        if (!body.management_type || !VALID_MANAGEMENT.includes(body.management_type)) {
            errors.management_type = 'Tipo de gestão é obrigatório.';
        }

        if (body.management_type === 'AGENCY' && !body.agency_id) {
            errors.agency_id = 'Selecione a imobiliária.';
        }

        if (body.management_type === 'AGENT' && !body.agent_id) {
            errors.agent_id = 'Selecione o corretor.';
        }

        if (!body.start_date) {
            errors.start_date = 'Data de início é obrigatória.';
        }

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

        // Verify property belongs to user
        const { data: property } = await supabase
            .from('properties')
            .select('id')
            .eq('id', body.property_id)
            .eq('owner_id', profile.id)
            .maybeSingle();

        if (!property) {
            return NextResponse.json({
                errors: { property_id: 'Imóvel não encontrado ou não pertence à sua conta.' }
            }, { status: 400 });
        }

        // Verify primary tenant belongs to user
        const { data: tenant } = await supabase
            .from('tenants')
            .select('id')
            .eq('id', body.primary_tenant_id)
            .eq('user_id', profile.id)
            .is('deleted_at', null)
            .maybeSingle();

        if (!tenant) {
            return NextResponse.json({
                errors: { primary_tenant_id: 'Inquilino não encontrado ou não pertence à sua conta.' }
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

        // ── Check for existing active lease on same property (warning) ──
        let warning: string | null = null;
        if (status === 'ACTIVE') {
            const { data: existingActive } = await supabase
                .from('leases')
                .select('id, reference_name')
                .eq('property_id', body.property_id)
                .eq('user_id', profile.id)
                .eq('status', 'ACTIVE')
                .is('deleted_at', null)
                .limit(1);

            if (existingActive && existingActive.length > 0) {
                warning = `Este imóvel já possui um contrato ativo: "${existingActive[0].reference_name || 'Sem referência'}". Salvando mesmo assim.`;
            }
        }

        // ── Insert lease ─────────────────────────────────────────────

        const securityDeposit = body.security_deposit ? parseCurrency(body.security_deposit) : null;
        const depositMonths = body.deposit_months ? parseInt(body.deposit_months, 10) : null;
        const adjFreq = body.adjustment_frequency ? parseInt(body.adjustment_frequency, 10) : 12;

        const leaseData = {
            user_id: profile.id,
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

        const { data: lease, error: insertError } = await supabase
            .from('leases')
            .insert(leaseData)
            .select()
            .single();

        if (insertError) {
            console.error('[Leases POST] Insert error:', insertError);
            return NextResponse.json({ error: 'Erro ao criar contrato.' }, { status: 500 });
        }

        // ── Insert additional tenants ────────────────────────────────

        if (body.additional_tenants && Array.isArray(body.additional_tenants) && body.additional_tenants.length > 0) {
            const tenantRows = body.additional_tenants
                .filter((t: { tenant_id: string; role: string }) => t.tenant_id && VALID_TENANT_ROLES.includes(t.role))
                .map((t: { tenant_id: string; role: string }) => ({
                    lease_id: lease.id,
                    tenant_id: t.tenant_id,
                    role: t.role,
                }));

            if (tenantRows.length > 0) {
                const { error: tenantsError } = await supabase
                    .from('lease_tenants')
                    .insert(tenantRows);

                if (tenantsError) {
                    console.error('[Leases POST] Tenants insert error:', tenantsError);
                }
            }
        }

        // ── Insert charges ───────────────────────────────────────────

        if (body.charges && Array.isArray(body.charges) && body.charges.length > 0) {
            const chargeRows = body.charges
                .filter((c: { charge_type: string; responsibility: string }) =>
                    VALID_CHARGE_TYPES.includes(c.charge_type) &&
                    VALID_RESPONSIBILITIES.includes(c.responsibility)
                )
                .map((c: { charge_type: string; label?: string; responsibility: string; amount?: string }) => ({
                    lease_id: lease.id,
                    charge_type: c.charge_type,
                    label: c.label?.trim() || null,
                    responsibility: c.responsibility,
                    amount: c.amount ? parseCurrency(c.amount) : null,
                }));

            if (chargeRows.length > 0) {
                const { error: chargesError } = await supabase
                    .from('lease_charges')
                    .insert(chargeRows);

                if (chargesError) {
                    console.error('[Leases POST] Charges insert error:', chargesError);
                }
            }
        }

        return NextResponse.json({ lease, warning }, { status: 201 });
    } catch (err) {
        console.error('[Leases POST] Error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
