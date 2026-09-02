import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase service credentials');
    return createClient(url, key);
}

const VALID_DOC_TYPES = ['CONTRACT', 'ADDENDUM', 'INSPECTION', 'TENANT_DOC', 'DEPOSIT_RECEIPT', 'OTHER'];
const ALLOWED_MIMES = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/leases/[id]/documents
 * Upload a document to a lease. Accepts FormData with `file` and `document_type`.
 */
export async function POST(request: Request, context: RouteContext) {
    try {
        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const { id: leaseId } = await context.params;
        const supabase = getServiceSupabase();

        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('clerk_id', user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
        }

        // Verify lease ownership
        const { data: lease } = await supabase
            .from('leases')
            .select('id')
            .eq('id', leaseId)
            .eq('user_id', profile.id)
            .is('deleted_at', null)
            .maybeSingle();

        if (!lease) {
            return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 });
        }

        // Parse form data
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const documentType = (formData.get('document_type') as string) || 'OTHER';

        if (!file) {
            return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
        }

        if (!ALLOWED_MIMES.includes(file.type)) {
            return NextResponse.json(
                { error: 'Tipo de arquivo não suportado. Use PDF, JPG ou PNG.' },
                { status: 400 }
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: 'Arquivo muito grande. Máximo 5 MB.' },
                { status: 400 }
            );
        }

        if (!VALID_DOC_TYPES.includes(documentType)) {
            return NextResponse.json(
                { error: 'Tipo de documento inválido.' },
                { status: 400 }
            );
        }

        // ── Upload to Supabase Storage ───────────────────────────────
        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'pdf';
        const fileName = `${leaseId}/${Date.now()}.${fileExt}`;

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { error: uploadError } = await supabase.storage
            .from('lease-documents')
            .upload(fileName, buffer, {
                contentType: file.type,
                upsert: false,
            });

        if (uploadError) {
            console.error('[Lease Doc Upload] Storage error:', uploadError);
            return NextResponse.json(
                { error: 'Erro ao fazer upload do documento.' },
                { status: 500 }
            );
        }

        // ── Get public URL ───────────────────────────────────────────
        const { data: { publicUrl } } = supabase.storage
            .from('lease-documents')
            .getPublicUrl(fileName);

        // ── Insert document record ───────────────────────────────────
        const { data: doc, error: insertError } = await supabase
            .from('lease_documents')
            .insert({
                lease_id: leaseId,
                document_type: documentType,
                file_url: publicUrl,
                file_name: file.name,
                file_size: file.size,
                mime_type: file.type,
            })
            .select()
            .single();

        if (insertError) {
            console.error('[Lease Doc Upload] DB insert error:', insertError);
            return NextResponse.json(
                { error: 'Erro ao registrar documento.' },
                { status: 500 }
            );
        }

        return NextResponse.json({ document: doc }, { status: 201 });
    } catch (err) {
        console.error('[Lease Doc Upload] Error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

/**
 * DELETE /api/leases/[id]/documents
 * Delete a document by document_id (passed as query param ?doc_id=xxx).
 */
export async function DELETE(request: Request, context: RouteContext) {
    try {
        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const { id: leaseId } = await context.params;
        const supabase = getServiceSupabase();

        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('clerk_id', user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
        }

        // Verify lease ownership
        const { data: lease } = await supabase
            .from('leases')
            .select('id')
            .eq('id', leaseId)
            .eq('user_id', profile.id)
            .is('deleted_at', null)
            .maybeSingle();

        if (!lease) {
            return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 });
        }

        // Get document_id from query params
        const url = new URL(request.url);
        const docId = url.searchParams.get('doc_id');

        if (!docId) {
            return NextResponse.json({ error: 'ID do documento é obrigatório.' }, { status: 400 });
        }

        // Fetch the document record
        const { data: doc } = await supabase
            .from('lease_documents')
            .select('id, file_url')
            .eq('id', docId)
            .eq('lease_id', leaseId)
            .maybeSingle();

        if (!doc) {
            return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
        }

        // Delete from Supabase Storage
        if (doc.file_url) {
            const bucketSegment = '/storage/v1/object/public/lease-documents/';
            const idx = doc.file_url.indexOf(bucketSegment);
            if (idx !== -1) {
                const storagePath = doc.file_url.substring(idx + bucketSegment.length);
                await supabase.storage.from('lease-documents').remove([storagePath]);
            }
        }

        // Delete DB record
        const { error: deleteError } = await supabase
            .from('lease_documents')
            .delete()
            .eq('id', docId);

        if (deleteError) {
            console.error('[Lease Doc Delete] DB error:', deleteError);
            return NextResponse.json({ error: 'Erro ao excluir documento.' }, { status: 500 });
        }

        return NextResponse.json({ message: 'Documento excluído com sucesso.' });
    } catch (err) {
        console.error('[Lease Doc Delete] Error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
