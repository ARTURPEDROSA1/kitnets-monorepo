import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { packAgencyMetadata, unpackAgencyMetadata } from '@/lib/agency-metadata';
import { signStorageUrl } from '@/lib/storage';

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
 * Uploads a service agreement / contract file for an agency to Supabase Storage ('documents').
 * Expects multipart/form-data with a "file" field, and optional fee and dates.
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
        const managementFee = formData.get('management_fee') as string | null;
        const agreementStartDate = formData.get('agreement_start_date') as string | null;
        const agreementEndDate = formData.get('agreement_end_date') as string | null;

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

        // ── Upload to Supabase Storage ('documents' bucket) ──────────
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileName = `agencies/${agencyId}/agreements/${Date.now()}_${sanitizedName}`;

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(fileName, buffer, {
                contentType: file.type,
                upsert: true,
            });

        if (uploadError) {
            console.error('[Agreement Upload] Storage error in documents bucket:', uploadError);
            return NextResponse.json(
                { error: 'Erro ao fazer upload do documento no storage: ' + uploadError.message },
                { status: 500 }
            );
        }

        // The documents bucket is private: store the object PATH and return a
        // short-lived signed URL for immediate viewing.
        const publicUrl = fileName;
        const signedUrl = (await signStorageUrl(supabase, 'documents', fileName)) ?? fileName;

        // ── Update agency record (Native column or packed metadata fallback) ──
        const updatePayload: Record<string, any> = {
            service_agreement_url: publicUrl,
            service_agreement_filename: file.name,
        };
        if (managementFee) updatePayload.management_fee = parseFloat(managementFee);
        if (agreementStartDate) updatePayload.agreement_start_date = agreementStartDate;
        if (agreementEndDate) updatePayload.agreement_end_date = agreementEndDate;

        const { error: dbErr } = await supabase
            .from('agencies')
            .update(updatePayload)
            .eq('id', agencyId);

        if (dbErr && (dbErr.code === '42703' || dbErr.message?.includes('column'))) {
            console.warn('[Agreement Upload] Native column not found (42703), storing metadata into description fallback');
            const { data: currentAgency } = await supabase
                .from('agencies')
                .select('description')
                .eq('id', agencyId)
                .maybeSingle();

            const currentMeta = currentAgency ? unpackAgencyMetadata(currentAgency) : ({} as any);
            const packedDescription = packAgencyMetadata(currentMeta.description, {
                ...currentMeta,
                service_agreement_url: publicUrl,
                service_agreement_filename: file.name,
                management_fee: managementFee ? parseFloat(managementFee) : currentMeta.management_fee,
                agreement_start_date: agreementStartDate || currentMeta.agreement_start_date,
                agreement_end_date: agreementEndDate || currentMeta.agreement_end_date,
            });

            const { error: metaErr } = await supabase
                .from('agencies')
                .update({ description: packedDescription })
                .eq('id', agencyId);

            if (metaErr) {
                console.error('[Agreement Upload] Description metadata update error:', metaErr);
            }
        }

        return NextResponse.json({
            success: true,
            agreement_url: signedUrl,
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

        // Clear service_agreement_url (native or packed description)
        const { error: dbErr } = await supabase
            .from('agencies')
            .update({
                service_agreement_url: null,
                service_agreement_filename: null,
            })
            .eq('id', agencyId);

        if (dbErr && (dbErr.code === '42703' || dbErr.message?.includes('column'))) {
            console.warn('[Agreement Delete] Native column not found, updating packed description');
            const { data: currentAgency } = await supabase
                .from('agencies')
                .select('description')
                .eq('id', agencyId)
                .maybeSingle();

            const currentMeta = currentAgency ? unpackAgencyMetadata(currentAgency) : ({} as any);
            const packedDescription = packAgencyMetadata(currentMeta.description, {
                ...currentMeta,
                service_agreement_url: null,
                service_agreement_filename: null,
            });

            await supabase
                .from('agencies')
                .update({ description: packedDescription })
                .eq('id', agencyId);
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[Agreement Delete] Unexpected error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
