/**
 * Browser side of the lease agreement upload (server side and the reason: lib/lease-uploads-server.ts).
 * The file goes straight to storage through a signed URL; routes then receive its path, not its bytes.
 */

/** Below this a file still fits in a route body, so a failed direct upload can fall back to multipart. */
export const ROUTE_BODY_SAFE_SIZE = 4 * 1024 * 1024;

/** Uploads the file to the account's staging folder. → its storage path, or the message to show. */
export async function stageLeaseFile(file: File): Promise<{ path: string } | { error: string }> {
    try {
        const res = await fetch("/api/leases/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mime_type: file.type, size: file.size }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || typeof json.path !== "string" || typeof json.signed_url !== "string") {
            return { error: typeof json.error === "string" ? json.error : "Não foi possível preparar o envio do arquivo." };
        }

        const put = await fetch(json.signed_url, {
            method: "PUT",
            headers: { "Content-Type": file.type, "x-upsert": "false" },
            body: file,
        });
        if (!put.ok) return { error: "Não foi possível enviar o arquivo. Tente novamente." };
        return { path: json.path };
    } catch {
        return { error: "Erro de conexão ao enviar o arquivo. Tente novamente." };
    }
}

export const LEASE_UPLOAD_MAX_SIZE = 10 * 1024 * 1024;
export const LEASE_UPLOAD_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";
const LEASE_UPLOAD_MIME_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];

/** The message to show when the file cannot be sent at all, else null. */
export function checkLeaseFile(file: File): string | null {
    if (!LEASE_UPLOAD_MIME_TYPES.includes(file.type)) return "Formato não suportado. Use PDF, JPG, PNG ou WebP.";
    if (file.size <= 0 || file.size > LEASE_UPLOAD_MAX_SIZE) return "Arquivo muito grande. O limite máximo é 10MB.";
    return null;
}

/**
 * Files a document under a lease (contract, addendum, inspection report…): adopts the staged upload
 * when there is one, else stages the file and adopts it; a file that still fits a route body falls
 * back to multipart when staging fails. → the created document, or the message to show.
 */
export async function attachLeaseDocument(
    leaseId: string,
    file: File,
    documentType: "CONTRACT" | "ADDENDUM" | "INSPECTION" | "TENANT_DOC" | "DEPOSIT_RECEIPT" | "OTHER",
    storagePath?: string | null
): Promise<{ document: Record<string, unknown> } | { error: string }> {
    const invalid = storagePath ? null : checkLeaseFile(file);
    if (invalid) return { error: invalid };
    try {
        const staged = storagePath ? { path: storagePath } : await stageLeaseFile(file);
        let res: Response;
        if ("path" in staged) {
            res = await fetch(`/api/leases/${leaseId}/documents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ storage_path: staged.path, file_name: file.name, document_type: documentType }),
            });
        } else if (file.size <= ROUTE_BODY_SAFE_SIZE) {
            const body = new FormData();
            body.append("file", file);
            body.append("document_type", documentType);
            res = await fetch(`/api/leases/${leaseId}/documents`, { method: "POST", body });
        } else {
            return { error: staged.error };
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { error: typeof json.error === "string" ? json.error : "Não foi possível anexar o arquivo." };
        return { document: json.document ?? {} };
    } catch {
        return { error: "Erro de conexão ao anexar o arquivo. Tente novamente." };
    }
}

/** Attaches an agreement to a lease as its CONTRACT document. → whether it worked. */
export async function attachLeaseContract(leaseId: string, file: File, storagePath?: string | null): Promise<boolean> {
    return "document" in (await attachLeaseDocument(leaseId, file, "CONTRACT", storagePath));
}
