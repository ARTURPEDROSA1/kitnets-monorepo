/**
 * An owner's connections to the payment providers, as the Fatura screens show them. Types and the maths
 * around them (how the certificate stands, what deserves attention); no secret ever reaches this shape —
 * the server builds it from the connection's `metadata` (lib/billing/connections-server.ts).
 */
import type { InterEnvironment } from "./inter-credentials";

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

export interface ConnectionsView {
    /** the server can seal secrets (its encryption key is configured); without it nothing can be connected */
    available: boolean;
    /** the bank's sandbox can be chosen (never on the production site) */
    sandboxAllowed: boolean;
    inter: InterConnectionView | null;
}

export const NO_CONNECTIONS: ConnectionsView = { available: false, sandboxAllowed: false, inter: null };

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
    kind: "not_connected" | "error" | "sandbox" | "certificate";
    tone: "rose" | "amber" | "slate";
    text: string;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

/**
 * What the owner should know about the bank connection, for the hub's "Atenção". `collects` says the
 * owner has something to invoice: an account that collects nothing is not nagged to connect a bank.
 */
export function connectionAttention(view: ConnectionsView, today: string, collects: boolean): ConnectionAttentionItem[] {
    const { inter } = view;
    if (!inter) {
        // nothing the owner can do while the server cannot seal secrets
        return collects && view.available
            ? [{ kind: "not_connected", tone: "slate", text: "não conectado: conecte a sua integração para emitir boleto e PIX" }]
            : [];
    }
    const items: ConnectionAttentionItem[] = [];
    const cert = certificateStanding(inter.certificateExpiresAt, today);
    if (inter.status === "ERROR") items.push({ kind: "error", tone: "rose", text: inter.lastError ? `a conexão falhou: ${inter.lastError}` : "a conexão falhou no último teste" });
    else if (inter.status === "PENDING") items.push({ kind: "error", tone: "amber", text: "credenciais salvas, mas a conexão ainda não foi testada" });
    else if (inter.environment === "SANDBOX" && !view.sandboxAllowed) items.push({ kind: "sandbox", tone: "amber", text: "a conexão é do ambiente de testes do banco: cadastre a integração de produção" });
    if (cert?.state === "expired") items.push({ kind: "certificate", tone: "rose", text: "o certificado venceu: renove a integração no Internet Banking e envie os novos arquivos" });
    else if (cert && cert.state !== "ok") {
        items.push({ kind: "certificate", tone: cert.state === "urgent" ? "rose" : "amber", text: `o certificado vence em ${plural(cert.daysLeft, "dia", "dias")}: renove a integração no Internet Banking` });
    }
    return items;
}
