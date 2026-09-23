/**
 * Browser side of the Projetos uploads (server side and the reason:
 * lib/new-investments-server.ts). The file goes straight to storage through a signed URL, so
 * routes receive its path and never its bytes.
 */

import type { DocumentKind } from "./new-investments";
import { readByFromJson, type ReadBy } from "./ai-reader-label";

export const INVESTMENT_UPLOAD_MAX_SIZE = 20 * 1024 * 1024;
export const INVESTMENT_UPLOAD_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";

const MIME_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];

/** The message to show when the file cannot be sent at all, else null. */
export function checkInvestmentFile(file: File): string | null {
    if (!MIME_TYPES.includes(file.type)) return "Formato não suportado. Use PDF, JPG, PNG ou WebP.";
    if (file.size <= 0 || file.size > INVESTMENT_UPLOAD_MAX_SIZE) return "Arquivo muito grande. O limite máximo é 20MB.";
    return null;
}

/** Uploads the file to the account's staging folder. → its storage path, or the message to show. */
export async function stageInvestmentFile(file: File): Promise<{ path: string } | { error: string }> {
    const invalid = checkInvestmentFile(file);
    if (invalid) return { error: invalid };
    try {
        const res = await fetch("/api/investments/upload-url", {
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

/** Stages the file and files it under the investment. → the created document, or the message. */
/** The AI put the file in another section than the one the owner picked; the UI says so. */
export interface ClassifiedMove {
    from: DocumentKind;
    to: DocumentKind;
    read_by: ReadBy | null;
    reason: string | null;
}

export async function attachInvestmentDocument(
    investmentId: string,
    file: File,
    kind: "CONTRACT" | "MARKETING" | "PHOTO" | "LAYOUT" | "RECEIPT" | "OTHER",
    stagedPath?: string | null
): Promise<{ document: Record<string, unknown>; classified: ClassifiedMove | null } | { error: string }> {
    const staged = stagedPath ? { path: stagedPath } : await stageInvestmentFile(file);
    if ("error" in staged) return staged;
    try {
        const res = await fetch(`/api/investments/${investmentId}/documents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                kind,
                storage_path: staged.path,
                file_name: file.name.slice(0, 200),
                mime_type: file.type,
                size_bytes: file.size,
            }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            const message = typeof json.error === "string" ? json.error : json.errors?.storage_path;
            return { error: typeof message === "string" ? message : "Não foi possível anexar o arquivo." };
        }
        const move = json.classified;
        const classified: ClassifiedMove | null =
            move && typeof move === "object" && typeof move.to === "string" && typeof move.from === "string"
                ? { from: move.from, to: move.to, read_by: readByFromJson(move.read_by), reason: typeof move.reason === "string" ? move.reason : null }
                : null;
        return { document: json.document, classified };
    } catch {
        return { error: "Erro de conexão ao anexar o arquivo. Tente novamente." };
    }
}
