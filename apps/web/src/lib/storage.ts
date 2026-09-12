import type { SupabaseClient } from "@supabase/supabase-js";

/** Default lifetime of a signed download URL (seconds). */
export const SIGNED_URL_TTL = 60 * 60;

/**
 * Returns the object path inside `bucket` for either a bare path or a stored
 * Supabase Storage URL (public or signed). Returns null when the URL points
 * at a different bucket/host.
 *
 *   extractStoragePath("lease-documents", "abc/1.pdf")                       → "abc/1.pdf"
 *   extractStoragePath("lease-documents", "https://x.supabase.co/storage/v1/object/public/lease-documents/abc/1.pdf") → "abc/1.pdf"
 */
export function extractStoragePath(bucket: string, urlOrPath: string | null | undefined): string | null {
    if (!urlOrPath) return null;
    const value = urlOrPath.trim();
    if (!/^https?:\/\//i.test(value)) {
        return value.replace(/^\/+/, "") || null;
    }
    try {
        const { pathname } = new URL(value);
        const marker = `/storage/v1/object/`;
        const idx = pathname.indexOf(marker);
        if (idx === -1) return null;
        // /storage/v1/object/{public|sign|authenticated}/{bucket}/{path}
        const rest = pathname.slice(idx + marker.length).split("/");
        const [, bucketName, ...pathParts] = rest;
        if (bucketName !== bucket || pathParts.length === 0) return null;
        return decodeURIComponent(pathParts.join("/"));
    } catch {
        return null;
    }
}

/**
 * Creates a short-lived signed URL for an object in a private bucket.
 * Accepts either a bare path or a previously stored public URL.
 */
export async function signStorageUrl(
    supabase: SupabaseClient,
    bucket: string,
    urlOrPath: string | null | undefined,
    expiresIn: number = SIGNED_URL_TTL
): Promise<string | null> {
    const path = extractStoragePath(bucket, urlOrPath);
    if (!path) return null;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) {
        return null;
    }
    return data.signedUrl;
}
