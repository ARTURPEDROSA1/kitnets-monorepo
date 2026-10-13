/**
 * The maths behind the Dashboard: the month's rents (which contract owes what, when, and whether the ledger
 * says it came in), their totals, what is new since the last visit, the month's bills, instalments and
 * contract dates, the result of a closed month and the portfolio figures under the board. All from the
 * bundle `loadDashboard` returns (lib/dashboard-views.ts), built on the hubs' own maths (lease-dashboard,
 * property-income, invoice-, energy-, water-hub, property-taxes), so the board says what each hub says.
 * The components only render. `today` is a Brasília YYYY-MM-DD string, computed once by the caller.
 */
import type { DashboardView } from "@/lib/dashboard-views";
import { addMonths, energyRows } from "@/lib/energy-hub";
import { invoiceRows, type InvoiceDisplay } from "@/lib/invoice-hub";
import { CLOSED, IN_FORCE, placeOf, summarizeLeases, titleOf, type LeaseRow } from "@/lib/lease-dashboard";
import { daysBetween } from "@/lib/lease-summary";
import { investmentTitle } from "@/lib/new-investments";
import type { PropertyEntry } from "@/lib/property-entries-server";
import { aggregateIncomeByMonth, breakdown, round2, type IncomeSource, type PropertyIncomeRow } from "@/lib/property-income";
import { landlordIptuForMonth, taxScopeForProperty, type PropertyTax } from "@/lib/property-taxes";
import { waterRows } from "@/lib/water-hub";
import type { LeaseManagementType, LeaseWithDetails } from "@/types/lease";

const r1 = (n: number) => Math.round(n * 10) / 10;
const monthOf = (date: string) => date.slice(0, 7);

// ── The month's rents ────────────────────────────────────────────────

export type RentStatus = "recebido" | "a_vencer" | "vencido";

/** What the ledger confirmed for a contract's month (or a paid Kitnets invoice the ledger has not caught yet). */
export interface RentReceipt {
    /** the rent before the agency's fee */
    gross: number;
    /** the rent after it */
    net: number;
    /** the agency's cut of the rent and, where agreed, of the condominium */
    fee: number;
    feePct: number;
    /** everything that came in: the deposit (rent, condominium, energy) plus what the tenant paid by invoice */
    total: number;
    /** `YYYY-MM-DD` the money arrived, when the ledger says */
    on: string | null;
    source: IncomeSource;
    /** when the ledger row last changed: what "novo desde a última visita" compares */
    updatedAt: string | null;
}

export interface MonthRent {
    /** `<lease id>|<YYYY-MM>` */
    id: string;
    lease: LeaseWithDetails;
    /** "SANTO ANTONIO · Kitnet 35B" */
    place: string;
    /** the reference name, else the place */
    title: string;
    tenant: string | null;
    management: LeaseManagementType;
    /** "Gestão própria", the agency's or the corretor's name */
    manager: string;
    /** `YYYY-MM-DD` the rent falls due (the invoice's due date when the owner bills it) */
    due: string;
    /** days from today to the due date, negative once it passed */
    days: number;
    /** the contract's rent, before the agency's fee */
    rent: number;
    status: RentStatus;
    received: RentReceipt | null;
    /** the month's Kitnets invoice, when the owner bills this contract */
    invoice: { id: string; number: number; display: InvoiceDisplay; daysLate: number } | null;
}

/** The due date of a contract's rent in a month: its due day, the month's last day when the month is shorter. */
export function rentDueIn(month: string, dueDay: number | null | undefined): string {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const day = Math.min(last, Math.max(1, Math.round(Number(dueDay)) || 1));
    return `${month}-${String(day).padStart(2, "0")}`;
}

/**
 * Whether a contract owes rent in a month, the ledger's rule (lib/lease-dashboard.ts `leaseIncome`): never in
 * its first month (a lease starting on the 20th pays its first rent the month after) and never once it is
 * over. A contract still in force past its term keeps paying (it runs on until someone ends it); only the
 * move-out day of a notice bounds it. A closed one owes until its end.
 */
export function owesRentIn(lease: Pick<LeaseWithDetails, "status" | "start_date" | "end_date" | "termination_date">, month: string, due: string): boolean {
    if (lease.status === "DRAFT" || lease.status === "CANCELLED") return false;
    if (month <= monthOf(lease.start_date)) return false;
    const bound = CLOSED.has(lease.status) ? lease.termination_date ?? lease.end_date : lease.termination_date;
    return !bound || due <= bound.slice(0, 10);
}

const managerOf = (lease: LeaseWithDetails) =>
    lease.management_type === "AGENCY" ? lease.agency_name ?? "Imobiliária" : lease.management_type === "AGENT" ? lease.agent_name ?? "Corretor" : "Gestão própria";

const newest = (dates: Array<string | null | undefined>) => dates.reduce<string | null>((max, d) => (d && (!max || Date.parse(d) > Date.parse(max)) ? d : max), null);

/**
 * Every rent that falls due in `month`, in due-date order. What came in is read from the ledger: a contract of
 * a unit reads that unit's rows; a contract of the whole property reads the rows saved without a unit, or
 * every row of the property when it is the only contract paying there that month. A paid Kitnets invoice
 * counts even before the ledger shows it. Without a receipt, a rent is "vencido" once its due date passed:
 * the ledger has nothing, which may also mean it arrived and was not posted yet.
 */
export function monthRents(view: Pick<DashboardView, "leases" | "ledger" | "invoices">, month: string, today: string): MonthRent[] {
    const leases = view.leases ?? [];
    const invoices = invoiceRows(view.invoices ?? [], today).filter(r => r.month === month && r.display !== "cancelada");
    const invoiceOf = new Map(invoices.map(r => [r.invoice.lease_id, r]));
    const owed = leases
        .map(lease => {
            const inv = invoiceOf.get(lease.id);
            const due = inv ? inv.invoice.due_date.slice(0, 10) : rentDueIn(month, lease.rent_due_day);
            return { lease, inv, due };
        })
        .filter(({ lease, due }) => owesRentIn(lease, month, due));

    const rowsHere = new Map<string, PropertyIncomeRow[]>();
    for (const r of view.ledger?.rows ?? []) {
        if (monthOf(r.month) !== month) continue;
        rowsHere.set(r.property_id, [...(rowsHere.get(r.property_id) ?? []), r]);
    }
    const payingOn = new Map<string, number>();
    for (const { lease } of owed) payingOn.set(lease.property_id, (payingOn.get(lease.property_id) ?? 0) + 1);

    return owed
        .map(({ lease, inv, due }): MonthRent => {
            const all = rowsHere.get(lease.property_id) ?? [];
            let scoped: PropertyIncomeRow[];
            if (lease.unit_id) scoped = all.filter(r => (r.unit_id ?? null) === lease.unit_id);
            else {
                const whole = all.filter(r => !r.unit_id);
                scoped = whole.length > 0 ? whole : payingOn.get(lease.property_id) === 1 ? all : [];
            }
            const confirmed = scoped.filter(r => r.status === "CONFIRMED");
            let received: RentReceipt | null = null;
            if (confirmed.length > 0) {
                const row = confirmed.length === 1 ? confirmed[0] : aggregateIncomeByMonth(confirmed)[0];
                const b = breakdown(row);
                if (b.received > 0 || b.grossRent > 0) {
                    received = {
                        gross: b.grossRent, net: b.netRent, fee: b.feeAmount, feePct: b.feePct, total: b.received,
                        on: newest(confirmed.map(r => r.received_on))?.slice(0, 10) ?? null,
                        source: row.source,
                        updatedAt: newest(confirmed.map(r => r.updated_at)),
                    };
                }
            }
            if (!received && inv?.display === "paga") {
                const paid = Number(inv.invoice.paid_amount) || Number(inv.invoice.amount) || 0;
                received = { gross: paid, net: paid, fee: 0, feePct: 0, total: paid, on: inv.invoice.paid_on?.slice(0, 10) ?? null, source: "INVOICE", updatedAt: null };
            }
            const days = daysBetween(today, due);
            return {
                id: `${lease.id}|${month}`,
                lease,
                place: placeOf(lease),
                title: titleOf(lease),
                tenant: lease.primary_tenant_name,
                management: lease.management_type,
                manager: managerOf(lease),
                due,
                days,
                rent: Number(lease.monthly_rent) || 0,
                status: received ? "recebido" : days < 0 ? "vencido" : "a_vencer",
                received,
                invoice: inv ? { id: inv.invoice.id, number: inv.invoice.number, display: inv.display, daysLate: inv.daysLate } : null,
            };
        })
        .sort((a, b) => a.due.localeCompare(b.due) || a.place.localeCompare(b.place, "pt-BR", { numeric: true }));
}

export interface RentTotals {
    /** every rent due in the month, at the contract's value */
    expected: { amount: number; count: number };
    /** what came in, as the ledger reads it: the rent before and after the agency's fee, and everything credited */
    received: { gross: number; net: number; fee: number; total: number; count: number };
    /** not in yet, due date still ahead (today included) */
    pending: { amount: number; count: number; next: string | null };
    /** not in yet, due date passed */
    overdue: { amount: number; count: number; since: string | null };
}

export function rentTotals(rents: MonthRent[]): RentTotals {
    const sum = (list: MonthRent[], pick: (r: MonthRent) => number) => round2(list.reduce((s, r) => s + pick(r), 0));
    const received = rents.filter(r => r.status === "recebido");
    const pending = rents.filter(r => r.status === "a_vencer");
    const overdue = rents.filter(r => r.status === "vencido");
    return {
        expected: { amount: sum(rents, r => r.rent), count: rents.length },
        received: {
            gross: sum(received, r => r.received!.gross), net: sum(received, r => r.received!.net), fee: sum(received, r => r.received!.fee),
            total: sum(received, r => r.received!.total), count: received.length,
        },
        pending: { amount: sum(pending, r => r.rent), count: pending.length, next: pending[0]?.due ?? null },
        overdue: { amount: sum(overdue, r => r.rent), count: overdue.length, since: overdue[0]?.due ?? null },
    };
}

/** The receipts the ledger posted after `seenAt`: nothing is new on a first visit (no `seenAt`). */
export function freshRentIds(rents: MonthRent[], seenAt: string | null): Set<string> {
    if (!seenAt) return new Set();
    const seen = Date.parse(seenAt);
    return new Set(rents.filter(r => r.received?.updatedAt && Date.parse(r.received.updatedAt) > seen).map(r => r.id));
}

/** The newest change among the confirmed ledger rows: what a visit has seen, stored as `seen:dashboard`. */
export function newestLedgerChange(view: Pick<DashboardView, "ledger">): string | null {
    return newest((view.ledger?.rows ?? []).filter(r => r.status === "CONFIRMED").map(r => r.updated_at));
}

/** The newest month with a confirmed ledger row, `YYYY-MM`; null when the window has none. */
export function latestConfirmedMonth(view: Pick<DashboardView, "ledger">): string | null {
    return (view.ledger?.rows ?? []).filter(r => r.status === "CONFIRMED").reduce<string | null>((m, r) => (m === null || monthOf(r.month) > m ? monthOf(r.month) : m), null);
}

// ── Bills, instalments and contract dates ────────────────────────────

export type MonthEventKind = "energia" | "agua" | "parcela" | "reajuste" | "termino";

export interface MonthEvent {
    kind: MonthEventKind;
    /** `YYYY-MM-DD`; null for an arrear without a date (instalments already late) */
    date: string | null;
    title: string;
    place: string | null;
    amount: number | null;
    /** a short line under the title: the index of an adjustment, "desocupação", "2 parcelas em atraso" */
    detail: string | null;
    /** the due date passed (a bill), or instalments are late */
    late: boolean;
    /** where to act: the Portuguese path, the client prefixes the language */
    href: string;
}

/**
 * The money that leaves in a month: the newest energy bill of each rental unit and the newest water bill of each
 * property due in it, the projects' next instalment due in it and, for the current month, the projects with
 * instalments already late. Bills are the hubs' newest ones, so a past month has none of them to show.
 */
export function monthOutflows(view: Pick<DashboardView, "energy" | "water" | "projects">, month: string, today: string): MonthEvent[] {
    const out: MonthEvent[] = [];
    for (const row of energyRows(view.energy ?? [], today)) {
        const due = row.latest?.dueDate?.slice(0, 10);
        if (row.kind !== "rental" || !due || monthOf(due) !== month) continue;
        out.push({ kind: "energia", date: due, title: row.distributor, place: row.unit.name, amount: row.latest!.total, detail: null, late: due < today, href: `/dashboard/energy/${row.unit.id}` });
    }
    for (const row of waterRows(view.water ?? [], today)) {
        const due = row.latest?.dueDate?.slice(0, 10);
        if (!due || monthOf(due) !== month) continue;
        out.push({ kind: "agua", date: due, title: "Água", place: row.unit.name, amount: row.latest!.total, detail: null, late: due < today, href: `/dashboard/billing/${row.unit.id}` });
    }
    for (const inv of view.projects?.investments ?? []) {
        if (inv.status !== "ACTIVE") continue;
        const s = view.projects!.summaries[inv.id];
        if (!s) continue;
        if (s.nextDueOn && monthOf(s.nextDueOn) === month) {
            out.push({ kind: "parcela", date: s.nextDueOn.slice(0, 10), title: investmentTitle(inv), place: null, amount: s.nextDueAmount, detail: "parcela do projeto", late: s.nextDueOn.slice(0, 10) < today, href: `/projetos?id=${inv.id}` });
        }
        if (s.overdueCount > 0 && month === monthOf(today)) {
            out.push({ kind: "parcela", date: null, title: investmentTitle(inv), place: null, amount: null, detail: `${s.overdueCount} ${s.overdueCount === 1 ? "parcela em atraso" : "parcelas em atraso"}`, late: true, href: `/projetos?id=${inv.id}` });
        }
    }
    return out.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

/** "Kitnet 7 · Ed. Santo Antônio": the unit first, so a narrow column cuts the building rather than the unit; a named contract keeps its name. */
const unitFirstTitle = (row: LeaseRow) => {
    const { reference_name, unit_name, property_name } = row.lease;
    if (reference_name?.trim()) return row.title;
    return unit_name?.trim() ? [unit_name.trim(), property_name].filter(Boolean).join(" · ") : row.title;
};

/** The adjustments and the ends of the contracts in force between two dates (inclusive), in date order. */
export function contractDates(rows: LeaseRow[], from: string, to: string): MonthEvent[] {
    const out: MonthEvent[] = [];
    for (const row of rows) {
        if (!row.inForce) continue;
        const title = unitFirstTitle(row);
        const end = row.summary.effectiveEnd;
        // no adjustment after a term still running out (one already past its term runs on, and keeps adjusting)
        const adj = row.notice || (end && end >= from && row.summary.nextAdjustmentDate && row.summary.nextAdjustmentDate > end) ? null : row.summary.nextAdjustmentDate;
        if (adj && adj >= from && adj <= to) {
            out.push({ kind: "reajuste", date: adj, title, place: null, amount: null, detail: `reajuste ${row.indexLabel}`, late: false, href: `/contratos?id=${row.lease.id}` });
        }
        if (end && end >= from && end <= to) {
            out.push({ kind: "termino", date: end, title, place: null, amount: null, detail: row.notice ? "desocupação (aviso do inquilino)" : "fim do contrato", late: false, href: `/contratos?id=${row.lease.id}` });
        }
    }
    return out.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

export const leaseRowsOf = (view: Pick<DashboardView, "leases">, today: string): LeaseRow[] => summarizeLeases(view.leases ?? [], {}, today);

// ── A month's result ─────────────────────────────────────────────────

export interface MonthResult {
    month: string;
    /** properties with a confirmed month */
    properties: number;
    /** gross rent + energy and condominium paid by the tenants + other charges by invoice */
    revenue: number;
    grossRent: number;
    /** the agencies' cut */
    fee: number;
    /** agency fee + energy + other expenses + condominium + the owner's IPTU of the month */
    opex: number;
    noi: number;
    /** noi ÷ revenue × 100, null without revenue */
    margin: number | null;
}

/**
 * A month of the whole portfolio, from the confirmed ledger rows (each property's units added), with the IPTU
 * the owner paid that month as a cost — the property cards' and the DRE's rule. Null when nothing is confirmed.
 */
export function monthResult(view: Pick<DashboardView, "ledger" | "taxes" | "properties">, month: string): MonthResult | null {
    const byProperty = new Map<string, PropertyIncomeRow[]>();
    for (const r of view.ledger?.rows ?? []) {
        if (r.status !== "CONFIRMED" || monthOf(r.month) !== month) continue;
        byProperty.set(r.property_id, [...(byProperty.get(r.property_id) ?? []), r]);
    }
    if (byProperty.size === 0) return null;
    // a property with sub-units leaves its IPTU from 2025-01 to the condominium (GET /api/properties/income-summary)
    const multi = new Set(view.properties.filter(e => e.id && e.subUnitCount > 0).map(e => e.id as string));
    const taxes = new Map<string, PropertyTax[]>();
    for (const t of view.taxes ?? []) taxes.set(t.property_id, [...(taxes.get(t.property_id) ?? []), t]);
    let revenue = 0, grossRent = 0, fee = 0, opex = 0, noi = 0;
    for (const [propertyId, rows] of byProperty) {
        const b = breakdown(aggregateIncomeByMonth(rows)[0]);
        const iptu = landlordIptuForMonth(taxes.get(propertyId) ?? [], month, taxScopeForProperty(multi.has(propertyId)));
        revenue += b.revenue;
        grossRent += b.grossRent;
        fee += b.feeAmount;
        opex += b.opex + iptu;
        noi += b.noi - iptu;
    }
    return {
        month, properties: byProperty.size, revenue: round2(revenue), grossRent: round2(grossRent), fee: round2(fee), opex: round2(opex), noi: round2(noi),
        margin: revenue > 0 ? r1((noi / revenue) * 100) : null,
    };
}

// ── The portfolio, under the board ───────────────────────────────────

export interface Occupancy {
    /** rentable units across the portfolio (a single-family property or a garage counts one) */
    units: number;
    /** units with a contract in force */
    occupied: number;
    /** occupied ÷ units × 100, null without units */
    pct: number | null;
    /** properties with at least one contract in force */
    propertiesWithLease: number;
}

/**
 * Units with a contract in force (stored ACTIVE / EXPIRING_SOON, the hubs' rule). A single-family property
 * or a garage counts one. A multi-unit property counts each unit named by a lease once, plus one per lease that names
 * no unit (saved before leases pointed to units, or on the whole building), never more than its units. A
 * property without a row cannot have leases yet.
 */
export function occupancyOf(entries: PropertyEntry[], leases: Array<Pick<LeaseWithDetails, "property_id" | "unit_id" | "status">>): Occupancy {
    const inForce = leases.filter(l => IN_FORCE.has(l.status));
    let units = 0;
    let occupied = 0;
    let propertiesWithLease = 0;
    for (const e of entries) {
        units += e.units;
        if (!e.id) continue;
        const mine = inForce.filter(l => l.property_id === e.id);
        if (mine.length === 0) continue;
        propertiesWithLease += 1;
        if (e.propertyType !== "multi") {
            occupied += 1;
            continue;
        }
        const named = new Set(mine.map(l => l.unit_id).filter((u): u is string => !!u));
        const unitless = mine.filter(l => !l.unit_id).length;
        occupied += Math.min(e.units, named.size + unitless);
    }
    return { units, occupied, pct: units > 0 ? r1((occupied / units) * 100) : null, propertiesWithLease };
}

export interface ContractedRent {
    /** Σ contract rent of the contracts in force, before the agency's fee */
    total: number;
    count: number;
    /** split by who manages them */
    parts: Array<{ type: LeaseManagementType; amount: number; count: number }>;
}

export function contractedRent(leases: LeaseWithDetails[]): ContractedRent {
    const inForce = leases.filter(l => IN_FORCE.has(l.status));
    const parts = (["AGENCY", "SELF_MANAGED", "AGENT"] as const).map(type => {
        const mine = inForce.filter(l => l.management_type === type);
        return { type, amount: round2(mine.reduce((s, l) => s + (Number(l.monthly_rent) || 0), 0)), count: mine.length };
    });
    return { total: round2(parts.reduce((s, p) => s + p.amount, 0)), count: inForce.length, parts };
}

/** True when the account has nothing registered yet: the dashboard shows the first steps instead of empty figures. */
export function isEmptyPortfolio(view: Pick<DashboardView, "properties" | "leases" | "projects">): boolean {
    return view.properties.length === 0 && (view.leases?.length ?? 0) === 0 && (view.projects?.investments.length ?? 0) === 0;
}

// ── The calendar ─────────────────────────────────────────────────────

/** The month's weeks, Sunday first: each day `YYYY-MM-DD`, null for the days of the months around it. */
export function calendarWeeks(month: string): Array<Array<string | null>> {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells: Array<string | null> = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: Array<Array<string | null>> = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
}

/** `2026-10` → the months the board can show: the window's first to the current one, oldest first. */
export function boardMonths(view: Pick<DashboardView, "ledger">, today: string): string[] {
    const to = monthOf(today);
    const from = view.ledger?.from ?? to;
    const out: string[] = [];
    for (let m = from; m <= to && out.length < 120; m = addMonths(m, 1)) out.push(m);
    return out;
}
