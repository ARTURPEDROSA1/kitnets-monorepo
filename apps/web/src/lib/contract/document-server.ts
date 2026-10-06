/**
 * The contract document of a lease on the server (table lease_contract_documents, files in the private
 * lease-documents bucket): the draft the editor saves, the PDF the owner accepts, the signed copies
 * that come back from gov.br — from the owner, or from the tenant through the signing link — and, once
 * every party signed, the lease's CONTRACT file.
 */
import { randomBytes } from "node:crypto";
import type { AdminSupabase } from "@/lib/api-auth";
import { HttpError } from "@/lib/api-route";
import { LEASE_DOCUMENTS_BUCKET } from "@/lib/leases-server";
import { env } from "@/lib/env";
import { isContractDoc, type ContractDoc } from "./doc";
import { readPdfSignatures, looksLikePdf } from "./signatures";
import { MAX_SIGNED_PDF_BYTES, SHARE_DAYS, type ContractDocumentView, type ContractSignedVersion } from "./document";
import { contractFileName } from "./template";

export const CONTRACT_DOCUMENTS_TABLE = "lease_contract_documents";
const COLUMNS = "id, lease_id, content, options, status, accepted_at, pdf_path, signed_path, versions, signature_count, signers, required_signatures, signed_at, signed_document_id, share_token, share_expires_at, shared_at, updated_at";

/** A document's JSON as stored is capped: a contract is ~60 KB, ten times that is someone else's file. */
const MAX_CONTENT_CHARS = 600_000;
/** Signed copies one contract may receive (each must add a signature; this bounds a misused link). */
const MAX_VERSIONS = 20;

export interface ContractRow {
    id: string;
    lease_id: string;
    content: unknown;
    options: Record<string, unknown> | null;
    status: "DRAFT" | "ACCEPTED" | "SIGNED";
    accepted_at: string | null;
    pdf_path: string | null;
    signed_path: string | null;
    versions: (ContractSignedVersion & { path: string; signers?: { name: string; cpf: string | null }[] })[];
    signature_count: number;
    signers: { name: string; cpf: string | null }[];
    required_signatures: number;
    signed_at: string | null;
    signed_document_id: string | null;
    share_token: string | null;
    share_expires_at: string | null;
    shared_at: string | null;
    updated_at: string | null;
}

export async function loadContractRow(supabase: AdminSupabase, leaseId: string): Promise<ContractRow | null> {
    const { data, error } = await supabase.from(CONTRACT_DOCUMENTS_TABLE).select(COLUMNS).eq("lease_id", leaseId).maybeSingle();
    if (error) throw new Error(`contract document: ${error.message}`);
    return (data as ContractRow | null) ?? null;
}

export const signingUrl = (token: string, baseUrl: string = env.NEXT_PUBLIC_BASE_URL): string => `${baseUrl.replace(/\/+$/, "")}/pt/assinar/${token}`;

const shareAlive = (row: Pick<ContractRow, "share_token" | "share_expires_at">, now = Date.now()) =>
    !!row.share_token && !!row.share_expires_at && Date.parse(row.share_expires_at) > now;

export async function signedDownload(supabase: AdminSupabase, path: string | null, fileName: string): Promise<string | null> {
    if (!path) return null;
    const { data } = await supabase.storage.from(LEASE_DOCUMENTS_BUCKET).createSignedUrl(path, 60 * 30, { download: fileName });
    return data?.signedUrl ?? null;
}

/** The row as the screens get it, with short-lived download links. */
export async function contractView(supabase: AdminSupabase, row: ContractRow | null, reference: string): Promise<ContractDocumentView> {
    if (!row) {
        return { status: "NONE", content: null, options: null, acceptedAt: null, signedAt: null, signatureCount: 0, requiredSignatures: 0, signers: [], versions: [], pdfUrl: null, signedUrl: null, share: null, updatedAt: null };
    }
    const [pdfUrl, signedUrl] = await Promise.all([
        signedDownload(supabase, row.pdf_path, contractFileName(reference, "para assinatura")),
        signedDownload(supabase, row.signed_path, contractFileName(reference, row.status === "SIGNED" ? "assinado" : `${row.signature_count} assinatura${row.signature_count === 1 ? "" : "s"}`)),
    ]);
    return {
        status: row.status,
        content: isContractDoc(row.content) ? row.content : null,
        options: row.options ?? null,
        acceptedAt: row.accepted_at,
        signedAt: row.signed_at,
        signatureCount: row.signature_count,
        requiredSignatures: row.required_signatures,
        signers: Array.isArray(row.signers) ? row.signers : [],
        versions: (Array.isArray(row.versions) ? row.versions : []).map(v => ({ at: v.at, by: v.by, count: v.count, fromAccepted: v.fromAccepted ?? null })),
        pdfUrl,
        signedUrl,
        share: shareAlive(row) ? { url: signingUrl(row.share_token!), expiresAt: row.share_expires_at!, sharedAt: row.shared_at } : null,
        updatedAt: row.updated_at,
    };
}

/** The editor's document, checked: a ProseMirror doc of reasonable size. */
export function readContent(raw: unknown): ContractDoc {
    const doc = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
    if (!isContractDoc(doc)) throw new HttpError(400, { error: "Documento inválido." });
    if (JSON.stringify(doc).length > MAX_CONTENT_CHARS) throw new HttpError(400, { error: "O documento ficou grande demais." });
    return doc;
}

/** Saves the draft; an accepted contract is frozen until it is reopened. */
export async function saveDraft(supabase: AdminSupabase, leaseId: string, content: ContractDoc, options: Record<string, unknown>): Promise<ContractRow> {
    const current = await loadContractRow(supabase, leaseId);
    if (current && current.status !== "DRAFT") {
        throw new HttpError(409, { error: current.status === "SIGNED" ? "Contrato assinado: mudanças agora só por aditivo." : "Contrato aceito: reabra a edição para mudar o texto." });
    }
    const { data, error } = current
        ? await supabase.from(CONTRACT_DOCUMENTS_TABLE).update({ content, options }).eq("id", current.id).eq("status", "DRAFT").select(COLUMNS).maybeSingle()
        : await supabase.from(CONTRACT_DOCUMENTS_TABLE).insert({ lease_id: leaseId, content, options }).select(COLUMNS).maybeSingle();
    if (error) throw new Error(`save contract draft: ${error.message}`);
    if (!data) throw new HttpError(409, { error: "O contrato mudou de estado. Recarregue a página." });
    return data as ContractRow;
}

function checkPdf(bytes: Uint8Array) {
    if (bytes.length === 0) throw new HttpError(400, { error: "Arquivo vazio." });
    if (bytes.length > MAX_SIGNED_PDF_BYTES) throw new HttpError(400, { error: "Arquivo grande demais (máximo 4 MB)." });
    if (!looksLikePdf(bytes)) throw new HttpError(400, { error: "Envie um arquivo PDF." });
}

async function upload(supabase: AdminSupabase, path: string, bytes: Uint8Array) {
    const { error } = await supabase.storage.from(LEASE_DOCUMENTS_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (error) throw new Error(`upload ${path}: ${error.message}`);
}

async function removeFiles(supabase: AdminSupabase, paths: (string | null | undefined)[]) {
    const list = Array.from(new Set(paths.filter((p): p is string => !!p)));
    if (!list.length) return;
    const { error } = await supabase.storage.from(LEASE_DOCUMENTS_BUCKET).remove(list);
    if (error) console.error("[Contract document] could not remove files:", error.message);
}

/** Accepts the text: stores its PDF and freezes it. */
export async function acceptContract(
    supabase: AdminSupabase,
    leaseId: string,
    input: { content: ContractDoc; options: Record<string, unknown>; pdf: Uint8Array; requiredSignatures: number },
): Promise<ContractRow> {
    checkPdf(input.pdf);
    const current = await loadContractRow(supabase, leaseId);
    if (current && current.status !== "DRAFT") throw new HttpError(409, { error: "Este contrato já foi aceito." });
    const path = `${leaseId}/contrato-${Date.now()}.pdf`;
    await upload(supabase, path, input.pdf);
    const values = {
        content: input.content, options: input.options, status: "ACCEPTED", accepted_at: new Date().toISOString(), pdf_path: path,
        signed_path: null, versions: [], signature_count: 0, signers: [], required_signatures: Math.min(20, Math.max(1, input.requiredSignatures)), signed_at: null,
    };
    const { data, error } = current
        ? await supabase.from(CONTRACT_DOCUMENTS_TABLE).update(values).eq("id", current.id).eq("status", "DRAFT").select(COLUMNS).maybeSingle()
        : await supabase.from(CONTRACT_DOCUMENTS_TABLE).insert({ lease_id: leaseId, ...values }).select(COLUMNS).maybeSingle();
    if (error || !data) {
        await removeFiles(supabase, [path]);
        if (error) throw new Error(`accept contract: ${error.message}`);
        throw new HttpError(409, { error: "O contrato mudou de estado. Recarregue a página." });
    }
    return data as ContractRow;
}

/** Back to editing: the accepted PDF and any signed copy stop counting (and are removed), the link stops working. */
export async function reopenContract(supabase: AdminSupabase, leaseId: string): Promise<ContractRow> {
    const current = await loadContractRow(supabase, leaseId);
    if (!current || current.status === "DRAFT") throw new HttpError(409, { error: "O contrato já está em edição." });
    if (current.status === "SIGNED") throw new HttpError(409, { error: "Contrato assinado: mudanças agora só por aditivo." });
    const { data, error } = await supabase.from(CONTRACT_DOCUMENTS_TABLE)
        .update({ status: "DRAFT", accepted_at: null, pdf_path: null, signed_path: null, versions: [], signature_count: 0, signers: [], share_token: null, share_expires_at: null, shared_at: null })
        .eq("id", current.id).eq("status", "ACCEPTED").select(COLUMNS).maybeSingle();
    if (error) throw new Error(`reopen contract: ${error.message}`);
    if (!data) throw new HttpError(409, { error: "O contrato mudou de estado. Recarregue a página." });
    await removeFiles(supabase, [current.pdf_path, current.signed_path, ...(current.versions ?? []).map(v => v.path)]);
    return data as ContractRow;
}

/** Does `copy` start with the bytes of `original`? (signing on gov.br appends to the file it was given) */
function startsWithBytes(copy: Uint8Array, original: Uint8Array): boolean {
    if (copy.length < original.length) return false;
    for (let i = 0; i < original.length; i++) if (copy[i] !== original[i]) return false;
    return true;
}

async function download(supabase: AdminSupabase, path: string | null): Promise<Uint8Array | null> {
    if (!path) return null;
    const { data } = await supabase.storage.from(LEASE_DOCUMENTS_BUCKET).download(path);
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

/**
 * A copy that came back from gov.br with more signatures than the last one: it becomes the latest
 * copy, and when it carries every party's signature the contract is signed.
 */
export async function receiveSignedCopy(
    supabase: AdminSupabase,
    row: ContractRow,
    bytes: Uint8Array,
    by: "OWNER" | "TENANT",
    reference: string,
): Promise<{ row: ContractRow; count: number; complete: boolean; needsReview: boolean }> {
    checkPdf(bytes);
    if (row.status === "DRAFT") throw new HttpError(409, { error: "O contrato ainda não foi aceito para assinatura." });
    if (row.status === "SIGNED") throw new HttpError(409, { error: "Este contrato já está assinado por todos." });
    if ((row.versions ?? []).length >= MAX_VERSIONS) throw new HttpError(429, { error: "Limite de envios atingido para este contrato. Fale com o proprietário." });
    const read = readPdfSignatures(bytes);
    if (read.count === 0) throw new HttpError(400, { error: "Este PDF não tem assinatura digital. Assine no gov.br (assinador.iti.br) e envie o arquivo que ele baixa." });
    if (read.count <= row.signature_count) {
        throw new HttpError(400, { error: `Este arquivo tem ${read.count} assinatura${read.count === 1 ? "" : "s"} e o contrato já tem ${row.signature_count}: envie a versão mais recente, com a sua assinatura.` });
    }
    const original = await download(supabase, row.pdf_path);
    const fromAccepted = original ? startsWithBytes(bytes, original) : null;

    const at = new Date().toISOString();
    const path = `${row.lease_id}/assinado-${Date.now()}.pdf`;
    await upload(supabase, path, bytes);
    const versions = [...(Array.isArray(row.versions) ? row.versions : []), { path, at, by, count: read.count, fromAccepted, signers: read.signers }];
    const { data, error } = await supabase.from(CONTRACT_DOCUMENTS_TABLE)
        .update({ signed_path: path, signature_count: read.count, signers: read.signers, versions })
        .eq("id", row.id).eq("status", "ACCEPTED").eq("signature_count", row.signature_count).select(COLUMNS).maybeSingle();
    if (error || !data) {
        await removeFiles(supabase, [path]);
        if (error) throw new Error(`signed copy: ${error.message}`);
        throw new HttpError(409, { error: "Outra assinatura chegou ao mesmo tempo. Recarregue e envie a versão mais recente." });
    }
    let updated = data as ContractRow;
    // every signature is there; the contract closes by itself only when the copy grew from the PDF
    // accepted here — anything else (a re-saved file, a forged one) waits for the owner's "Concluir"
    const allSigned = read.count >= updated.required_signatures;
    const complete = allSigned && fromAccepted === true;
    if (complete) updated = await finishContract(supabase, updated, reference);
    return { row: updated, count: read.count, complete, needsReview: allSigned && !complete };
}

/** Every party signed (or the owner says so): the latest copy becomes the lease's CONTRACT file. */
export async function finishContract(supabase: AdminSupabase, row: ContractRow, reference: string): Promise<ContractRow> {
    if (row.status === "SIGNED") return row;
    if (!row.signed_path) throw new HttpError(409, { error: "Envie primeiro o PDF assinado." });
    const filePath = `${row.lease_id}/${Date.now()}.pdf`;
    const bucket = supabase.storage.from(LEASE_DOCUMENTS_BUCKET);
    const { error: copyError } = await bucket.copy(row.signed_path, filePath);
    if (copyError) throw new Error(`copy signed contract: ${copyError.message}`);
    const { data: listed } = await bucket.list(row.lease_id, { search: filePath.slice(filePath.lastIndexOf("/") + 1) });
    const size = Number((listed?.[0]?.metadata as { size?: number } | undefined)?.size);
    const { data: doc, error: docError } = await supabase.from("lease_documents").insert({
        lease_id: row.lease_id, document_type: "CONTRACT", file_url: filePath, file_name: contractFileName(reference, "assinado"),
        file_size: Number.isFinite(size) ? size : null, mime_type: "application/pdf",
    }).select("id").single();
    if (docError || !doc) {
        await removeFiles(supabase, [filePath]);
        throw new Error(`signed contract file: ${docError?.message ?? "no row"}`);
    }
    const { data, error } = await supabase.from(CONTRACT_DOCUMENTS_TABLE)
        .update({ status: "SIGNED", signed_at: new Date().toISOString(), signed_document_id: doc.id })
        .eq("id", row.id).eq("status", "ACCEPTED").select(COLUMNS).maybeSingle();
    if (error || !data) {
        await supabase.from("lease_documents").delete().eq("id", doc.id);
        await removeFiles(supabase, [filePath]);
        if (error) throw new Error(`finish contract: ${error.message}`);
        throw new HttpError(409, { error: "O contrato mudou de estado. Recarregue a página." });
    }
    return data as ContractRow;
}

/** The tenant's signing link: the live one, or a new one valid for SHARE_DAYS. */
export async function ensureShareLink(supabase: AdminSupabase, row: ContractRow): Promise<ContractRow> {
    if (row.status !== "ACCEPTED") throw new HttpError(409, { error: row.status === "SIGNED" ? "Este contrato já está assinado por todos." : "Aceite o contrato antes de enviá-lo para assinatura." });
    if (shareAlive(row)) {
        const { data } = await supabase.from(CONTRACT_DOCUMENTS_TABLE).update({ shared_at: new Date().toISOString() }).eq("id", row.id).select(COLUMNS).maybeSingle();
        return (data as ContractRow | null) ?? row;
    }
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + SHARE_DAYS * 86400000).toISOString();
    const { data, error } = await supabase.from(CONTRACT_DOCUMENTS_TABLE)
        .update({ share_token: token, share_expires_at: expires, shared_at: new Date().toISOString() })
        .eq("id", row.id).select(COLUMNS).maybeSingle();
    if (error || !data) throw new Error(`share link: ${error?.message ?? "no row"}`);
    return data as ContractRow;
}

export async function revokeShareLink(supabase: AdminSupabase, row: ContractRow): Promise<void> {
    const { error } = await supabase.from(CONTRACT_DOCUMENTS_TABLE).update({ share_token: null, share_expires_at: null }).eq("id", row.id);
    if (error) throw new Error(`revoke share link: ${error.message}`);
}

export const SHARE_TOKEN_REGEX = /^[0-9a-f]{64}$/;

/** The document behind a live signing link; null when the link is unknown or expired. */
export async function rowByShareToken(supabase: AdminSupabase, token: string): Promise<ContractRow | null> {
    if (!SHARE_TOKEN_REGEX.test(token)) return null;
    const { data, error } = await supabase.from(CONTRACT_DOCUMENTS_TABLE).select(COLUMNS).eq("share_token", token).maybeSingle();
    if (error) throw new Error(`contract by token: ${error.message}`);
    const row = data as ContractRow | null;
    return row && shareAlive(row) ? row : null;
}

/** The PDF a party should sign now: the latest signed copy, else the accepted one. */
export const currentPdfPath = (row: Pick<ContractRow, "signed_path" | "pdf_path">): string | null => row.signed_path ?? row.pdf_path;


/** "SANTO ANTONIO · Kitnet 35B": the property and unit a lease names (file names, e-mails). */
export async function referenceOf(supabase: AdminSupabase, leaseId: string): Promise<string> {
    const { data } = await supabase.from("leases").select("unit_name, property:properties!property_id(name)").eq("id", leaseId).maybeSingle();
    const r = (data ?? {}) as { unit_name?: string | null; property?: { name?: string | null } | null };
    return [r.property?.name?.trim(), r.unit_name?.trim()].filter(Boolean).join(" · ") || "Imóvel";
}

/** The bytes of the `file` field of a multipart request, or a 400. */
export async function fileFromForm(req: Request): Promise<Uint8Array> {
    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        throw new HttpError(400, { error: "Envie o arquivo PDF." });
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, { error: "Envie o arquivo PDF." });
    if (file.size > MAX_SIGNED_PDF_BYTES) throw new HttpError(400, { error: "Arquivo grande demais (máximo 4 MB)." });
    return new Uint8Array(await file.arrayBuffer());
}
