import type { AdminSupabase } from "@/lib/api-auth";
import { LEASE_DOCUMENTS_BUCKET } from "@/lib/leases-server";

/**
 * Lease agreements uploaded straight to storage.
 *
 * A request body on Vercel stops at 4.5 MB (413 FUNCTION_PAYLOAD_TOO_LARGE, before the route runs),
 * and a signed, scanned lease is easily bigger. So the browser asks for a signed upload URL, sends the
 * file to the private bucket itself, and the routes then work from the object's path: the import reads
 * it, and the saved lease adopts it as its CONTRACT document.
 */

export const STAGED_UPLOAD_MIME_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
export const STAGED_UPLOAD_MAX_SIZE = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
    "application/pdf": "pdf", "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
};

/** Where an account's staged uploads live: nothing outside this folder is ever read or moved on its behalf. */
export const stagedFolder = (profileId: string) => `imports/${profileId}`;

export function newStagedPath(profileId: string, mimeType: string): string {
    return `${stagedFolder(profileId)}/${crypto.randomUUID()}.${EXTENSIONS[mimeType] ?? "bin"}`;
}

/** The path when it is one of the account's staged uploads, else null (other folders, traversal, URLs). */
export function ownStagedPath(profileId: string, path: unknown): string | null {
    if (typeof path !== "string") return null;
    const pattern = new RegExp(`^imports/${profileId.replace(/[^a-zA-Z0-9-]/g, "")}/[0-9a-f-]{36}\\.(pdf|jpg|png|webp)$`);
    return pattern.test(path) ? path : null;
}

export function mimeTypeOfStagedPath(path: string): string {
    const ext = path.split(".").pop();
    return ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

/** The staged file's bytes, or null when it is missing or over the limit. */
export async function downloadStagedUpload(supabase: AdminSupabase, path: string): Promise<Buffer | null> {
    const { data, error } = await supabase.storage.from(LEASE_DOCUMENTS_BUCKET).download(path);
    if (error || !data) return null;
    const buffer = Buffer.from(await data.arrayBuffer());
    return buffer.length > 0 && buffer.length <= STAGED_UPLOAD_MAX_SIZE ? buffer : null;
}
