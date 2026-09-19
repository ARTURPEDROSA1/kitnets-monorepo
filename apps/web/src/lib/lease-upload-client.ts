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

/** Attaches an agreement to a lease: adopts the staged upload when there is one, else sends the file itself. */
export async function attachLeaseContract(leaseId: string, file: File, storagePath?: string | null): Promise<boolean> {
    try {
        if (storagePath) {
            const res = await fetch(`/api/leases/${leaseId}/documents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ storage_path: storagePath, file_name: file.name, document_type: "CONTRACT" }),
            });
            return res.ok;
        }
        if (file.size > ROUTE_BODY_SAFE_SIZE) return false;
        const body = new FormData();
        body.append("file", file);
        body.append("document_type", "CONTRACT");
        const res = await fetch(`/api/leases/${leaseId}/documents`, { method: "POST", body });
        return res.ok;
    } catch {
        return false;
    }
}
