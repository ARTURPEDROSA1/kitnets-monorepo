import { NextResponse } from "next/server";
import { notFound, readJsonBody, withAuth } from "@/lib/api-route";
import { loadOwnedLease } from "@/lib/leases-server";
import { EmailError, emailAvailable, sendEmail } from "@/lib/billing/email-provider";
import { senderAddress } from "@/lib/billing/invoice-email";
import { env } from "@/lib/env";
import { contractView, ensureShareLink, loadContractRow, referenceOf, revokeShareLink, signingUrl } from "@/lib/contract/document-server";
import { contractShareEmail } from "@/lib/contract/share-email";

type Params = { id: string };

/**
 * POST /api/leases/[id]/contrato/link  { email?: boolean }
 * The tenant's signing link (/assinar/<token>, 30 days): the live one or a new one. With `email`, it
 * also goes to the tenant's e-mail (Resend), from the owner's name, replies to the owner.
 */
export const POST = withAuth<undefined, Params>(
    { tag: "Contract share link", limit: { scope: "contract-link", limit: 20, windowMs: 60_000 } },
    async ({ req, params, profileId, supabase }) => {
        const lease = await loadOwnedLease(supabase, params.id, profileId, "id, primary_tenant_id");
        const body = await readJsonBody(req).catch(() => ({} as Record<string, unknown>));
        const row = await loadContractRow(supabase, params.id);
        if (!row) throw notFound("Este contrato ainda não foi gerado.");
        const shared = await ensureShareLink(supabase, row);
        const reference = await referenceOf(supabase, params.id);
        const url = signingUrl(shared.share_token!);

        let emailed = false;
        let emailError: string | null = null;
        if (body.email === true) {
            const [{ data: tenant }, { data: profile }, { data: settings }] = await Promise.all([
                supabase.from("tenants").select("full_name, email").eq("id", String(lease.primary_tenant_id)).maybeSingle(),
                supabase.from("profiles").select("business_name, trade_name, full_name, email").eq("id", profileId).maybeSingle(),
                supabase.from("billing_settings").select("sender_name, reply_to_email").eq("owner_id", profileId).maybeSingle(),
            ]);
            const to = typeof tenant?.email === "string" ? tenant.email.trim() : "";
            if (!emailAvailable()) emailError = "O envio de e-mail não está configurado neste servidor.";
            else if (!to) emailError = "O inquilino não tem e-mail no cadastro.";
            else {
                const ownerName = [settings?.sender_name, profile?.trade_name, profile?.business_name, profile?.full_name].map(v => (typeof v === "string" ? v.trim() : "")).find(Boolean) || "O proprietário";
                const replyTo = [settings?.reply_to_email, profile?.email].map(v => (typeof v === "string" ? v.trim() : "")).find(Boolean) || null;
                const mail = contractShareEmail({ tenantName: tenant?.full_name ?? null, ownerName, reference, url, expiresAt: shared.share_expires_at! });
                try {
                    await sendEmail({
                        from: senderAddress(ownerName, env.BILLING_EMAIL_FROM ?? "Kitnets <faturas@kitnets.com>"),
                        to, replyTo, ...mail,
                        idempotencyKey: `contract-share-${shared.id}-${Date.now()}`,
                    });
                    emailed = true;
                } catch (err) {
                    emailError = err instanceof EmailError ? err.message : "Não foi possível enviar o e-mail.";
                }
            }
        }
        return NextResponse.json({ url, emailed, emailError, document: await contractView(supabase, shared, reference) });
    },
);

/** DELETE /api/leases/[id]/contrato/link — the link stops working. */
export const DELETE = withAuth<undefined, Params>({ tag: "Contract share revoke" }, async ({ params, profileId, supabase }) => {
    await loadOwnedLease(supabase, params.id, profileId);
    const row = await loadContractRow(supabase, params.id);
    if (!row) throw notFound("Este contrato ainda não foi gerado.");
    await revokeShareLink(supabase, row);
    return NextResponse.json({ ok: true });
});
