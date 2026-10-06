import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { ensurePropertyRows } from "@/lib/property-rows-server";

/**
 * POST /api/properties/sync
 * Called by the Imóveis page after it saves: every property of the profile gets its `properties` row
 * now, so Contratos, Inquilinos and the rest list a new property right away.
 */
export const POST = withAuth(
    { tag: "Properties sync", limit: { scope: "properties-sync", limit: 30, windowMs: 60_000 } },
    async ({ profileId, supabase }) => {
        const created = await ensurePropertyRows(supabase, profileId);
        return NextResponse.json({ created });
    },
);
