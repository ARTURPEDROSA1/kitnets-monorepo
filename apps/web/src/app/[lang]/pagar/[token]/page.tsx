import type { Metadata } from "next";
import QRCode from "qrcode";
import { createAdminClient } from "@/utils/supabase/admin";
import { rateLimitByIp } from "@/lib/rate-limit";
import { todayBRT } from "@/lib/lease-dashboard";
import { PUBLIC_TOKEN_REGEX, publicInvoiceState } from "@/lib/billing/public-invoice";
import { loadPublicInvoice } from "@/lib/billing/public-invoice-server";
import PublicInvoiceView, { PublicInvoiceNotFound } from "@/components/pagar/PublicInvoiceView";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * /pagar/[token] — the invoice as the tenant sees it, reached by the link in the e-mail. No login:
 * the token is the key (components/pagar/PublicInvoiceView.tsx renders it). Never indexed, never
 * passes the URL on; 60 views per IP per minute.
 */
export const metadata: Metadata = {
    title: "Fatura",
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    referrer: "no-referrer",
};

export default async function PagarPage({ params, searchParams }: { params: Promise<{ lang: string; token: string }>; searchParams: Promise<{ cartao?: string | string[]; motivo?: string | string[] }> }) {
    const [{ token }, query] = await Promise.all([params, searchParams]);
    if (!PUBLIC_TOKEN_REGEX.test(token)) return <PublicInvoiceNotFound reason="missing" />;
    const limit = await rateLimitByIp("pagar-page", 60, 60_000);
    if (!limit.ok) return <PublicInvoiceNotFound reason="limited" />;

    const today = todayBRT();
    const cartao = typeof query.cartao === "string" ? query.cartao : null;
    const cardOutcome = cartao === "ok" || cartao === "cancelado" || cartao === "erro" ? cartao : null;
    const invoice = await loadPublicInvoice(createAdminClient(), token, { today, afterCheckout: cardOutcome === "ok" });
    if (!invoice) return <PublicInvoiceNotFound reason="missing" />;

    const state = publicInvoiceState(invoice, today);
    const pix = (state === "pay" || state === "late_pay") ? invoice.charge?.pix_copy_paste ?? null : null;
    const qrSvg = pix ? await QRCode.toString(pix, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : null;
    return (
        <PublicInvoiceView
            invoice={invoice} qrSvg={qrSvg} pdfHref={`/api/pagar/${token}/boleto`} cardAction={`/api/pagar/${token}/cartao`} today={today}
            cardOutcome={cardOutcome} cardError={typeof query.motivo === "string" ? query.motivo.slice(0, 200) : null}
        />
    );
}
