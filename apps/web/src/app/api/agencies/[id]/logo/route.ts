import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase service credentials');
    return createClient(url, key);
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

/**
 * POST /api/agencies/[id]/logo
 * Uploads a logo image for an agency.
 * Expects multipart/form-data with a "file" field.
 * Returns { success: true, logo_url: string }
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
                { error: 'Formato não suportado. Use JPG, PNG, WebP ou SVG.' },
                { status: 400 }
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: 'Arquivo muito grande. Máximo 2 MB.' },
                { status: 400 }
            );
        }

        // ── Delete old logo if exists ────────────────────────────────
        const { data: existingAgency } = await supabase
            .from('agencies')
            .select('logo_url')
            .eq('id', agencyId)
            .single();

        if (existingAgency?.logo_url) {
            // Extract storage path from public URL
            const url = existingAgency.logo_url;
            const bucketSegment = '/storage/v1/object/public/agency-logos/';
            const idx = url.indexOf(bucketSegment);
            if (idx !== -1) {
                const oldPath = url.substring(idx + bucketSegment.length);
                await supabase.storage.from('agency-logos').remove([oldPath]);
            }
        }

        // ── Upload to Supabase Storage ───────────────────────────────
        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
        const fileName = `${agencyId}/${Date.now()}.${fileExt}`;

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { error: uploadError } = await supabase.storage
            .from('agency-logos')
            .upload(fileName, buffer, {
                contentType: file.type,
                upsert: true,
            });

        if (uploadError) {
            console.error('[Logo Upload] Storage error:', uploadError);
            return NextResponse.json(
                { error: 'Erro ao fazer upload do logo.' },
                { status: 500 }
            );
        }

        // ── Get public URL ───────────────────────────────────────────
        const { data: { publicUrl } } = supabase.storage
            .from('agency-logos')
            .getPublicUrl(fileName);

        // ── Update agency record ─────────────────────────────────────
        const { error: updateError } = await supabase
            .from('agencies')
            .update({ logo_url: publicUrl })
            .eq('id', agencyId);

        if (updateError) {
            console.error('[Logo Upload] DB update error:', updateError);
            return NextResponse.json({ error: 'Erro ao salvar URL do logo.' }, { status: 500 });
        }

        console.log('[Logo Upload] Success:', agencyId, '->', publicUrl);
        return NextResponse.json({ success: true, logo_url: publicUrl });
    } catch (err) {
        console.error('[Logo Upload] Unexpected error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

/**
 * DELETE /api/agencies/[id]/logo
 * Removes the logo from an agency.
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

        // Get current logo URL to delete from storage
        const { data: agency } = await supabase
            .from('agencies')
            .select('logo_url')
            .eq('id', agencyId)
            .single();

        if (agency?.logo_url) {
            const url = agency.logo_url;
            const bucketSegment = '/storage/v1/object/public/agency-logos/';
            const idx = url.indexOf(bucketSegment);
            if (idx !== -1) {
                const oldPath = url.substring(idx + bucketSegment.length);
                await supabase.storage.from('agency-logos').remove([oldPath]);
            }
        }

        // Clear logo_url
        await supabase
            .from('agencies')
            .update({ logo_url: null })
            .eq('id', agencyId);

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[Logo Delete] Unexpected error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
