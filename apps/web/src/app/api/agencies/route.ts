import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
    validateCNPJ,
    parseCNPJ,
    parsePhoneToE164,
    normalizeEmail,
    normalizeWebsite,
    validatePhone,
    validateEmail,
    validateWebsite,
    parseCEP,
    validateCEP,
} from '@/lib/validators';
import { unpackAgencyMetadata, packAgencyMetadata } from '@/lib/agency-metadata';

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase service credentials');
    return createClient(url, key);
}

/**
 * GET /api/agencies
 * Returns all agencies associated with the current user (with their role).
 */
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const supabase = getServiceSupabase();

        // Find user's profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('clerk_id', userId)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ agencies: [] });
        }

        // Fetch all agencies for user's memberships joined in one query
        const { data: memberships, error: memberError } = await supabase
            .from('agency_members')
            .select(`
                role,
                agencies!inner(*)
            `)
            .eq('user_id', profile.id)
            .is('agencies.deleted_at', null);

        if (memberError || !memberships || memberships.length === 0) {
            return NextResponse.json({ agencies: [] });
        }

        const agenciesWithRole = memberships
            .map((m: any) => {
                if (!m.agencies) return null;
                return unpackAgencyMetadata({
                    ...m.agencies,
                    role: m.role || 'VIEWER',
                });
            })
            .filter(Boolean);

        return NextResponse.json({ agencies: agenciesWithRole });
    } catch (err) {
        console.error('[Agencies GET] Error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

/**
 * POST /api/agencies
 * Creates a new agency and assigns the current user as OWNER.
 */
export async function POST(request: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const body = await request.json();

        // ── Required field validation ────────────────────────────────
        const errors: Record<string, string> = {};

        if (!body.name?.trim()) {
            errors.name = 'Nome da imobiliária é obrigatório.';
        }
        if (!body.main_phone?.trim()) {
            errors.main_phone = 'Telefone principal é obrigatório.';
        } else if (!validatePhone(body.main_phone)) {
            errors.main_phone = 'Telefone principal inválido.';
        }
        if (!body.postal_code?.trim() || !validateCEP(body.postal_code)) {
            errors.postal_code = 'CEP é obrigatório e deve ter 8 dígitos.';
        }
        if (!body.street?.trim()) {
            errors.street = 'Logradouro é obrigatório.';
        }
        if (!body.street_number?.trim()) {
            errors.street_number = 'Número é obrigatório.';
        }
        if (!body.neighborhood?.trim()) {
            errors.neighborhood = 'Bairro é obrigatório.';
        }
        if (!body.city?.trim()) {
            errors.city = 'Cidade é obrigatória.';
        }
        if (!body.state?.trim()) {
            errors.state = 'Estado é obrigatório.';
        }

        // ── Optional field validation ────────────────────────────────
        if (body.cnpj?.trim()) {
            const cnpjDigits = parseCNPJ(body.cnpj);
            if (cnpjDigits.length > 0 && !validateCNPJ(cnpjDigits)) {
                errors.cnpj = 'CNPJ inválido. Verifique os dígitos.';
            }
        }
        if (body.email?.trim() && !validateEmail(body.email)) {
            errors.email = 'E-mail inválido.';
        }
        if (body.additional_phone?.trim() && !validatePhone(body.additional_phone)) {
            errors.additional_phone = 'Telefone adicional inválido.';
        }
        if (body.website?.trim() && !validateWebsite(body.website)) {
            errors.website = 'Website inválido.';
        }

        if (Object.keys(errors).length > 0) {
            return NextResponse.json({ errors }, { status: 400 });
        }

        const supabase = getServiceSupabase();

        // ── Get user profile ─────────────────────────────────────────
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('clerk_id', userId)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json(
                { error: 'Perfil não encontrado. Faça login novamente.' },
                { status: 404 }
            );
        }

        // Multi-agency: no single-agency constraint — users can create multiple agencies

        // ── CNPJ per-user duplicate check ────────────────────────────
        const cnpjDigits = body.cnpj?.trim() ? parseCNPJ(body.cnpj) : null;
        if (cnpjDigits && cnpjDigits.length === 14) {
            // Check if this specific user already has an active agency with this CNPJ
            const { data: userMemberships } = await supabase
                .from('agency_members')
                .select('agency_id')
                .eq('user_id', profile.id);

            if (userMemberships && userMemberships.length > 0) {
                const userAgencyIds = userMemberships.map(m => m.agency_id);
                const { data: userExistingCnpj } = await supabase
                    .from('agencies')
                    .select('id')
                    .in('id', userAgencyIds)
                    .eq('cnpj', cnpjDigits)
                    .is('deleted_at', null)
                    .maybeSingle();

                if (userExistingCnpj) {
                    return NextResponse.json(
                        {
                            errors: {
                                cnpj: 'Você já possui uma imobiliária com este CNPJ cadastrada em seu painel.',
                            },
                        },
                        { status: 409 }
                    );
                }
            }
        }

        // ── Normalize fields ─────────────────────────────────────────
        const agencyData = {
            name: body.name.trim(),
            trade_name: body.trade_name?.trim() || null,
            cnpj: cnpjDigits && cnpjDigits.length === 14 ? cnpjDigits : null,
            creci_number: body.creci_number?.trim() || null,
            creci_state: body.creci_state?.trim() || null,
            creci_type: body.creci_type?.trim() || null,
            owner_name: body.owner_name?.trim() || null,
            main_phone: parsePhoneToE164(body.main_phone),
            additional_phone: body.additional_phone?.trim()
                ? parsePhoneToE164(body.additional_phone)
                : null,
            main_phone_whatsapp: body.main_phone_whatsapp === true,
            additional_phone_whatsapp: body.additional_phone_whatsapp === true,
            email: body.email?.trim() ? normalizeEmail(body.email) : null,
            website: body.website?.trim() ? normalizeWebsite(body.website) : null,
            postal_code: parseCEP(body.postal_code),
            street: body.street.trim(),
            street_number: body.street_number.trim(),
            address_complement: body.address_complement?.trim() || null,
            neighborhood: body.neighborhood.trim(),
            city: body.city.trim(),
            state: body.state.trim().toUpperCase(),
            country: body.country?.trim() || 'BR',
            description: body.description?.trim() || null,
            service_agreement_url: body.service_agreement_url || null,
            service_agreement_filename: body.service_agreement_filename?.trim() || null,
            management_fee: body.management_fee ? parseFloat(body.management_fee) : null,
            agreement_start_date: body.agreement_start_date || null,
            agreement_end_date: body.agreement_end_date || null,
            status: 'ACTIVE',
        };

        // ── Insert agency ────────────────────────────────────────────
        let agency: any = null;
        let insertError: any = null;

        const res = await supabase
            .from('agencies')
            .insert(agencyData)
            .select()
            .single();

        agency = res.data;
        insertError = res.error;

        // Fallback: if columns like service_agreement_* don't exist yet, pack into description
        if (insertError && (insertError.code === '42703' || insertError.message?.includes('column'))) {
            console.warn('[Agencies POST] Column not found, retrying with packed metadata in description:', insertError.message);
            const { service_agreement_url, service_agreement_filename, management_fee, agreement_start_date, agreement_end_date, ...coreData } = agencyData;
            const packedDescription = packAgencyMetadata(coreData.description, {
                service_agreement_url,
                service_agreement_filename,
                management_fee,
                agreement_start_date,
                agreement_end_date,
            });
            const retryRes = await supabase
                .from('agencies')
                .insert({ ...coreData, description: packedDescription })
                .select()
                .single();
            agency = retryRes.data;
            insertError = retryRes.error;
        }

        if (insertError) {
            console.error('[Agencies POST] Insert error:', insertError);
            if (insertError.code === '23505') {
                return NextResponse.json(
                    {
                        errors: {
                            cnpj: 'Este CNPJ já está cadastrado por outra imobiliária.',
                        },
                    },
                    { status: 409 }
                );
            }
            return NextResponse.json(
                { error: insertError.message || 'Erro ao criar imobiliária.' },
                { status: 500 }
            );
        }

        // ── Insert OWNER membership ──────────────────────────────────
        const { error: memberError } = await supabase
            .from('agency_members')
            .insert({
                agency_id: agency.id,
                user_id: profile.id,
                role: 'OWNER',
            });

        if (memberError) {
            console.error('[Agencies POST] Member insert error:', memberError);
            // Roll back agency creation
            await supabase.from('agencies').delete().eq('id', agency.id);
            return NextResponse.json(
                { error: 'Erro ao criar vínculo com a imobiliária.' },
                { status: 500 }
            );
        }

        console.log('[Agencies POST] Created agency:', agency.id, 'owner:', profile.id);
        return NextResponse.json({
            success: true,
            agency: unpackAgencyMetadata({ ...agency, role: 'OWNER' }),
        });
    } catch (err) {
        console.error('[Agencies POST] Unexpected error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
