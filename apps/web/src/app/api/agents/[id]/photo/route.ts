import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase service credentials');
    return createClient(url, key);
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

/**
 * POST /api/agents/[id]/photo
 * Uploads a photo for an agent.
 * Expects multipart/form-data with a "file" field.
 * Returns { success: true, photo_url: string }
 */
export async function POST(
    request: Request,
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
            .select('id, user_id, photo_url')
            .eq('id', agentId)
            .is('deleted_at', null)
            .maybeSingle();

        if (!agent) {
            return NextResponse.json({ error: 'Corretor não encontrado.' }, { status: 404 });
        }

        if (agent.user_id !== profile.id) {
            return NextResponse.json(
                { error: 'Sem permissão para editar este corretor.' },
                { status: 403 }
            );
        }

        // ── Parse multipart form data ────────────────────────────────
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: 'Formato não suportado. Use JPG, PNG ou WebP.' },
                { status: 400 }
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: 'Arquivo muito grande. Máximo 2 MB.' },
                { status: 400 }
            );
        }

        // ── Delete old photo if exists ───────────────────────────────
        if (agent.photo_url) {
            const url = agent.photo_url;
            const bucketSegment = '/storage/v1/object/public/agent-photos/';
            const idx = url.indexOf(bucketSegment);
            if (idx !== -1) {
                const oldPath = url.substring(idx + bucketSegment.length);
                await supabase.storage.from('agent-photos').remove([oldPath]);
            }
        }

        // ── Upload to Supabase Storage ───────────────────────────────
        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
        const fileName = `${agentId}/${Date.now()}.${fileExt}`;

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { error: uploadError } = await supabase.storage
            .from('agent-photos')
            .upload(fileName, buffer, {
                contentType: file.type,
                upsert: true,
            });

        if (uploadError) {
            console.error('[Agent Photo Upload] Storage error:', uploadError);
            return NextResponse.json(
                { error: 'Erro ao fazer upload da foto.' },
                { status: 500 }
            );
        }

        // ── Get public URL ───────────────────────────────────────────
        const { data: { publicUrl } } = supabase.storage
            .from('agent-photos')
            .getPublicUrl(fileName);

        // ── Update agent record ──────────────────────────────────────
        const { error: updateError } = await supabase
            .from('agents')
            .update({ photo_url: publicUrl })
            .eq('id', agentId);

        if (updateError) {
            console.error('[Agent Photo Upload] DB update error:', updateError);
            return NextResponse.json({ error: 'Erro ao salvar URL da foto.' }, { status: 500 });
        }

        console.log('[Agent Photo Upload] Success:', agentId, '->', publicUrl);
        return NextResponse.json({ success: true, photo_url: publicUrl });
    } catch (err) {
        console.error('[Agent Photo Upload] Unexpected error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

/**
 * DELETE /api/agents/[id]/photo
 * Removes the photo from an agent.
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

        // Verify ownership
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
            .select('id, user_id, photo_url')
            .eq('id', agentId)
            .is('deleted_at', null)
            .maybeSingle();

        if (!agent) {
            return NextResponse.json({ error: 'Corretor não encontrado.' }, { status: 404 });
        }

        if (agent.user_id !== profile.id) {
            return NextResponse.json(
                { error: 'Sem permissão para editar este corretor.' },
                { status: 403 }
            );
        }

        // Delete from storage
        if (agent.photo_url) {
            const url = agent.photo_url;
            const bucketSegment = '/storage/v1/object/public/agent-photos/';
            const idx = url.indexOf(bucketSegment);
            if (idx !== -1) {
                const oldPath = url.substring(idx + bucketSegment.length);
                await supabase.storage.from('agent-photos').remove([oldPath]);
            }
        }

        // Clear photo_url
        await supabase
            .from('agents')
            .update({ photo_url: null })
            .eq('id', agentId);

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[Agent Photo Delete] Unexpected error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
