import type { AdminSupabase } from "@/lib/api-auth";
import { conflict, forbidden } from "@/lib/api-route";
import { AGREEMENT_BUCKET, normalizeAgreementUrl } from "@/lib/agency-agreement";

/**
 * Shared server-side pieces for the agencies (imobiliárias) routes.
 */

export const AGENCY_EDIT_ROLES = ["OWNER", "ADMIN"] as const;
export const AGENCY_LOGO_BUCKET = "agency-logos";

/** The caller's role in the agency, or a 403 with the given message. */
export async function requireAgencyRole(
    supabase: AdminSupabase,
    agencyId: string,
    profileId: string,
    roles: readonly string[],
    message: string
): Promise<string> {
    const { data: membership } = await supabase
        .from("agency_members")
        .select("role")
        .eq("agency_id", agencyId)
        .eq("user_id", profileId)
        .maybeSingle();
    if (!membership || !roles.includes(membership.role)) throw forbidden(message);
    return membership.role as string;
}

/**
 * A CNPJ may exist once among the caller's own agencies (another account may
 * legitimately register the same agency).
 */
export async function assertAgencyCnpjUnique(
    supabase: AdminSupabase,
    profileId: string,
    cnpj: string | null,
    opts: { excludeAgencyId?: string; message: string }
): Promise<void> {
    if (!cnpj) return;
    const { data: memberships } = await supabase.from("agency_members").select("agency_id").eq("user_id", profileId);
    const ids = (memberships || []).map((m) => m.agency_id as string).filter((id) => id !== opts.excludeAgencyId);
    if (ids.length === 0) return;
    const { data: dup } = await supabase
        .from("agencies")
        .select("id")
        .in("id", ids)
        .eq("cnpj", cnpj)
        .is("deleted_at", null)
        .maybeSingle();
    if (dup) throw conflict({ cnpj: opts.message });
}

/** Postgres unique violation on the agencies table (the only unique column is cnpj). */
export function agencyUniqueViolation(error: { code?: string } | null): Record<string, string> | null {
    return error?.code === "23505" ? { cnpj: "Este CNPJ já está cadastrado por outra imobiliária." } : null;
}

/**
 * Inserts (no agencyId) or updates an agency row. The service-agreement fields
 * are real columns since migration 20260916120000_agency_agreement_columns.
 */
export async function writeAgency(
    supabase: AdminSupabase,
    data: Record<string, unknown>,
    agencyId?: string
): Promise<{ agency: Record<string, unknown> | null; error: { code?: string; message?: string } | null }> {
    const { data: row, error } = agencyId
        ? await supabase.from("agencies").update(data).eq("id", agencyId).select().single()
        : await supabase.from("agencies").insert(data).select().single();
    return { agency: (row as Record<string, unknown> | null) ?? null, error };
}

/** Storage path of the agency's current agreement in the private documents bucket. */
export async function currentAgreementPath(supabase: AdminSupabase, agencyId: string): Promise<string | null> {
    const { data } = await supabase.from("agencies").select("service_agreement_url").eq("id", agencyId).maybeSingle();
    return normalizeAgreementUrl(data?.service_agreement_url);
}

/** Deletes an agreement file from the private documents bucket (only paths under agencies/). */
export async function removeAgreementFile(supabase: AdminSupabase, path: string | null | undefined): Promise<void> {
    if (!path || !path.startsWith("agencies/")) return;
    const { error } = await supabase.storage.from(AGREEMENT_BUCKET).remove([path]);
    if (error) console.warn("[agencies] could not remove previous agreement file:", path, error.message);
}

const LOGO_PUBLIC_SEGMENT = `/storage/v1/object/public/${AGENCY_LOGO_BUCKET}/`;

/** Removes the stored object behind a public agency-logo URL, if it is one of ours. */
export async function removeAgencyLogo(supabase: AdminSupabase, logoUrl: string | null | undefined): Promise<void> {
    if (!logoUrl) return;
    const idx = logoUrl.indexOf(LOGO_PUBLIC_SEGMENT);
    if (idx === -1) return;
    await supabase.storage.from(AGENCY_LOGO_BUCKET).remove([logoUrl.substring(idx + LOGO_PUBLIC_SEGMENT.length)]);
}
