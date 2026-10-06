import type { Metadata } from "next";
import { createAdminClient } from "@/utils/supabase/admin";
import { rateLimitByIp } from "@/lib/rate-limit";
import { referenceOf, rowByShareToken, SHARE_TOKEN_REGEX } from "@/lib/contract/document-server";
import PublicContractView, { PublicContractNotFound } from "@/components/assinar/PublicContractView";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * /assinar/[token] — the contract as the tenant gets it to sign, reached by the link the owner sent
 * (e-mail or WhatsApp). No login: the token is the key. Download the PDF, sign it on gov.br, send the
 * signed file back. Never indexed, never passes the URL on; 60 views per IP per minute.
 */
export const metadata: Metadata = {
    title: "Contrato para assinatura",
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    referrer: "no-referrer",
};

export default async function AssinarPage({ params }: { params: Promise<{ lang: string; token: string }> }) {
    const { token } = await params;
    if (!SHARE_TOKEN_REGEX.test(token)) return <PublicContractNotFound reason="missing" />;
    const limit = await rateLimitByIp("assinar-page", 60, 60_000);
    if (!limit.ok) return <PublicContractNotFound reason="limited" />;

    const supabase = createAdminClient();
    const row = await rowByShareToken(supabase, token);
    if (!row) return <PublicContractNotFound reason="missing" />;
    const [reference, owner] = await Promise.all([
        referenceOf(supabase, row.lease_id),
        supabase.from("leases").select("profile:profiles!user_id(business_name, trade_name), tenant:tenants!primary_tenant_id(full_name)").eq("id", row.lease_id).maybeSingle(),
    ]);
    const joined = (owner.data ?? {}) as { profile?: { business_name?: string | null; trade_name?: string | null } | null; tenant?: { full_name?: string | null } | null };
    const ownerName = joined.profile?.trade_name?.trim() || joined.profile?.business_name?.trim() || "O proprietário";
    const firstName = joined.tenant?.full_name?.trim().split(/\s+/)[0] ?? null;

    return (
        <PublicContractView
            token={token}
            reference={reference}
            ownerName={ownerName}
            tenantFirstName={firstName}
            status={row.status === "SIGNED" ? "SIGNED" : "ACCEPTED"}
            signatureCount={row.signature_count}
            requiredSignatures={row.required_signatures}
            expiresAt={row.share_expires_at!}
        />
    );
}
