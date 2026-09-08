import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase service credentials');
    return createClient(url, key);
}

const ALLOWED_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

/**
 * POST /api/agencies/[id]/agreement
 * Uploads a service agreement / contract file for an agency.
 * Expects multipart/form-data with a "file" field.
 * Returns { success: true, agreement_url: string, filename: string }
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

        const { id: agencyId } = await params;
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

        // ── Parse multipart form data ────────────────────────────────
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: 'Formato não suportado. Use PDF, DOC, DOCX, JPG, PNG ou WebP.' },
                { status: 400 }
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: 'Arquivo muito grande. Máximo 15 MB.' },
                { status: 400 }
            );
        }

        // ── Upload to Supabase Storage ───────────────────────────────
        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'pdf';
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileName = `agreements/${agencyId}/${Date.now()}_${sanitizedName}`;

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { error: uploadError } = await supabase.storage
            .from('agency-logos')
            .upload(fileName, buffer, {
                contentType: file.type,
                upsert: true,
            });

        if (uploadError) {
            console.error('[Agreement Upload] Storage error:', uploadError);
            return NextResponse.json(
                { error: 'Erro ao fazer upload do documento.' },
                { status: 500 }
            );
        }

        // ── Get public URL ───────────────────────────────────────────
        const { data: { publicUrl } } = supabase.storage
            .from('agency-logos')
            .getPublicUrl(fileName);

        // ── Update agency record ─────────────────────────────────────
        try {
            await supabase
                .from('agencies')
                .update({
                    service_agreement_url: publicUrl,
                    service_agreement_filename: file.name,
                })
                .eq('id', agencyId);
        } catch (dbErr) {
            console.warn('[Agreement Upload] DB update warning (column might be missing):', dbErr);
        }

        return NextResponse.json({
            success: true,
            agreement_url: publicUrl,
            filename: file.name,
        });
    } catch (err) {
        console.error('[Agreement Upload] Unexpected error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

/**
 * DELETE /api/agencies/[id]/agreement
 * Removes the service agreement from an agency.
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

        // Verify permission
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

        // Clear service_agreement_url
        try {
            await supabase
                .from('agencies')
                .update({
                    service_agreement_url: null,
                    service_agreement_filename: null,
                })
                .eq('id', agencyId);
        } catch (dbErr) {
            console.warn('[Agreement Delete] DB update warning:', dbErr);
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[Agreement Delete] Unexpected error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
