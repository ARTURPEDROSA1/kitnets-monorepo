import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export type AdminSupabase = ReturnType<typeof createAdminClient>;

export interface AuthedContext {
    /** Clerk user id (`user_…`) */
    userId: string;
    /** `profiles.id` for the signed-in user */
    profileId: string;
    /** Service-role client. Every query MUST be scoped to `profileId`. */
    supabase: AdminSupabase;
}

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the signed-in Clerk user to their `profiles` row.
 *
 * Returns either `{ ctx }` on success or `{ response }` with a ready-to-return
 * 401/403 so route handlers can do:
 *
 *   const authed = await requireProfile();
 *   if ("response" in authed) return authed.response;
 *   const { profileId, supabase } = authed.ctx;
 */
export async function requireProfile(): Promise<{ ctx: AuthedContext } | { response: NextResponse }> {
    const { userId } = await auth();
    if (!userId) {
        return { response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
    }

    const supabase = createAdminClient();
    const { data: profile, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("clerk_id", userId)
        .maybeSingle();

    if (error) {
        console.error("[requireProfile] profile lookup failed:", error.message);
        return { response: NextResponse.json({ error: "Erro ao carregar perfil" }, { status: 500 }) };
    }
    if (!profile) {
        return { response: NextResponse.json({ error: "Perfil de usuário não encontrado" }, { status: 403 }) };
    }

    return { ctx: { userId, profileId: profile.id, supabase } };
}

/**
 * Returns the property row if `propertyId` is a UUID owned by `profileId`, else null.
 */
export async function getOwnedProperty(
    supabase: AdminSupabase,
    profileId: string,
    propertyId: string | null | undefined,
    columns: string = "id"
): Promise<Record<string, unknown> | null> {
    if (!propertyId || !UUID_REGEX.test(propertyId)) return null;
    // `columns` is intentionally a plain string (not a literal generic) so the
    // Supabase select-parser types don't run on it.
    const { data } = await supabase
        .from("properties")
        .select(columns as "*")
        .eq("id", propertyId)
        .eq("owner_id", profileId)
        .maybeSingle();
    return (data as Record<string, unknown> | null) ?? null;
}
