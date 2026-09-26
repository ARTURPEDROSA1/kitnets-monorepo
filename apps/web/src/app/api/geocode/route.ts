import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { loadMapPins } from "@/lib/dashboard-views-server";
import { geocodeMissing } from "@/lib/geocode-server";
import { HOUR } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/geocode (no body)
 * → { pins, pending, geocoded }
 *
 * Geocodes up to 25 of the account's addresses still missing from the cache (rental properties, live
 * projects, agencies with a contract in force) and returns the map pins again. The addresses come from
 * the account's own registers, never from the request, so nothing can be geocoded on someone's behalf.
 * The dashboard asks at most three times per visit; 10 calls per user per hour (≤ 250 lookups) keeps the
 * paid geocoder within reason — the total across accounts is bounded by the Geocoding API's daily quota
 * in the Cloud console (docs/DASHBOARD_MODULE.md §5).
 */
export const POST = withAuth({ tag: "Geocode POST", limit: { scope: "geocode", limit: 10, windowMs: HOUR } }, async ({ profileId, supabase }) => {
    const first = await loadMapPins(supabase, profileId);
    const geocoded = await geocodeMissing(supabase, first.misses);
    const after = geocoded > 0 ? await loadMapPins(supabase, profileId) : first;
    return NextResponse.json({ pins: after.pins, pending: after.misses.length, geocoded });
});
