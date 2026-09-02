import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import {
    parsePhoneToE164,
    normalizeEmail,
    validatePhone,
    validateEmail,
    validateCPF,
    parseCPF,
    parseCEP,
    validateCEP,
} from '@/lib/validators';

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase service credentials');
    return createClient(url, key);
}

/**
 * GET /api/tenants
 * Returns all tenants for the current user, with joined property, agency, and agent names.
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
            return NextResponse.json({ tenants: [] });
        }

        // Fetch all tenants for user (exclude soft-deleted), join related names
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select(`
                *,
                properties!tenants_property_id_fkey ( name ),
                agencies!tenants_agency_id_fkey ( name ),
                agents!tenants_agent_id_fkey ( full_name )
            `)
            .eq('user_id', profile.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Tenants GET] Error:', error);
            return NextResponse.json({ tenants: [] });
        }

        // Flatten joined names into tenant object
        const tenantsWithDetails = (tenants || []).map((t: Record<string, unknown>) => {
            const property = t.properties as { name: string } | null;
            const agency = t.agencies as { name: string } | null;
            const agent = t.agents as { full_name: string } | null;
            return {
                ...t,
                property_name: property?.name || null,
                agency_name: agency?.name || null,
                agent_name: agent?.full_name || null,
                properties: undefined,
                agencies: undefined,
                agents: undefined,
            };
        });

        return NextResponse.json({ tenants: tenantsWithDetails });
    } catch (err) {
        console.error('[Tenants GET] Error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

/**
 * POST /api/tenants
 * Creates a new tenant for the current user.
 */
export async function POST(request: Request) {
    try {
        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const body = await request.json();

        // ── Required field validation ────────────────────────────────
        const errors: Record<string, string> = {};

        if (!body.full_name?.trim()) {
            errors.full_name = 'Nome completo é obrigatório.';
        }
        if (!body.cpf?.trim()) {
            errors.cpf = 'CPF é obrigatório.';
        } else {
            const cpfDigits = parseCPF(body.cpf);
            if (!validateCPF(cpfDigits)) {
                errors.cpf = 'CPF inválido. Verifique os dígitos.';
            }
        }
        if (!body.main_phone?.trim()) {
            errors.main_phone = 'Telefone principal é obrigatório.';
        } else if (!validatePhone(body.main_phone)) {
            errors.main_phone = 'Telefone principal inválido.';
        }
        if (!body.email?.trim()) {
            // email is optional — skip
        } else if (!validateEmail(body.email)) {
            errors.email = 'E-mail inválido.';
        }
        if (!body.property_id?.trim()) {
            errors.property_id = 'Imóvel é obrigatório.';
        }
        if (!body.management_type || !['SELF_MANAGED', 'AGENCY'].includes(body.management_type)) {
            errors.management_type = 'Tipo de gestão é obrigatório.';
        }
        if (body.management_type === 'AGENCY' && !body.agency_id?.trim()) {
            errors.agency_id = 'Selecione a imobiliária.';
        }

        // ── Optional field validation ────────────────────────────────
        if (body.additional_phone?.trim() && !validatePhone(body.additional_phone)) {
            errors.additional_phone = 'Telefone adicional inválido.';
        }
        if (body.emergency_contact_phone?.trim() && !validatePhone(body.emergency_contact_phone)) {
            errors.emergency_contact_phone = 'Telefone de emergência inválido.';
        }
        if (body.postal_code?.trim()) {
            const cepDigits = parseCEP(body.postal_code);
            if (cepDigits.length > 0 && !validateCEP(cepDigits)) {
                errors.postal_code = 'CEP inválido (8 dígitos).';
            }
        }

        if (Object.keys(errors).length > 0) {
            return NextResponse.json({ errors }, { status: 400 });
        }

        const supabase = getServiceSupabase();

        // ── Get user profile ─────────────────────────────────────────
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('clerk_id', user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json(
                { error: 'Perfil não encontrado. Faça login novamente.' },
                { status: 404 }
            );
        }

        // ── CPF uniqueness check (within same user account) ──────────
        const cpfDigits = parseCPF(body.cpf);
        const { data: existingCpf } = await supabase
            .from('tenants')
            .select('id')
            .eq('user_id', profile.id)
            .eq('cpf', cpfDigits)
            .is('deleted_at', null)
            .maybeSingle();

        if (existingCpf) {
            return NextResponse.json(
                { errors: { cpf: 'Este CPF já está cadastrado na sua conta.' } },
                { status: 409 }
            );
        }

        // ── Validate property belongs to user ────────────────────────
        const { data: property } = await supabase
            .from('properties')
            .select('id')
            .eq('id', body.property_id.trim())
            .eq('owner_id', profile.id)
            .maybeSingle();

        if (!property) {
            return NextResponse.json(
                { errors: { property_id: 'Imóvel não encontrado ou não pertence à sua conta.' } },
                { status: 400 }
            );
        }

        // ── Validate agency if management_type is AGENCY ─────────────
        if (body.management_type === 'AGENCY' && body.agency_id?.trim()) {
            // Verify agency exists and user is a member
            const { data: agencyMember } = await supabase
                .from('agency_members')
                .select('id')
                .eq('agency_id', body.agency_id.trim())
                .eq('user_id', profile.id)
                .maybeSingle();

            if (!agencyMember) {
                // Also check if agency exists without membership (user may have created it)
                const { data: agency } = await supabase
                    .from('agencies')
                    .select('id')
                    .eq('id', body.agency_id.trim())
                    .is('deleted_at', null)
                    .maybeSingle();

                if (!agency) {
                    return NextResponse.json(
                        { errors: { agency_id: 'Imobiliária não encontrada.' } },
                        { status: 400 }
                    );
                }
            }
        }

        // ── Validate agent belongs to selected agency ────────────────
        if (body.agent_id?.trim() && body.agency_id?.trim()) {
            const { data: agent } = await supabase
                .from('agents')
                .select('id, agency_id')
                .eq('id', body.agent_id.trim())
                .is('deleted_at', null)
                .maybeSingle();

            if (!agent) {
                return NextResponse.json(
                    { errors: { agent_id: 'Corretor não encontrado.' } },
                    { status: 400 }
                );
            }

            if (agent.agency_id !== body.agency_id.trim()) {
                return NextResponse.json(
                    { errors: { agent_id: 'Corretor não pertence à imobiliária selecionada.' } },
                    { status: 400 }
                );
            }
        }

        // ── Normalize fields ─────────────────────────────────────────
        const postalCodeDigits = body.postal_code?.trim() ? parseCEP(body.postal_code) : null;

        const tenantData = {
            user_id: profile.id,
            full_name: body.full_name.trim(),
            cpf: cpfDigits,
            main_phone: parsePhoneToE164(body.main_phone),
            email: body.email?.trim() ? normalizeEmail(body.email) : null,
            date_of_birth: body.date_of_birth?.trim() || null,
            rg: body.rg?.trim() || null,
            additional_phone: body.additional_phone?.trim()
                ? parsePhoneToE164(body.additional_phone)
                : null,
            postal_code: postalCodeDigits && postalCodeDigits.length === 8 ? postalCodeDigits : null,
            street: body.street?.trim() || null,
            street_number: body.street_number?.trim() || null,
            address_complement: body.address_complement?.trim() || null,
            neighborhood: body.neighborhood?.trim() || null,
            city: body.city?.trim() || null,
            state: body.state?.trim()?.toUpperCase() || null,
            property_id: body.property_id.trim(),
            use_property_address: body.use_property_address === true,
            management_type: body.management_type,
            agency_id: body.management_type === 'AGENCY' && body.agency_id?.trim()
                ? body.agency_id.trim()
                : null,
            agent_id: body.management_type === 'AGENCY' && body.agent_id?.trim()
                ? body.agent_id.trim()
                : null,
            move_in_date: body.move_in_date?.trim() || null,
            move_out_date: body.move_out_date?.trim() || null,
            status: body.status || 'ACTIVE',
            emergency_contact_name: body.emergency_contact_name?.trim() || null,
            emergency_contact_phone: body.emergency_contact_phone?.trim()
                ? parsePhoneToE164(body.emergency_contact_phone)
                : null,
            notes: body.notes?.trim() || null,
        };

        // ── Insert tenant ────────────────────────────────────────────
        const { data: tenant, error: insertError } = await supabase
            .from('tenants')
            .insert(tenantData)
            .select()
            .single();

        if (insertError) {
            console.error('[Tenants POST] Insert error:', insertError);
            if (insertError.code === '23505') {
                if (insertError.message?.includes('cpf')) {
                    return NextResponse.json(
                        { errors: { cpf: 'Este CPF já está cadastrado na sua conta.' } },
                        { status: 409 }
                    );
                }
            }
            return NextResponse.json(
                { error: 'Erro ao cadastrar inquilino.' },
                { status: 500 }
            );
        }

        console.log('[Tenants POST] Created tenant:', tenant.id, 'user:', profile.id);
        return NextResponse.json({
            success: true,
            tenant: {
                ...tenant,
                property_name: null,
                agency_name: null,
                agent_name: null,
            },
        });
    } catch (err) {
        console.error('[Tenants POST] Unexpected error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
