/**
 * The maths behind the Imobiliárias hub and the agency dashboard: status meta, the views, one row
 * per agency (the contracts it administers and their rent, the fee that rent costs, tenants,
 * corretores, the service agreement and its term), the hub totals and the attention list.
 * Pure functions; the components only render.
 */
import type { AgencyStatus, AgencyWithRole } from "@/types/agency";
import type { AgencyAgentSummary, AgencyLeaseSummary, AgencyTenantSummary } from "@/lib/agency-views";
import { IN_FORCE, brl } from "@/lib/lease-dashboard";
import { normalizeText } from "@/lib/lease-extract";
import { monthsElapsed, monthsLabel } from "@/lib/tenant-dashboard";
import { telUrl, whatsappUrl } from "@/lib/social-links";
import { formatCNPJ } from "@/lib/validators";

export { brl, monthsLabel };

// ── Status ───────────────────────────────────────────────────────────

export interface AgencyStatusMeta { label: string; pill: string; bar: string }

export const AGENCY_STATUS_META: Record<AgencyStatus, AgencyStatusMeta> = {
    ACTIVE: { label: "Ativa", pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300", bar: "bg-emerald-500" },
    VERIFIED: { label: "Verificada", pill: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300", bar: "bg-sky-500" },
    DRAFT: { label: "Rascunho", pill: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300", bar: "bg-slate-400" },
    SUSPENDED: { label: "Suspensa", pill: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300", bar: "bg-rose-500" },
};

/** An agency that is working for the account: registered or verified. */
export const ACTIVE_AGENCY: ReadonlySet<AgencyStatus> = new Set<AgencyStatus>(["ACTIVE", "VERIFIED"]);

// ── Views ────────────────────────────────────────────────────────────

export type AgencyView = "ativas" | "inativas" | "todas";
export const DEFAULT_AGENCY_VIEW: AgencyView = "ativas";
export const AGENCY_VIEWS: Array<{ key: AgencyView; label: string; empty: string }> = [
    { key: "ativas", label: "Ativas", empty: "Nenhuma imobiliária ativa." },
    { key: "inativas", label: "Inativas", empty: "Nenhuma imobiliária em rascunho ou suspensa." },
    { key: "todas", label: "Todas", empty: "Nenhuma imobiliária cadastrada." },
];
export const agencyViewFromParam = (v: string | null): AgencyView => (AGENCY_VIEWS.some(x => x.key === v) ? (v as AgencyView) : DEFAULT_AGENCY_VIEW);

export function inAgencyView(status: AgencyStatus, view: AgencyView): boolean {
    if (view === "todas") return true;
    return view === "ativas" ? ACTIVE_AGENCY.has(status) : !ACTIVE_AGENCY.has(status);
}

// ── Fee and agreement ────────────────────────────────────────────────

/** Days before the service agreement ends that count as "vencendo". */
export const AGREEMENT_WARNING_DAYS = 90;

/** "12,5", 12.5, "" → 12.5 / null; a percentage of the rent the agency keeps every month. */
export function feePercent(fee: number | string | null | undefined): number | null {
    if (fee == null || fee === "") return null;
    const n = typeof fee === "number" ? fee : parseFloat(String(fee).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
}

const utc = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); };

/** Calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
    return Math.round((utc(to) - utc(from)) / 86_400_000);
}

export interface AgreementInfo {
    /** a document is attached */
    hasFile: boolean;
    start: string | null;
    end: string | null;
    /** days until the term ends; negative when it has ended; null without an end date */
    daysToEnd: number | null;
    expired: boolean;
    /** ends within AGREEMENT_WARNING_DAYS */
    expiring: boolean;
}

export function agreementInfo(agency: Pick<AgencyWithRole, "service_agreement_url" | "service_agreement_filename" | "agreement_start_date" | "agreement_end_date">, today: string): AgreementInfo {
    const end = agency.agreement_end_date ? agency.agreement_end_date.slice(0, 10) : null;
    const daysToEnd = end ? daysBetween(today, end) : null;
    return {
        hasFile: Boolean(agency.service_agreement_url || agency.service_agreement_filename),
        start: agency.agreement_start_date ? agency.agreement_start_date.slice(0, 10) : null,
        end,
        daysToEnd,
        expired: daysToEnd !== null && daysToEnd < 0,
        expiring: daysToEnd !== null && daysToEnd >= 0 && daysToEnd <= AGREEMENT_WARNING_DAYS,
    };
}

/** "CRECI-J MG 5358" — J for a company, F for a person, plain when the type is not known. */
export function creciLabel(agency: Pick<AgencyWithRole, "creci_number" | "creci_state" | "creci_type">): string | null {
    if (!agency.creci_number) return null;
    const kind = agency.creci_type === "PJ" ? "CRECI-J" : agency.creci_type === "PF" ? "CRECI-F" : "CRECI";
    return [kind, agency.creci_state, agency.creci_number].filter(Boolean).join(" ");
}

// ── Rows ─────────────────────────────────────────────────────────────

export interface AgencyRow {
    agency: AgencyWithRole;
    status: AgencyStatus;
    /** the trade name when there is one, else the company name */
    displayName: string;
    /** every lease the agency administers, newest first */
    leases: AgencyLeaseSummary[];
    /** the ones in force */
    inForce: AgencyLeaseSummary[];
    /** monthly rent of the leases in force (contract value) */
    rentManaged: number;
    /** the administration fee, % of the rent; null when the account never entered it */
    feePct: number | null;
    /** what the fee costs every month on the leases in force (0 when the fee is unknown) */
    monthlyFee: number;
    tenants: AgencyTenantSummary[];
    activeTenants: number;
    agents: AgencyAgentSummary[];
    activeAgents: number;
    agreement: AgreementInfo;
    cnpj: string | null;
    creci: string | null;
    /** "Cidade/UF" */
    place: string;
    whatsapp: string | null;
    tel: string | null;
    hasContact: boolean;
    /** ISO date the agency entered the account */
    since: string;
    monthsRegistered: number;
    /** lower-case, accent-free text for the search box */
    haystack: string;
}

export function agencyRows(agencies: AgencyWithRole[], leases: AgencyLeaseSummary[], tenants: AgencyTenantSummary[], agents: AgencyAgentSummary[], today: string): AgencyRow[] {
    return agencies.map(agency => {
        const mine = leases.filter(l => l.agency_id === agency.id);
        const inForce = mine.filter(l => IN_FORCE.has(l.status));
        const rentManaged = inForce.reduce((s, l) => s + (Number(l.monthly_rent) || 0), 0);
        const feePct = feePercent(agency.management_fee);
        const myTenants = tenants.filter(t => t.agency_id === agency.id);
        const myAgents = agents.filter(g => g.agency_id === agency.id);
        const since = agency.created_at.slice(0, 10);
        const whatsapp = agency.main_phone_whatsapp && agency.main_phone
            ? whatsappUrl(agency.main_phone)
            : agency.additional_phone_whatsapp && agency.additional_phone
                ? whatsappUrl(agency.additional_phone)
                : null;
        const haystack = normalizeText([
            agency.name, agency.trade_name, agency.cnpj, agency.cnpj ? formatCNPJ(agency.cnpj) : null, agency.creci_number, agency.owner_name,
            agency.city, agency.neighborhood, agency.state, agency.email,
            ...mine.map(l => `${l.reference_name ?? ""} ${l.property_name ?? ""} ${l.unit_name ?? ""} ${l.primary_tenant_name ?? ""}`),
            ...myTenants.map(t => t.full_name),
            ...myAgents.map(g => g.full_name),
        ].filter(Boolean).join(" "));
        return {
            agency,
            status: agency.status,
            displayName: agency.trade_name || agency.name,
            leases: mine,
            inForce,
            rentManaged,
            feePct,
            monthlyFee: feePct != null ? (rentManaged * feePct) / 100 : 0,
            tenants: myTenants,
            activeTenants: myTenants.filter(t => t.status === "ACTIVE").length,
            agents: myAgents,
            activeAgents: myAgents.filter(g => g.status === "ACTIVE").length,
            agreement: agreementInfo(agency, today),
            cnpj: agency.cnpj ? formatCNPJ(agency.cnpj) : null,
            creci: creciLabel(agency),
            place: [agency.city, agency.state].filter(Boolean).join("/"),
            whatsapp,
            tel: agency.main_phone ? telUrl(agency.main_phone) : null,
            hasContact: Boolean(agency.main_phone || agency.email),
            since,
            monthsRegistered: monthsElapsed(since, today),
            haystack,
        };
    });
}

// ── Hub totals ───────────────────────────────────────────────────────

export interface AgencyHubTotals {
    total: number;
    active: number;
    inactive: number;
    /** leases in force administered by an agency (each lease once) */
    leasesInForce: number;
    leasesTotal: number;
    /** monthly rent of those leases */
    rentManaged: number;
    /** what the administration fees cost every month, on the agencies whose fee is known */
    monthlyFees: number;
    /** leases in force whose agency has no fee entered: their cost is not in `monthlyFees` */
    feeUnknownLeases: number;
    /** tenants living today with an agency */
    tenantsServed: number;
    /** active corretores working for an agency */
    agentsLinked: number;
    withAgreement: number;
    agreementsExpiring: number;
    agreementsExpired: number;
    /** active agencies without phone or e-mail */
    withoutContact: number;
    /** active agencies with nothing in force and nobody served */
    idle: number;
}

export function agencyHubTotals(rows: AgencyRow[]): AgencyHubTotals {
    const seen = new Set<string>();
    const inForce: AgencyLeaseSummary[] = [];
    let leasesTotal = 0;
    for (const r of rows) {
        for (const l of r.leases) {
            if (seen.has(l.id)) continue;
            seen.add(l.id);
            leasesTotal += 1;
            if (IN_FORCE.has(l.status)) inForce.push(l);
        }
    }
    const tenantIds = new Set(rows.flatMap(r => r.tenants.filter(t => t.status === "ACTIVE").map(t => t.id)));
    const agentIds = new Set(rows.flatMap(r => r.agents.filter(g => g.status === "ACTIVE").map(g => g.id)));
    const active = rows.filter(r => ACTIVE_AGENCY.has(r.status));
    return {
        total: rows.length,
        active: active.length,
        inactive: rows.length - active.length,
        leasesInForce: inForce.length,
        leasesTotal,
        rentManaged: inForce.reduce((s, l) => s + (Number(l.monthly_rent) || 0), 0),
        monthlyFees: rows.reduce((s, r) => s + r.monthlyFee, 0),
        feeUnknownLeases: rows.filter(r => r.feePct == null).reduce((s, r) => s + r.inForce.length, 0),
        tenantsServed: tenantIds.size,
        agentsLinked: agentIds.size,
        withAgreement: rows.filter(r => r.agreement.hasFile).length,
        agreementsExpiring: rows.filter(r => r.agreement.expiring).length,
        agreementsExpired: rows.filter(r => r.agreement.expired).length,
        withoutContact: active.filter(r => !r.hasContact).length,
        idle: active.filter(r => r.inForce.length === 0 && r.activeTenants === 0).length,
    };
}

// ── Attention ────────────────────────────────────────────────────────

export type AgencyAttentionKind =
    | "suspended_with_leases"
    | "agreement_expired"
    | "agreement_expiring"
    | "no_fee_with_leases"
    | "no_agreement_with_leases"
    | "no_contact"
    | "idle";

export interface AgencyAttentionItem {
    kind: AgencyAttentionKind;
    tone: "rose" | "amber" | "slate";
    row: AgencyRow;
    text: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const brDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

/** What deserves a look, worst first: an agency's problems come out in the order they matter. */
export function agencyAttention(rows: AgencyRow[]): AgencyAttentionItem[] {
    const items: AgencyAttentionItem[] = [];
    for (const row of rows) {
        const n = row.inForce.length;
        if (row.status === "SUSPENDED" && n > 0) {
            items.push({ kind: "suspended_with_leases", tone: "rose", row, text: `Suspensa, mas ainda administra ${plural(n, "contrato em vigor", "contratos em vigor")}: reative ou troque a imobiliária nos contratos.` });
        }
        if (row.agreement.expired && row.agreement.end) {
            items.push({ kind: "agreement_expired", tone: "rose", row, text: `Contrato de prestação de serviços vencido em ${brDate(row.agreement.end)}: renove ou atualize a vigência.` });
        } else if (row.agreement.expiring && row.agreement.end && row.agreement.daysToEnd !== null) {
            items.push({ kind: "agreement_expiring", tone: "amber", row, text: row.agreement.daysToEnd === 0 ? `Contrato de prestação de serviços vence hoje (${brDate(row.agreement.end)}).` : `Contrato de prestação de serviços vence em ${plural(row.agreement.daysToEnd, "dia", "dias")} (${brDate(row.agreement.end)}).` });
        }
        if (row.feePct == null && n > 0) {
            items.push({ kind: "no_fee_with_leases", tone: "amber", row, text: `Taxa de administração não informada: o custo de ${plural(n, "contrato em vigor", "contratos em vigor")} fica de fora das contas.` });
        }
        if (!row.agreement.hasFile && n > 0) {
            items.push({ kind: "no_agreement_with_leases", tone: "amber", row, text: `Sem contrato de prestação de serviços anexado, com ${plural(n, "contrato em vigor", "contratos em vigor")}.` });
        }
        if (ACTIVE_AGENCY.has(row.status) && !row.hasContact) {
            items.push({ kind: "no_contact", tone: "amber", row, text: "Sem telefone nem e-mail: complete o contato." });
        }
        if (ACTIVE_AGENCY.has(row.status) && n === 0 && row.activeTenants === 0) {
            items.push({ kind: "idle", tone: "slate", row, text: "Nenhum contrato em vigor nem inquilino atendido." });
        }
    }
    // by kind, not just by colour: an agreement about to end outranks a fee never typed in
    const rank: Record<AgencyAttentionKind, number> = { suspended_with_leases: 0, agreement_expired: 1, agreement_expiring: 2, no_fee_with_leases: 3, no_agreement_with_leases: 4, no_contact: 5, idle: 6 };
    return items.sort((a, b) => rank[a.kind] - rank[b.kind]);
}
