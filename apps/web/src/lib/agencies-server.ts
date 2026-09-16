import type { AdminSupabase } from "@/lib/api-auth";
import { conflict, forbidden } from "@/lib/api-route";
import { packAgencyMetadata, unpackAgencyMetadata, type AgencyMetadata } from "@/lib/agency-metadata";

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

const META_KEYS: (keyof AgencyMetadata)[] = [
    "service_agreement_url",
    "service_agreement_filename",
    "management_fee",
    "agreement_start_date",
    "agreement_end_date",
];

const isMissingColumn = (error: { code?: string; message?: string } | null) =>
    !!error && (error.code === "42703" || !!error.message?.includes("column"));

/**
 * Inserts (no agencyId) or updates an agency row.
 *
 * The production `agencies` table does not (yet) have the service-agreement
 * columns; when Postgres reports them missing, those fields are packed into a
 * metadata block at the top of `description` (lib/agency-metadata.ts), merged
 * with whatever is already stored there. Remove this fallback once a migration
 * adds the real columns.
 */
export async function writeAgency(
    supabase: AdminSupabase,
    data: Record<string, unknown>,
    agencyId?: string
): Promise<{ agency: Record<string, unknown> | null; error: { code?: string; message?: string } | null }> {
    const run = (payload: Record<string, unknown>) =>
        agencyId
            ? supabase.from("agencies").update(payload).eq("id", agencyId).select().single()
            : supabase.from("agencies").insert(payload).select().single();

    const first = await run(data);
    if (!first.error || !isMissingColumn(first.error)) {
        return { agency: (first.data as Record<string, unknown> | null) ?? null, error: first.error };
    }

    console.warn("[agencies] agreement columns missing; packing metadata into description");
    const core: Record<string, unknown> = { ...data };
    const meta: AgencyMetadata = {};
    for (const k of META_KEYS) {
        if (k in core) {
            (meta as Record<string, unknown>)[k] = core[k];
            delete core[k];
        }
    }

    let baseDescription = core.description as string | null | undefined;
    let merged: AgencyMetadata = meta;
    if (agencyId) {
        const { data: current } = await supabase.from("agencies").select("description").eq("id", agencyId).maybeSingle();
        const currentMeta = current ? (unpackAgencyMetadata(current) as Record<string, unknown>) : {};
        const kept: AgencyMetadata = {};
        for (const k of META_KEYS) if (currentMeta[k] !== undefined) (kept as Record<string, unknown>)[k] = currentMeta[k];
        merged = { ...kept, ...meta };
        if (baseDescription === undefined) baseDescription = (currentMeta.description as string | null | undefined) ?? null;
    }

    const retry = await run({ ...core, description: packAgencyMetadata(baseDescription, merged) });
    return { agency: (retry.data as Record<string, unknown> | null) ?? null, error: retry.error };
}

const LOGO_PUBLIC_SEGMENT = `/storage/v1/object/public/${AGENCY_LOGO_BUCKET}/`;

/** Removes the stored object behind a public agency-logo URL, if it is one of ours. */
export async function removeAgencyLogo(supabase: AdminSupabase, logoUrl: string | null | undefined): Promise<void> {
    if (!logoUrl) return;
    const idx = logoUrl.indexOf(LOGO_PUBLIC_SEGMENT);
    if (idx === -1) return;
    await supabase.storage.from(AGENCY_LOGO_BUCKET).remove([logoUrl.substring(idx + LOGO_PUBLIC_SEGMENT.length)]);
}
