import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { syncPropertyRows } from "@/lib/property-rows-server";

/**
 * POST /api/properties/sync
 * Called by the Imóveis page after it saves: every property of the profile gets its `properties` row now
 * (so Contratos, Inquilinos and the rest list a new property right away), the rows take the profile's names,
 * and the page receives each property's row id by slot (0 = the first property, n = additional_properties[n - 1]).
 */
export const POST = withAuth(
    { tag: "Properties sync", limit: { scope: "properties-sync", limit: 30, windowMs: 60_000 } },
    async ({ profileId, supabase }) => {
        const { changed, links } = await syncPropertyRows(supabase, profileId);
        return NextResponse.json({
            changed,
            links: links.filter(l => l.rowId).map(l => ({ slot: l.ref.slot, id: l.rowId, name: l.ref.name })),
        });
    },
);
