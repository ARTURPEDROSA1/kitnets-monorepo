import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/api-auth";
import { isGatewayPilot } from "@/lib/gateway-views-server";

/**
 * The gateway pages (/dashboard/gateway/*) belong to the founder-only pilot, not to the product: an
 * account off the pilot list (lib/gateways-access.ts) gets a 404, the same way "Meus Gateways" on
 * /proprietario is not rendered for it. The parent dashboard layout already sends anonymous visitors to
 * the login. The gate is cosmetic: the gateway API routes stay owner-scoped and are not gated here.
 */
export default async function GatewayLayout({ children }: { children: React.ReactNode }) {
    const authed = await requireProfile();
    if ("response" in authed) notFound();
    const { profileId, supabase } = authed.ctx;
    const pilot = await isGatewayPilot(supabase, profileId).catch(err => {
        console.error("[Gateway] pilot check failed:", err);
        return false;
    });
    if (!pilot) notFound();
    return <>{children}</>;
}
