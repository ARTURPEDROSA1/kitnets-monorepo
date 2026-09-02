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
 * PUT /api/tenants/[id]
 * Updates an existing tenant. Only the owning user is allowed.
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

        const { id: tenantId } = await params;
        const body = await request.json();
        const supabase = getServiceSupabase();

        // ── Verify user owns this tenant ─────────────────────────────
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('clerk_id', user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
        }

        const { data: existingTenant } = await supabase
            .from('tenants')
            .select('id, user_id, cpf')
            .eq('id', tenantId)
            .is('deleted_at', null)
            .maybeSingle();

        if (!existingTenant) {
            return NextResponse.json({ error: 'Inquilino não encontrado.' }, { status: 404 });
        }

        if (existingTenant.user_id !== profile.id) {
            return NextResponse.json(
                { error: 'Sem permissão para editar este inquilino.' },
                { status: 403 }
            );
        }

        // ── Validate required fields ─────────────────────────────────
        const errors: Record<string, string> = {};

        if (!body.full_name?.trim()) errors.full_name = 'Nome completo é obrigatório.';
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
            errors.email = 'E-mail é obrigatório.';
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

        // ── CPF uniqueness check (exclude current tenant) ────────────
        const cpfDigits = parseCPF(body.cpf);
        if (cpfDigits !== existingTenant.cpf) {
            const { data: cpfConflict } = await supabase
                .from('tenants')
                .select('id')
                .eq('user_id', profile.id)
                .eq('cpf', cpfDigits)
                .is('deleted_at', null)
                .neq('id', tenantId)
                .maybeSingle();

            if (cpfConflict) {
                return NextResponse.json(
                    { errors: { cpf: 'Este CPF já está cadastrado na sua conta.' } },
                    { status: 409 }
                );
            }
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

        // ── Validate agency if AGENCY type ───────────────────────────
        if (body.management_type === 'AGENCY' && body.agency_id?.trim()) {
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

        // ── Normalize and update ─────────────────────────────────────
        const postalCodeDigits = body.postal_code?.trim() ? parseCEP(body.postal_code) : null;

        const updateData = {
            full_name: body.full_name.trim(),
            cpf: cpfDigits,
            main_phone: parsePhoneToE164(body.main_phone),
            email: normalizeEmail(body.email),
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

        const { data: tenant, error: updateError } = await supabase
            .from('tenants')
            .update(updateData)
            .eq('id', tenantId)
            .select()
            .single();

        if (updateError) {
            console.error('[Tenants PUT] Update error:', updateError);
            if (updateError.code === '23505' && updateError.message?.includes('cpf')) {
                return NextResponse.json(
                    { errors: { cpf: 'Este CPF já está cadastrado na sua conta.' } },
                    { status: 409 }
                );
            }
            return NextResponse.json(
                { error: 'Erro ao atualizar inquilino.' },
                { status: 500 }
            );
        }

        console.log('[Tenants PUT] Updated tenant:', tenantId, 'user:', profile.id);
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
        console.error('[Tenants PUT] Unexpected error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

/**
 * DELETE /api/tenants/[id]
 * Soft-deletes a tenant. Prevents deletion if an active lease exists (future feature).
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

        const { id: tenantId } = await params;
        const supabase = getServiceSupabase();

        // ── Verify user owns this tenant ─────────────────────────────
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('clerk_id', user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
        }

        const { data: tenant } = await supabase
            .from('tenants')
            .select('id, user_id, status')
            .eq('id', tenantId)
            .is('deleted_at', null)
            .maybeSingle();

        if (!tenant) {
            return NextResponse.json({ error: 'Inquilino não encontrado.' }, { status: 404 });
        }

        if (tenant.user_id !== profile.id) {
            return NextResponse.json(
                { error: 'Sem permissão para excluir este inquilino.' },
                { status: 403 }
            );
        }

        // ── Check for active lease (placeholder for future lease module) ──
        // When the leases table is created, uncomment this check:
        // const { data: activeLease } = await supabase
        //     .from('leases')
        //     .select('id')
        //     .eq('tenant_id', tenantId)
        //     .eq('status', 'ACTIVE')
        //     .maybeSingle();
        //
        // if (activeLease) {
        //     return NextResponse.json(
        //         { error: 'Este inquilino possui um contrato ativo. Altere o status para "Ex-Inquilino" em vez de excluir.' },
        //         { status: 409 }
        //     );
        // }

        // ── Soft delete ──────────────────────────────────────────────
        const { error: deleteError } = await supabase
            .from('tenants')
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: profile.id,
            })
            .eq('id', tenantId);

        if (deleteError) {
            console.error('[Tenants DELETE] Error:', deleteError);
            return NextResponse.json(
                { error: 'Erro ao excluir inquilino.' },
                { status: 500 }
            );
        }

        console.log('[Tenants DELETE] Soft-deleted tenant:', tenantId, 'user:', profile.id);
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[Tenants DELETE] Unexpected error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
