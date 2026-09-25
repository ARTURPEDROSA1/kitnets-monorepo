/**
 * Inquilinos — the pure maths behind the hub (`/inquilinos`) and one tenant's dashboard (`?id=`).
 *
 * A tenant is what the owner registered (status ACTIVE = living there now, FUTURE = arriving,
 * FORMER = moved out — kept forever as history); the contracts come from Contratos and tell the
 * rent, the place and the term. Dates are `YYYY-MM-DD` strings compared as text, in Brasília.
 */
import type { TenantStatus, TenantWithDetails } from "@/types/tenant";
import type { TenantLeaseSummary } from "@/lib/tenant-views";
import { IN_FORCE, brl } from "@/lib/lease-dashboard";
import { addMonths, daysBetween } from "@/lib/lease-summary";

export { brl };

// ── Status ───────────────────────────────────────────────────────────

export interface TenantStatusMeta { label: string; pill: string; bar: string }

export const TENANT_STATUS_META: Record<TenantStatus, TenantStatusMeta> = {
    ACTIVE: { label: "Atual", pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300", bar: "bg-emerald-500" },
    FUTURE: { label: "Futuro", pill: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300", bar: "bg-sky-400" },
    FORMER: { label: "Antigo", pill: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300", bar: "bg-slate-400" },
};

export const TENANT_MANAGEMENT_LABELS: Record<string, string> = { SELF_MANAGED: "Gestão própria", AGENCY: "Imobiliária" };

// ── Views (the pills on the hub) ─────────────────────────────────────

export type TenantView = "atuais" | "futuros" | "antigos" | "todos";
export const DEFAULT_TENANT_VIEW: TenantView = "atuais";
export const TENANT_VIEWS: Array<{ key: TenantView; label: string; empty: string }> = [
    { key: "atuais", label: "Atuais", empty: "Nenhum inquilino morando hoje." },
    { key: "futuros", label: "Futuros", empty: "Nenhum inquilino a chegar." },
    { key: "antigos", label: "Antigos", empty: "Nenhum ex-inquilino ainda: quem sai fica aqui, como histórico." },
    { key: "todos", label: "Todos", empty: "Nenhum inquilino." },
];
export const tenantViewFromParam = (v: string | null): TenantView => (TENANT_VIEWS.some(x => x.key === v) ? (v as TenantView) : DEFAULT_TENANT_VIEW);

export function inTenantView(status: TenantStatus, view: TenantView): boolean {
    switch (view) {
        case "atuais": return status === "ACTIVE";
        case "futuros": return status === "FUTURE";
        case "antigos": return status === "FORMER";
        default: return true;
    }
}

// ── Dates ────────────────────────────────────────────────────────────

/** Whole months elapsed from `from` to `to` (06/01/2025 → 25/09/2026 = 20); 0 before `from`. */
export function monthsElapsed(from: string, to: string): number {
    const a = from.slice(0, 10), b = to.slice(0, 10);
    if (b < a) return 0;
    const [ay, am] = a.split("-").map(Number);
    const [by, bm] = b.split("-").map(Number);
    let n = (by - ay) * 12 + (bm - am);
    while (n > 0 && addMonths(a, n) > b) n--;
    return n;
}

/** "3 anos e 2 meses", "8 meses", "menos de um mês" */
export function monthsLabel(months: number): string {
    if (months < 1) return "menos de um mês";
    const years = Math.floor(months / 12), rest = months % 12;
    const y = years > 0 ? `${years} ${years === 1 ? "ano" : "anos"}` : "";
    const m = rest > 0 ? `${rest} ${rest === 1 ? "mês" : "meses"}` : "";
    return [y, m].filter(Boolean).join(" e ");
}

/** Age on `today`, from a `YYYY-MM-DD` birth date; null without one. */
export function ageOn(dob: string | null | undefined, today: string): number | null {
    if (!dob) return null;
    const [by, bm, bd] = dob.slice(0, 10).split("-").map(Number);
    const [ty, tm, td] = today.slice(0, 10).split("-").map(Number);
    if (!by || !bm || !bd) return null;
    let age = ty - by;
    if (tm < bm || (tm === bm && td < bd)) age--;
    return age >= 0 && age < 130 ? age : null;
}

/** The next birthday on or after `today` (29/02 falls on 28/02 in a common year) and how many days away. */
export function nextBirthday(dob: string | null | undefined, today: string): { date: string; days: number; turning: number } | null {
    if (!dob) return null;
    const [by, bm, bd] = dob.slice(0, 10).split("-").map(Number);
    const ty = Number(today.slice(0, 4));
    if (!by || !bm || !bd) return null;
    const on = (year: number) => {
        const last = new Date(Date.UTC(year, bm, 0)).getUTCDate();
        return `${year}-${String(bm).padStart(2, "0")}-${String(Math.min(bd, last)).padStart(2, "0")}`;
    };
    const date = on(ty) >= today ? on(ty) : on(ty + 1);
    return { date, days: daysBetween(today, date), turning: Number(date.slice(0, 4)) - by };
}

// ── Rows ─────────────────────────────────────────────────────────────

export interface TenantRow {
    tenant: TenantWithDetails;
    status: TenantStatus;
    /** the tenant's contracts, newest first */
    leases: TenantLeaseSummary[];
    /** the contract in force (stored ACTIVE / EXPIRING_SOON), the latest start when several */
    current: TenantLeaseSummary | null;
    /** the most recent contract of any status */
    last: TenantLeaseSummary | null;
    /** "SANTO ANTONIO · Kitnet 35B" from the contract, else the registered property */
    place: string;
    /** rent of the contract in force */
    rent: number | null;
    /** the move-in date, else the current (or last) contract's start */
    since: string | null;
    /** the move-out date, else (for a former tenant) the last contract's end */
    until: string | null;
    /** whole months from `since` to `until` (or today) */
    monthsLiving: number | null;
    /** the last day of the contract in force (termination or end); null when open-ended or none */
    leaseEnd: string | null;
    daysToLeaseEnd: number | null;
    age: number | null;
    birthday: { date: string; days: number; turning: number } | null;
    hasPhone: boolean;
    hasEmail: boolean;
    /** lower-cased text the search box matches against */
    haystack: string;
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function placeOfLease(lease: Pick<TenantLeaseSummary, "property_name" | "unit_name">): string {
    return [lease.property_name, lease.unit_name].filter(Boolean).join(" · ") || "Imóvel";
}

export function tenantRows(tenants: TenantWithDetails[], leases: TenantLeaseSummary[], today: string): TenantRow[] {
    const byTenant = new Map<string, TenantLeaseSummary[]>();
    for (const l of leases) byTenant.set(l.tenant_id, [...(byTenant.get(l.tenant_id) ?? []), l]);

    return tenants.map(tenant => {
        const own = [...(byTenant.get(tenant.id) ?? [])].sort((a, b) => b.start_date.localeCompare(a.start_date));
        const current = own.find(l => IN_FORCE.has(l.status)) ?? null;
        const last = own[0] ?? null;
        const since = tenant.move_in_date ?? current?.start_date ?? last?.start_date ?? null;
        const until = tenant.move_out_date ?? (tenant.status === "FORMER" && last ? (last.termination_date ?? last.end_date) : null);
        const leaseEnd = current ? (current.termination_date ?? current.end_date) : null;
        return {
            tenant,
            status: tenant.status,
            leases: own,
            current,
            last,
            place: current ? placeOfLease(current) : tenant.property_name ?? (last ? placeOfLease(last) : "Imóvel"),
            rent: current ? Number(current.monthly_rent) || 0 : null,
            since,
            until,
            monthsLiving: since && since <= today ? monthsElapsed(since, until && until < today ? until : today) : null,
            leaseEnd,
            daysToLeaseEnd: leaseEnd ? daysBetween(today, leaseEnd) : null,
            age: ageOn(tenant.date_of_birth, today),
            birthday: tenant.status === "FORMER" ? null : nextBirthday(tenant.date_of_birth, today),
            hasPhone: Boolean(tenant.main_phone),
            hasEmail: Boolean(tenant.email),
            haystack: fold([tenant.full_name, tenant.cpf, tenant.occupation, tenant.property_name, current ? placeOfLease(current) : null, tenant.agency_name, tenant.email, tenant.main_phone].filter(Boolean).join(" ")),
        };
    });
}

// ── Hub totals ───────────────────────────────────────────────────────

export interface TenantHubTotals {
    total: number;
    active: number;
    future: number;
    former: number;
    /** Σ rent of the contracts in force of the current tenants — each contract once, however many people are on it */
    rentTotal: number;
    /** distinct contracts in force behind `rentTotal` */
    rentCount: number;
    /** average months living, over the current tenants with a start date */
    avgMonths: number | null;
    longest: { row: TenantRow; months: number } | null;
    /** current tenants without a contract in force */
    withoutLease: number;
    /** current or future tenants without a phone */
    withoutPhone: number;
    /** birthdays within the next 30 days (current and future tenants) */
    birthdays30: number;
    /** contracts of current tenants ending within 90 days */
    ending90: number;
}

export function tenantHubTotals(rows: TenantRow[]): TenantHubTotals {
    const active = rows.filter(r => r.status === "ACTIVE");
    const withMonths = active.filter(r => r.monthsLiving !== null);
    let longest: TenantHubTotals["longest"] = null;
    for (const r of withMonths) if (!longest || (r.monthsLiving ?? 0) > longest.months) longest = { row: r, months: r.monthsLiving ?? 0 };
    // One contract can carry several people (a co-tenant, an occupant): its rent counts once.
    const rentByLease = new Map<string, number>();
    for (const r of active) if (r.current) rentByLease.set(r.current.id, Number(r.current.monthly_rent) || 0);
    return {
        total: rows.length,
        active: active.length,
        future: rows.filter(r => r.status === "FUTURE").length,
        former: rows.filter(r => r.status === "FORMER").length,
        rentTotal: Math.round([...rentByLease.values()].reduce((s, v) => s + v, 0) * 100) / 100,
        rentCount: rentByLease.size,
        avgMonths: withMonths.length > 0 ? Math.round(withMonths.reduce((s, r) => s + (r.monthsLiving ?? 0), 0) / withMonths.length) : null,
        longest,
        withoutLease: active.filter(r => !r.current).length,
        withoutPhone: rows.filter(r => r.status !== "FORMER" && !r.hasPhone).length,
        birthdays30: rows.filter(r => r.birthday !== null && r.birthday.days <= 30).length,
        ending90: active.filter(r => r.daysToLeaseEnd !== null && r.daysToLeaseEnd >= 0 && r.daysToLeaseEnd <= 90).length,
    };
}

// ── Attention list ───────────────────────────────────────────────────

export type TenantAttentionKind = "arriving" | "birthday" | "lease_ending" | "lease_over" | "no_lease" | "no_phone";

export interface TenantAttentionItem {
    kind: TenantAttentionKind;
    tone: "emerald" | "amber" | "rose" | "sky" | "slate";
    row: TenantRow;
    date: string | null;
    text: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const days = (n: number) => plural(Math.abs(n), "dia", "dias");

/**
 * What deserves a look: who arrives soon, whose birthday is near, whose contract ends soon or is
 * already over, who lives there without a contract on file, who cannot be reached.
 */
export function tenantAttention(rows: TenantRow[], today: string): TenantAttentionItem[] {
    const items: TenantAttentionItem[] = [];
    for (const row of rows) {
        const { tenant } = row;
        if (tenant.status === "FUTURE") {
            const since = tenant.move_in_date ?? row.current?.start_date ?? null;
            if (since) {
                const d = daysBetween(today, since);
                if (d >= 0 && d <= 30) items.push({ kind: "arriving", tone: "sky", row, date: since, text: d === 0 ? "Chega hoje." : `Chega em ${days(d)}.` });
            }
        }
        if (row.birthday && row.birthday.days <= 7) {
            items.push({ kind: "birthday", tone: "emerald", row, date: row.birthday.date, text: row.birthday.days === 0 ? `Faz ${row.birthday.turning} anos hoje.` : `Faz ${row.birthday.turning} anos em ${days(row.birthday.days)}.` });
        }
        if (tenant.status === "ACTIVE") {
            if (row.current && row.daysToLeaseEnd !== null) {
                if (row.daysToLeaseEnd < 0) items.push({ kind: "lease_over", tone: "rose", row, date: row.leaseEnd, text: `Prazo do contrato vencido há ${days(row.daysToLeaseEnd)}: renove ou registre a saída.` });
                else if (row.daysToLeaseEnd <= 60) items.push({ kind: "lease_ending", tone: "amber", row, date: row.leaseEnd, text: row.daysToLeaseEnd === 0 ? "Contrato termina hoje." : `Contrato termina em ${days(row.daysToLeaseEnd)}: hora de falar em renovação.` });
            }
            if (!row.current) items.push({ kind: "no_lease", tone: "slate", row, date: null, text: "Mora sem contrato cadastrado: registre-o em Contratos." });
        }
        if (tenant.status !== "FORMER" && !row.hasPhone) items.push({ kind: "no_phone", tone: "slate", row, date: null, text: "Sem telefone: complete o contato." });
    }
    const order: Record<TenantAttentionKind, number> = { lease_over: 0, arriving: 1, lease_ending: 2, birthday: 3, no_lease: 4, no_phone: 5 };
    return items.sort((a, b) => order[a.kind] - order[b.kind] || (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.row.tenant.full_name.localeCompare(b.row.tenant.full_name));
}

/** "Mora desde jan/2025 · há 1 ano e 8 meses" */
export function livingLabel(row: TenantRow): string {
    if (!row.since) return "Sem data de entrada";
    const [y, m] = row.since.split("-");
    const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const when = `${MONTHS[Number(m) - 1] ?? m}/${y}`;
    if (row.status === "FUTURE") return `Entra em ${when}`;
    if (row.status === "FORMER") return row.monthsLiving !== null ? `Morou ${monthsLabel(row.monthsLiving)}` : `Morou desde ${when}`;
    return row.monthsLiving !== null ? `Desde ${when} · há ${monthsLabel(row.monthsLiving)}` : `Desde ${when}`;
}
