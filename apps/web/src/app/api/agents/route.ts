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
 * GET /api/agents
 * Returns all agents for the current user, with joined agency name.
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
            return NextResponse.json({ agents: [] });
        }

        // Fetch all agents for user (exclude soft-deleted), join agency name
        const { data: agents, error } = await supabase
            .from('agents')
            .select(`
                *,
                agencies!agents_agency_id_fkey ( name )
            `)
            .eq('user_id', profile.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Agents GET] Error:', error);
            return NextResponse.json({ agents: [] });
        }

        // Flatten agency name into agent object
        const agentsWithAgency = (agents || []).map((a: Record<string, unknown>) => {
            const agencies = a.agencies as { name: string } | null;
            return {
                ...a,
                agency_name: agencies?.name || null,
                agencies: undefined,
            };
        });

        return NextResponse.json({ agents: agentsWithAgency });
    } catch (err) {
        console.error('[Agents GET] Error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

/**
 * POST /api/agents
 * Creates a new agent for the current user.
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
        if (!body.creci_number?.trim()) {
            errors.creci_number = 'CRECI é obrigatório.';
        }
        if (!body.creci_state?.trim()) {
            errors.creci_state = 'UF do CRECI é obrigatório.';
        }
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

        // ── Optional field validation ────────────────────────────────
        if (body.cpf?.trim()) {
            const cpfDigits = parseCPF(body.cpf);
            if (cpfDigits.length > 0 && !validateCPF(cpfDigits)) {
                errors.cpf = 'CPF inválido. Verifique os dígitos.';
            }
        }
        if (body.email?.trim() && !validateEmail(body.email)) {
            errors.email = 'E-mail inválido.';
        }
        if (body.additional_phone?.trim() && !validatePhone(body.additional_phone)) {
            errors.additional_phone = 'Telefone adicional inválido.';
        }
        if (body.whatsapp_phone?.trim() && !validatePhone(body.whatsapp_phone)) {
            errors.whatsapp_phone = 'WhatsApp inválido.';
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
            .eq('clerk_id', user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json(
                { error: 'Perfil não encontrado. Faça login novamente.' },
                { status: 404 }
            );
        }

        // ── CRECI uniqueness check ───────────────────────────────────
        const creciNumber = body.creci_number.trim();
        const creciState = body.creci_state.trim().toUpperCase();

        const { data: existingCreci } = await supabase
            .from('agents')
            .select('id')
            .eq('creci_number', creciNumber)
            .eq('creci_state', creciState)
            .is('deleted_at', null)
            .maybeSingle();

        if (existingCreci) {
            return NextResponse.json(
                {
                    errors: {
                        creci_number: `CRECI-${creciState} ${creciNumber} já está cadastrado.`,
                    },
                },
                { status: 409 }
            );
        }

        // ── CPF uniqueness check ─────────────────────────────────────
        const cpfDigits = body.cpf?.trim() ? parseCPF(body.cpf) : null;
        if (cpfDigits && cpfDigits.length === 11) {
            const { data: existingCpf } = await supabase
                .from('agents')
                .select('id')
                .eq('cpf', cpfDigits)
                .is('deleted_at', null)
                .maybeSingle();

            if (existingCpf) {
                return NextResponse.json(
                    { errors: { cpf: 'Este CPF já está cadastrado.' } },
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

        // ── Normalize fields ─────────────────────────────────────────
        const agentData = {
            user_id: profile.id,
            full_name: body.full_name.trim(),
            cpf: cpfDigits && cpfDigits.length === 11 ? cpfDigits : null,
            creci_number: creciNumber,
            creci_state: creciState,
            agent_type: body.agent_type,
            agency_id: body.agent_type === 'IMOBILIARIA' && body.agency_id?.trim()
                ? body.agency_id.trim()
                : null,
            main_phone: parsePhoneToE164(body.main_phone),
            additional_phone: body.additional_phone?.trim()
                ? parsePhoneToE164(body.additional_phone)
                : null,
            whatsapp_phone: body.whatsapp_phone?.trim()
                ? parsePhoneToE164(body.whatsapp_phone)
                : null,
            email: body.email?.trim() ? normalizeEmail(body.email) : null,
            website: body.website?.trim() ? normalizeWebsite(body.website) : null,
            notes: body.notes?.trim() || null,
            status: body.status,
        };

        // ── Insert agent ─────────────────────────────────────────────
        const { data: agent, error: insertError } = await supabase
            .from('agents')
            .insert(agentData)
            .select()
            .single();

        if (insertError) {
            console.error('[Agents POST] Insert error:', insertError);
            // Handle unique constraint violations
            if (insertError.code === '23505') {
                if (insertError.message?.includes('creci')) {
                    return NextResponse.json(
                        { errors: { creci_number: 'Este CRECI já está cadastrado.' } },
                        { status: 409 }
                    );
                }
                if (insertError.message?.includes('cpf')) {
                    return NextResponse.json(
                        { errors: { cpf: 'Este CPF já está cadastrado.' } },
                        { status: 409 }
                    );
                }
            }
            return NextResponse.json(
                { error: 'Erro ao cadastrar corretor.' },
                { status: 500 }
            );
        }

        console.log('[Agents POST] Created agent:', agent.id, 'user:', profile.id);
        return NextResponse.json({
            success: true,
            agent: { ...agent, agency_name: null },
        });
    } catch (err) {
        console.error('[Agents POST] Unexpected error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
