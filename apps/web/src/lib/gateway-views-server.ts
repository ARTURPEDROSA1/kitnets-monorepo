/**
 * The IoT gateways of the founder-only pilot, on the server: whether the account is on the pilot list
 * and its gateways. Read by /proprietario ("Meus Gateways", at the bottom) and by the layout that keeps
 * /dashboard/gateway/* to the pilot accounts. The ingest API routes are not gated here: the devices
 * authenticate on their own.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { env } from "@/lib/env";
import type { GatewayView } from "@/lib/gateway-views";
import { canSeeGateways } from "@/lib/gateways-access";

/** A gateway is online when it reported in the last ten minutes. */
const ONLINE_WINDOW_MS = 10 * 60 * 1000;

/** Whether the account is on the pilot list (its `profiles.email` against GATEWAY_PILOT_EMAILS). */
export async function isGatewayPilot(supabase: AdminSupabase, profileId: string): Promise<boolean> {
    const { data, error } = await supabase.from("profiles").select("email").eq("id", profileId).maybeSingle();
    if (error) throw new Error(`profile: ${error.message}`);
    return canSeeGateways(typeof data?.email === "string" ? data.email : null, env.GATEWAY_PILOT_EMAILS);
}

/**
 * The account's gateways. The ingest API stamps `last_seen_at`; a gateway that never reported reads "Nunca".
 * (An old page fell back to the newest meter reading of any account, which leaked another owner's sync time.)
 */
export async function loadGateways(supabase: AdminSupabase, profileId: string): Promise<GatewayView[]> {
    const { data, error } = await supabase.from("gateways").select("id, label, serial_number, status, last_seen_at, property_id").eq("owner_id", profileId).order("created_at", { ascending: true });
    if (error) throw new Error(`gateways: ${error.message}`);
    const now = Date.now();
    const rows = (data ?? []) as Array<{ id: string; label: string | null; serial_number: string; status: string | null; last_seen_at: string | null; property_id: string | null }>;
    return rows.map(gw => {
        const seen = gw.last_seen_at ? Date.parse(gw.last_seen_at) : NaN;
        return { id: gw.id, label: gw.label, serialNumber: gw.serial_number, status: gw.status, lastSeenAt: gw.last_seen_at, online: Number.isFinite(seen) && now - seen < ONLINE_WINDOW_MS, propertyId: gw.property_id };
    });
}

/** The pilot block's data: null when the account is not on the pilot list, so the block is not rendered. */
export async function loadPilotGateways(supabase: AdminSupabase, profileId: string): Promise<GatewayView[] | null> {
    if (!(await isGatewayPilot(supabase, profileId))) return null;
    return loadGateways(supabase, profileId);
}
