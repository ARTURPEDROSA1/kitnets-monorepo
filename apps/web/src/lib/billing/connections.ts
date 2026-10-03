/**
 * An owner's connections to the payment providers, as the Fatura screens show them. Types and the maths
 * around them (how the certificate stands, what deserves attention); no secret ever reaches this shape —
 * the server builds it from the connection's `metadata` (lib/billing/connections-server.ts).
 */
import type { InterEnvironment } from "./inter-credentials";
import type { StripeEnvironment } from "./stripe-client";

export type ConnectionStatus = "PENDING" | "CONNECTED" | "ERROR";

export interface InterConnectionView {
    status: ConnectionStatus;
    environment: InterEnvironment;
    /** the checking account the integration is tied to */
    account: string | null;
    /** "…a1b2" */
    clientIdTail: string | null;
    certificateSubject: string | null;
    /** ISO timestamp; the bank's certificates last one year */
    certificateExpiresAt: string | null;
    /** what the bank granted on the last successful test */
    scopes: string[];
    /** ISO timestamps */
    configuredAt: string | null;
    lastCheckedAt: string | null;
    /** what the bank (or the check) said when the last test failed */
    lastError: string | null;
    /** the module can issue through it here: connected, certificate in date, and not a sandbox connection on the production site */
    usable: boolean;
}

/** The owner's Stripe account connected to the Kitnets platform (Connect, Standard account). Never a key. */
export interface StripeConnectionView {
    status: ConnectionStatus;
    /** the platform key that connected it: a test connection takes no real money */
    environment: StripeEnvironment;
    /** "acct_…" tail: "…4Xk2" */
    accountTail: string | null;
    /** the business name as Stripe shows it */
    name: string | null;
    country: string | null;
    /** Stripe lets the account take payments */
    chargesEnabled: boolean;
    /** Stripe lets the account be paid out (money reaches the owner's bank) */
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    /** what Stripe still asks of the owner */
    requirementsDue: string[];
    configuredAt: string | null;
    lastCheckedAt: string | null;
    lastError: string | null;
    /** the module can take cards through it here: connected, charges enabled, and the same environment as this server's key */
    usable: boolean;
}

export interface ConnectionsView {
    /** the server can seal secrets (its encryption key is configured); without it nothing can be connected */
    available: boolean;
    /** the bank's sandbox can be chosen (never on the production site) */
    sandboxAllowed: boolean;
    inter: InterConnectionView | null;
    /** the server has the Stripe platform's credentials; without them no card */
    stripeAvailable?: boolean;
    stripe?: StripeConnectionView | null;
}

export const NO_CONNECTIONS: ConnectionsView = { available: false, sandboxAllowed: false, inter: null, stripeAvailable: false, stripe: null };

export const CONNECTION_STATUS_META: Record<ConnectionStatus, { label: string; pill: string }> = {
    CONNECTED: { label: "Conectado", pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
    PENDING: { label: "Não testado", pill: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    ERROR: { label: "Com erro", pill: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300" },
};

/** The bank lets an integration be renewed from 90 days before its certificate expires; the owner is told from then on. */
export const CERTIFICATE_RENEWAL_DAYS = 90;
/** From here on it is urgent. */
export const CERTIFICATE_URGENT_DAYS = 15;

export type CertificateState = "ok" | "renew" | "urgent" | "expired";

/** How the certificate stands on `today` (`YYYY-MM-DD`): days left and whether to renew. Null when its date is unknown. */
export function certificateStanding(expiresAt: string | null, today: string): { daysLeft: number; state: CertificateState } | null {
    if (!expiresAt) return null;
    const end = Date.parse(expiresAt.slice(0, 10) + "T00:00:00Z"), now = Date.parse(today + "T00:00:00Z");
    if (!Number.isFinite(end) || !Number.isFinite(now)) return null;
    const daysLeft = Math.round((end - now) / 86_400_000);
    return { daysLeft, state: daysLeft < 0 ? "expired" : daysLeft <= CERTIFICATE_URGENT_DAYS ? "urgent" : daysLeft <= CERTIFICATE_RENEWAL_DAYS ? "renew" : "ok" };
}

export interface ConnectionAttentionItem {
    kind: "not_connected" | "error" | "sandbox" | "certificate" | "card_not_connected" | "card_pending" | "card_fee";
    tone: "rose" | "amber" | "slate";
    text: string;
    provider: "INTER" | "STRIPE";
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

/**
 * What the owner should know about the bank connection, for the hub's "Atenção". `collects` says the
 * owner has something to invoice: an account that collects nothing is not nagged to connect a bank.
 */
export function connectionAttention(view: ConnectionsView, today: string, collects: boolean, opts: { cardFeeDecided?: boolean } = {}): ConnectionAttentionItem[] {
    const { inter } = view;
    const items: ConnectionAttentionItem[] = [];
    if (!inter) {
        // nothing the owner can do while the server cannot seal secrets
        if (collects && view.available) items.push({ kind: "not_connected", tone: "slate", text: "não conectado: conecte a sua integração para emitir boleto e PIX", provider: "INTER" });
    } else {
        const cert = certificateStanding(inter.certificateExpiresAt, today);
        if (inter.status === "ERROR") items.push({ kind: "error", tone: "rose", text: inter.lastError ? `a conexão falhou: ${inter.lastError}` : "a conexão falhou no último teste", provider: "INTER" });
        else if (inter.status === "PENDING") items.push({ kind: "error", tone: "amber", text: "credenciais salvas, mas a conexão ainda não foi testada", provider: "INTER" });
        else if (inter.environment === "SANDBOX" && !view.sandboxAllowed) items.push({ kind: "sandbox", tone: "amber", text: "a conexão é do ambiente de testes do banco: cadastre a integração de produção", provider: "INTER" });
        if (cert?.state === "expired") items.push({ kind: "certificate", tone: "rose", text: "o certificado venceu: renove a integração no Internet Banking e envie os novos arquivos", provider: "INTER" });
        else if (cert && cert.state !== "ok") {
            items.push({ kind: "certificate", tone: cert.state === "urgent" ? "rose" : "amber", text: `o certificado vence em ${plural(cert.daysLeft, "dia", "dias")}: renove a integração no Internet Banking`, provider: "INTER" });
        }
    }
    items.push(...stripeAttention(view, collects, opts.cardFeeDecided === true));
    return items;
}

/**
 * The card is optional: an owner who collects is told, quietly, how to offer it; one who connected is
 * told what still keeps it from working (Stripe's own review, a test connection on the live site, the
 * fee not yet decided).
 */
export function stripeAttention(view: ConnectionsView, collects: boolean, cardFeeDecided: boolean): ConnectionAttentionItem[] {
    if (!view.stripeAvailable) return [];
    const { stripe } = view;
    if (!stripe) return collects ? [{ kind: "card_not_connected", tone: "slate", text: "cartão de crédito: conecte a sua conta Stripe para oferecê-lo ao inquilino", provider: "STRIPE" }] : [];
    const items: ConnectionAttentionItem[] = [];
    if (stripe.status === "ERROR") items.push({ kind: "error", tone: "rose", text: stripe.lastError ? `a conexão com a Stripe falhou: ${stripe.lastError}` : "a conexão com a Stripe falhou", provider: "STRIPE" });
    else if (!stripe.chargesEnabled) items.push({ kind: "card_pending", tone: "amber", text: stripe.requirementsDue.length > 0 ? "a Stripe ainda pede dados da sua conta antes de liberar cobranças: complete o cadastro no painel da Stripe" : "a Stripe ainda não liberou cobranças na sua conta", provider: "STRIPE" });
    else if (!stripe.usable) items.push({ kind: "sandbox", tone: "amber", text: stripe.environment === "SANDBOX" ? "a conta Stripe conectada é de teste: conecte a conta real" : "a conta Stripe conectada é real, mas este servidor usa a chave de teste", provider: "STRIPE" });
    else if (!cardFeeDecided) items.push({ kind: "card_fee", tone: "slate", text: "cartão conectado: informe a taxa do cartão em Configuração para oferecê-lo ao inquilino", provider: "STRIPE" });
    return items;
}
