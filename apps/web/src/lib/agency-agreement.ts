import type { SupabaseClient } from "@supabase/supabase-js";
import { extractStoragePath, signStorageUrl } from "@/lib/storage";

/** Bucket that holds agency service agreements (private). */
export const AGREEMENT_BUCKET = "documents";

/**
 * Normalizes what the client sends back as `service_agreement_url` before it
 * is stored. The UI receives a short-lived signed URL; if it round-trips that
 * URL on save we must store the object PATH, never the signed URL (which
 * expires). Anything that isn't one of our storage URLs is kept as-is.
 */
export function normalizeAgreementUrl(input: unknown): string | null {
    if (typeof input !== "string" || !input.trim()) return null;
    const value = input.trim();
    const path = extractStoragePath(AGREEMENT_BUCKET, value);
    if (path) return path;
    // Signed URLs carry ?token=…; extractStoragePath strips the query already.
    return value.slice(0, 2000);
}

/**
 * Returns a copy of the agency with `service_agreement_url` replaced by a
 * 1-hour signed URL when it points into the private documents bucket.
 */
export async function withSignedAgreement<T extends { service_agreement_url?: string | null }>(
    supabase: SupabaseClient,
    agency: T
): Promise<T> {
    const raw = agency.service_agreement_url;
    if (!raw) return agency;
    const path = extractStoragePath(AGREEMENT_BUCKET, raw);
    if (!path) return agency;
    const signed = await signStorageUrl(supabase, AGREEMENT_BUCKET, path);
    return signed ? { ...agency, service_agreement_url: signed } : agency;
}
