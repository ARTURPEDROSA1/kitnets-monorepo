import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
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

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase service credentials');
    return createClient(url, key);
}

/**
 * PUT /api/agencies/[id]
 * Updates an existing agency. Only OWNER and ADMIN roles allowed.
 */
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const { id: agencyId } = await params;
        const body = await request.json();
        const supabase = getServiceSupabase();

        // ── Verify user has permission ───────────────────────────────
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('clerk_id', user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
        }

        const { data: membership } = await supabase
            .from('agency_members')
            .select('role')
            .eq('agency_id', agencyId)
            .eq('user_id', profile.id)
            .maybeSingle();

        if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
            return NextResponse.json(
                { error: 'Sem permissão para editar esta imobiliária.' },
                { status: 403 }
            );
        }

        // ── Validate required fields ─────────────────────────────────
        const errors: Record<string, string> = {};

        if (!body.name?.trim()) errors.name = 'Nome da imobiliária é obrigatório.';
        if (!body.main_phone?.trim()) {
            errors.main_phone = 'Telefone principal é obrigatório.';
        } else if (!validatePhone(body.main_phone)) {
            errors.main_phone = 'Telefone principal inválido.';
        }
        if (!body.postal_code?.trim() || !validateCEP(body.postal_code)) {
            errors.postal_code = 'CEP é obrigatório e deve ter 8 dígitos.';
        }
        if (!body.street?.trim()) errors.street = 'Logradouro é obrigatório.';
        if (!body.street_number?.trim()) errors.street_number = 'Número é obrigatório.';
        if (!body.neighborhood?.trim()) errors.neighborhood = 'Bairro é obrigatório.';
        if (!body.city?.trim()) errors.city = 'Cidade é obrigatória.';
        if (!body.state?.trim()) errors.state = 'Estado é obrigatório.';

        // Optional field validation
        if (body.cnpj?.trim()) {
            const cnpjDigits = parseCNPJ(body.cnpj);
            if (cnpjDigits.length > 0 && !validateCNPJ(cnpjDigits)) {
                errors.cnpj = 'CNPJ inválido. Verifique os dígitos.';
            }
        }
        if (body.email?.trim() && !validateEmail(body.email)) errors.email = 'E-mail inválido.';
        if (body.additional_phone?.trim() && !validatePhone(body.additional_phone)) {
            errors.additional_phone = 'Telefone adicional inválido.';
        }
        if (body.website?.trim() && !validateWebsite(body.website)) errors.website = 'Website inválido.';

        if (Object.keys(errors).length > 0) {
            return NextResponse.json({ errors }, { status: 400 });
        }

        // ── CNPJ uniqueness check (if changed) ──────────────────────
        const cnpjDigits = body.cnpj?.trim() ? parseCNPJ(body.cnpj) : null;
        if (cnpjDigits && cnpjDigits.length === 14) {
            const { data: existingCnpj } = await supabase
                .from('agencies')
                .select('id')
                .eq('cnpj', cnpjDigits)
                .neq('id', agencyId)
                .is('deleted_at', null)
                .maybeSingle();

            if (existingCnpj) {
                return NextResponse.json(
                    { errors: { cnpj: 'Este CNPJ já está cadastrado por outra imobiliária.' } },
                    { status: 409 }
                );
            }
        }

        // ── Normalize and update ─────────────────────────────────────
        const updateData = {
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
        };

        const { data: agency, error: updateError } = await supabase
            .from('agencies')
            .update(updateData)
            .eq('id', agencyId)
            .select()
            .single();

        if (updateError) {
            console.error('[Agencies PUT] Update error:', updateError);
            return NextResponse.json({ error: 'Erro ao atualizar imobiliária.' }, { status: 500 });
        }

        console.log('[Agencies PUT] Updated agency:', agencyId);
        return NextResponse.json({
            success: true,
            agency: { ...agency, role: membership.role },
        });
    } catch (err) {
        console.error('[Agencies PUT] Unexpected error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

/**
 * DELETE /api/agencies/[id]
 * Soft-deletes an agency. Only OWNER role allowed.
 */
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const { id: agencyId } = await params;
        const supabase = getServiceSupabase();

        // ── Verify user has OWNER permission ─────────────────────────
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('clerk_id', user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
        }

        const { data: membership } = await supabase
            .from('agency_members')
            .select('role')
            .eq('agency_id', agencyId)
            .eq('user_id', profile.id)
            .maybeSingle();

        if (!membership || membership.role !== 'OWNER') {
            return NextResponse.json(
                { error: 'Apenas o proprietário pode excluir a imobiliária.' },
                { status: 403 }
            );
        }

        // ── Verify agency exists and is not already deleted ──────────
        const { data: agency } = await supabase
            .from('agencies')
            .select('id, deleted_at')
            .eq('id', agencyId)
            .maybeSingle();

        if (!agency) {
            return NextResponse.json({ error: 'Imobiliária não encontrada.' }, { status: 404 });
        }

        if (agency.deleted_at) {
            return NextResponse.json({ error: 'Imobiliária já foi excluída.' }, { status: 409 });
        }

        // ── Soft delete ──────────────────────────────────────────────
        const { error: deleteError } = await supabase
            .from('agencies')
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: profile.id,
            })
            .eq('id', agencyId);

        if (deleteError) {
            console.error('[Agencies DELETE] Error:', deleteError);
            return NextResponse.json({ error: 'Erro ao excluir imobiliária.' }, { status: 500 });
        }

        console.log('[Agencies DELETE] Soft-deleted agency:', agencyId, 'by:', profile.id);
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[Agencies DELETE] Unexpected error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
