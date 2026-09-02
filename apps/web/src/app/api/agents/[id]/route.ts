import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import {
    parsePhoneToE164,
    normalizeEmail,
    normalizeWebsite,
    validatePhone,
    validateEmail,
    validateWebsite,
    validateCPF,
    parseCPF,
} from '@/lib/validators';

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase service credentials');
    return createClient(url, key);
}

/**
 * PUT /api/agents/[id]
 * Updates an existing agent. Only the owning user is allowed.
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

        const { id: agentId } = await params;
        const body = await request.json();
        const supabase = getServiceSupabase();

        // ── Verify user owns this agent ──────────────────────────────
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('clerk_id', user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
        }

        const { data: existingAgent } = await supabase
            .from('agents')
            .select('id, user_id')
            .eq('id', agentId)
            .is('deleted_at', null)
            .maybeSingle();

        if (!existingAgent) {
            return NextResponse.json({ error: 'Corretor não encontrado.' }, { status: 404 });
        }

        if (existingAgent.user_id !== profile.id) {
            return NextResponse.json(
                { error: 'Sem permissão para editar este corretor.' },
                { status: 403 }
            );
        }

        // ── Validate required fields ─────────────────────────────────
        const errors: Record<string, string> = {};

        if (!body.full_name?.trim()) errors.full_name = 'Nome completo é obrigatório.';
        if (!body.creci_number?.trim()) errors.creci_number = 'CRECI é obrigatório.';
        if (!body.creci_state?.trim()) errors.creci_state = 'UF do CRECI é obrigatório.';
        if (!body.agent_type || !['AUTONOMO', 'IMOBILIARIA'].includes(body.agent_type)) {
            errors.agent_type = 'Tipo de atuação é obrigatório.';
        }
        if (body.agent_type === 'IMOBILIARIA' && !body.agency_id?.trim()) {
            errors.agency_id = 'Selecione a imobiliária.';
        }
        if (!body.main_phone?.trim()) {
            errors.main_phone = 'Telefone principal é obrigatório.';
        } else if (!validatePhone(body.main_phone)) {
            errors.main_phone = 'Telefone principal inválido.';
        }
        if (!body.status || !['ACTIVE', 'INACTIVE'].includes(body.status)) {
            errors.status = 'Status é obrigatório.';
        }

        // Optional field validation
        if (body.cpf?.trim()) {
            const cpfDigits = parseCPF(body.cpf);
            if (cpfDigits.length > 0 && !validateCPF(cpfDigits)) {
                errors.cpf = 'CPF inválido. Verifique os dígitos.';
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

        // ── CRECI uniqueness check (if changed) ──────────────────────
        const creciNumber = body.creci_number.trim();
        const creciState = body.creci_state.trim().toUpperCase();

        const { data: existingCreci } = await supabase
            .from('agents')
            .select('id')
            .eq('creci_number', creciNumber)
            .eq('creci_state', creciState)
            .neq('id', agentId)
            .is('deleted_at', null)
            .maybeSingle();

        if (existingCreci) {
            return NextResponse.json(
                { errors: { creci_number: `CRECI-${creciState} ${creciNumber} já está cadastrado.` } },
                { status: 409 }
            );
        }

        // ── CPF uniqueness check (if changed) ────────────────────────
        const cpfDigits = body.cpf?.trim() ? parseCPF(body.cpf) : null;
        if (cpfDigits && cpfDigits.length === 11) {
            const { data: existingCpf } = await supabase
                .from('agents')
                .select('id')
                .eq('cpf', cpfDigits)
                .neq('id', agentId)
                .is('deleted_at', null)
                .maybeSingle();

            if (existingCpf) {
                return NextResponse.json(
                    { errors: { cpf: 'Este CPF já está cadastrado por outro corretor.' } },
                    { status: 409 }
                );
            }
        }

        // ── Validate agency_id if type is IMOBILIARIA ────────────────
        if (body.agent_type === 'IMOBILIARIA' && body.agency_id?.trim()) {
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

        // ── Normalize and update ─────────────────────────────────────
        const updateData = {
            full_name: body.full_name.trim(),
            cpf: cpfDigits && cpfDigits.length === 11 ? cpfDigits : null,
            creci_number: creciNumber,
            creci_state: creciState,
            agent_type: body.agent_type,
            agency_id: body.agent_type === 'IMOBILIARIA' && body.agency_id?.trim()
                ? body.agency_id.trim()
                : null,
            main_phone: parsePhoneToE164(body.main_phone),
            main_phone_whatsapp: body.main_phone_whatsapp === true,
            additional_phone: body.additional_phone?.trim()
                ? parsePhoneToE164(body.additional_phone)
                : null,
            additional_phone_whatsapp: body.additional_phone?.trim()
                ? (body.additional_phone_whatsapp === true)
                : false,
            email: body.email?.trim() ? normalizeEmail(body.email) : null,
            website: body.website?.trim() ? normalizeWebsite(body.website) : null,
            notes: body.notes?.trim() || null,
            status: body.status,
        };

        const { data: agent, error: updateError } = await supabase
            .from('agents')
            .update(updateData)
            .eq('id', agentId)
            .select()
            .single();

        if (updateError) {
            console.error('[Agents PUT] Update error:', updateError);
            if (updateError.code === '23505') {
                if (updateError.message?.includes('creci')) {
                    return NextResponse.json(
                        { errors: { creci_number: 'Este CRECI já está cadastrado.' } },
                        { status: 409 }
                    );
                }
                if (updateError.message?.includes('cpf')) {
                    return NextResponse.json(
                        { errors: { cpf: 'Este CPF já está cadastrado.' } },
                        { status: 409 }
                    );
                }
            }
            return NextResponse.json({ error: 'Erro ao atualizar corretor.' }, { status: 500 });
        }

        console.log('[Agents PUT] Updated agent:', agentId);
        return NextResponse.json({
            success: true,
            agent,
        });
    } catch (err) {
        console.error('[Agents PUT] Unexpected error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

/**
 * DELETE /api/agents/[id]
 * Soft-deletes an agent. Only the owning user is allowed.
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

        const { id: agentId } = await params;
        const supabase = getServiceSupabase();

        // ── Verify user owns this agent ──────────────────────────────
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('clerk_id', user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
        }

        const { data: agent } = await supabase
            .from('agents')
            .select('id, user_id, deleted_at')
            .eq('id', agentId)
            .maybeSingle();

        if (!agent) {
            return NextResponse.json({ error: 'Corretor não encontrado.' }, { status: 404 });
        }

        if (agent.user_id !== profile.id) {
            return NextResponse.json(
                { error: 'Sem permissão para excluir este corretor.' },
                { status: 403 }
            );
        }

        if (agent.deleted_at) {
            return NextResponse.json({ error: 'Corretor já foi excluído.' }, { status: 409 });
        }

        // ── Soft delete ──────────────────────────────────────────────
        const { error: deleteError } = await supabase
            .from('agents')
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: profile.id,
            })
            .eq('id', agentId);

        if (deleteError) {
            console.error('[Agents DELETE] Error:', deleteError);
            return NextResponse.json({ error: 'Erro ao excluir corretor.' }, { status: 500 });
        }

        console.log('[Agents DELETE] Soft-deleted agent:', agentId, 'by:', profile.id);
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[Agents DELETE] Unexpected error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
