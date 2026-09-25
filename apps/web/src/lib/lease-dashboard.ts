/**
 * Contratos — the pure maths behind the hub (`/contratos`) and one contract's dashboard (`?id=`).
 *
 * Nothing here touches the network: the components hand in the leases, the index series and the
 * income ledger rows, and get back what they print. Dates are `YYYY-MM-DD` strings compared as
 * text, in Brasília, so a browser in another time zone never shifts a day (see lib/lease-summary.ts).
 *
 * Two ideas the whole module leans on:
 *   • a lease is **in force** by what is stored (ACTIVE / EXPIRING_SOON), whatever the calendar says.
 *     A Brazilian lease whose term ended keeps running month to month ("prazo indeterminado"), and
 *     the rent keeps coming — so it stays among the contracts in force, flagged "prazo vencido";
 *   • the **display status** adds the calendar: an ACTIVE lease ending within 30 days shows
 *     "Vencendo", one past its end date shows "Vencido". TERMINATED, CANCELLED and DRAFT are
 *     what they are.
 */
import type { LeaseStatus, LeaseWithDetails } from "@/types/lease";
import { LEASE_INDEX_LABELS, addMonths, daysBetween, leaseIndexSeriesCode, leaseSummary, nextAdjustment, type IndexPoint, type LeaseSummary } from "@/lib/lease-summary";
import { aggregateIncomeByMonth, breakdown, monthKey, round2, type PropertyIncomeRow } from "@/lib/property-income";

/** Today in Brasília, `YYYY-MM-DD`. */
export const todayBRT = (now = Date.now()) => new Date(now - 3 * 3600 * 1000).toISOString().slice(0, 10);

// ── Status ───────────────────────────────────────────────────────────

/** Stored statuses under which the rent is still due. */
export const IN_FORCE: ReadonlySet<LeaseStatus> = new Set<LeaseStatus>(["ACTIVE", "EXPIRING_SOON"]);
/** Stored statuses of a contract that is over. */
export const CLOSED: ReadonlySet<LeaseStatus> = new Set<LeaseStatus>(["EXPIRED", "TERMINATED", "CANCELLED"]);

/** Days before the end date from which an ACTIVE lease reads "Vencendo". */
export const EXPIRING_WINDOW_DAYS = 30;

export type LeaseLike = Pick<LeaseWithDetails, "status" | "end_date">;

export const isInForce = (lease: Pick<LeaseWithDetails, "status">) => IN_FORCE.has(lease.status);

/** The status the screens print: the stored one plus what the calendar says about the term. */
export function displayStatus(lease: LeaseLike, today: string): LeaseStatus {
    if (lease.status === "TERMINATED" || lease.status === "CANCELLED" || lease.status === "DRAFT") return lease.status;
    if (lease.end_date) {
        const end = lease.end_date.slice(0, 10);
        if (end < today) return "EXPIRED";
        if (lease.status === "ACTIVE" && daysBetween(today, end) <= EXPIRING_WINDOW_DAYS) return "EXPIRING_SOON";
    }
    return lease.status;
}

export interface StatusMeta {
    label: string;
    /** pill: background + text */
    pill: string;
    /** solid colour for bars and dots (timeline, progress) */
    bar: string;
    /** text colour for figures that carry the status */
    text: string;
}

const SLATE = { pill: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300", bar: "bg-slate-400", text: "text-slate-600 dark:text-slate-300" };

/** By display status. EXPIRED here is the term over while the contract is still in force; a closed contract wears `CLOSED_META`. */
export const STATUS_META: Record<LeaseStatus, StatusMeta> = {
    ACTIVE: { label: "Ativo", pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
    EXPIRING_SOON: { label: "Vencendo", pill: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300", bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
    EXPIRED: { label: "Prazo vencido", pill: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300", bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
    TERMINATED: { label: "Rescindido", ...SLATE },
    CANCELLED: { label: "Cancelado", ...SLATE },
    DRAFT: { label: "Rascunho", pill: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300", bar: "bg-sky-400", text: "text-sky-600 dark:text-sky-400" },
};

/** A contract stored as EXPIRED: over, in the history — not the rose "prazo vencido" of one that keeps running. */
export const CLOSED_META: StatusMeta = { label: "Encerrado", ...SLATE };

/**
 * What a row's pill says. The rent still due after the term is "Prazo vencido" (rose: decide something);
 * a contract closed as EXPIRED is "Encerrado" (slate, like rescindido); everything else by status.
 */
export function statusMeta(row: { status: LeaseStatus; inForce: boolean }): StatusMeta {
    if (row.status === "EXPIRED") return row.inForce ? STATUS_META.EXPIRED : CLOSED_META;
    return STATUS_META[row.status];
}

export const MANAGEMENT_LABELS: Record<string, string> = { SELF_MANAGED: "Gestão própria", AGENCY: "Imobiliária", AGENT: "Corretor" };

// ── Views (the pills on the hub) ─────────────────────────────────────

export type LeaseView = "vigentes" | "vencendo" | "encerrados" | "rascunhos" | "todos";
export const DEFAULT_VIEW: LeaseView = "vigentes";
export const LEASE_VIEWS: Array<{ key: LeaseView; label: string; empty: string }> = [
    { key: "vigentes", label: "Vigentes", empty: "Nenhum contrato em vigor." },
    { key: "vencendo", label: "Vencendo", empty: "Nenhum contrato vencendo ou com o prazo vencido." },
    { key: "encerrados", label: "Encerrados", empty: "Nenhum contrato encerrado ainda." },
    { key: "rascunhos", label: "Rascunhos", empty: "Nenhum rascunho." },
    { key: "todos", label: "Todos", empty: "Nenhum contrato." },
];
export const viewFromParam = (v: string | null): LeaseView => (LEASE_VIEWS.some(x => x.key === v) ? (v as LeaseView) : DEFAULT_VIEW);

/** Whether a lease belongs to a view. "Vencendo" is what needs a decision: ending soon, or past its term while still in force. */
export function inView(row: { status: LeaseStatus; stored: LeaseStatus }, view: LeaseView): boolean {
    switch (view) {
        case "vigentes": return IN_FORCE.has(row.stored);
        case "vencendo": return IN_FORCE.has(row.stored) && (row.status === "EXPIRING_SOON" || row.status === "EXPIRED");
        case "encerrados": return CLOSED.has(row.stored);
        case "rascunhos": return row.stored === "DRAFT";
        default: return true;
    }
}

// ── Per-lease summary rows ───────────────────────────────────────────

export interface LeaseRow {
    lease: LeaseWithDetails;
    /** what the screens print */
    status: LeaseStatus;
    /** what the database says */
    stored: LeaseStatus;
    inForce: boolean;
    /** the dates and index maths of lib/lease-summary.ts (series-dependent fields null without a series) */
    summary: LeaseSummary;
    /** calculator code of the lease's index (`ipca`, `igpm`…), null when it has none */
    seriesCode: string | null;
    /** "SANTO ANTONIO · Kitnet 35B" */
    place: string;
    /** the reference name, else the place */
    title: string;
    /** "IPCA", "IGP-M", "Sem reajuste", "Não informado" */
    indexLabel: string;
    /** whole months of the term; null when open-ended */
    termMonths: number | null;
    hasFile: boolean;
}

export const placeOf = (lease: Pick<LeaseWithDetails, "property_name" | "unit_name">) =>
    [lease.property_name, lease.unit_name].filter(Boolean).join(" · ") || "Imóvel";

export const titleOf = (lease: Pick<LeaseWithDetails, "reference_name" | "property_name" | "unit_name">) =>
    lease.reference_name?.trim() || placeOf(lease);

/** Whole months of a term (06/01 → 06/07 = 6; 01/03 → 28/02 = 12, the last day included); null without an end. */
export function termMonths(start: string, end: string | null): number | null {
    if (!end) return null;
    const s = start.slice(0, 10);
    const dayAfterEnd = nextDay(end.slice(0, 10));
    const [sy, sm] = s.split("-").map(Number);
    const [ey, em] = dayAfterEnd.split("-").map(Number);
    let n = (ey - sy) * 12 + (em - sm);
    while (n > 0 && addMonths(s, n) > dayAfterEnd) n--;
    while (addMonths(s, n + 1) <= dayAfterEnd) n++;
    return Math.max(0, n);
}

const nextDay = (iso: string) => new Date(Date.parse(iso + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
const previousDay = (iso: string) => new Date(Date.parse(iso + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);

export function summarizeLease(lease: LeaseWithDetails, seriesByCode: Record<string, IndexPoint[] | null | undefined>, today: string): LeaseRow {
    const seriesCode = leaseIndexSeriesCode(lease.adjustment_index);
    const series = seriesCode ? seriesByCode[seriesCode] ?? null : null;
    return {
        lease,
        status: displayStatus(lease, today),
        stored: lease.status,
        inForce: isInForce(lease),
        summary: leaseSummary(lease, series, today),
        seriesCode,
        place: placeOf(lease),
        title: titleOf(lease),
        indexLabel: lease.adjustment_index ? (LEASE_INDEX_LABELS[lease.adjustment_index] ?? lease.adjustment_index) : "Não informado",
        termMonths: termMonths(lease.start_date, lease.end_date),
        hasFile: (lease.document_count ?? lease.documents?.length ?? 0) > 0,
    };
}

export const summarizeLeases = (leases: LeaseWithDetails[], seriesByCode: Record<string, IndexPoint[] | null | undefined>, today: string): LeaseRow[] =>
    leases.map(l => summarizeLease(l, seriesByCode, today));

// ── Hub totals ───────────────────────────────────────────────────────

export interface HubTotals {
    total: number;
    inForce: number;
    /** in force and ending within 90 days */
    ending90: number;
    /** in force with the term already over */
    overdueTerm: number;
    /** Σ monthly rent of the contracts in force */
    contractedRent: number;
    /** the contract in force that ends first */
    nextEnd: { row: LeaseRow; date: string; days: number } | null;
    /** the next rent adjustment among the contracts in force */
    nextAdjustment: { row: LeaseRow; date: string; days: number; accumulatedPct: number | null; monthsCounted: number } | null;
    /** adjustments falling within 90 days */
    adjustments90: number;
    /** Σ security deposit of the contracts in force */
    deposits: number;
    depositsCount: number;
    /** contracts with at least one file attached */
    withFile: number;
    agencyManaged: number;
    selfManaged: number;
    drafts: number;
}

export function hubTotals(rows: LeaseRow[], today: string): HubTotals {
    const inForce = rows.filter(r => r.inForce);
    let nextEnd: HubTotals["nextEnd"] = null;
    let nextAdjustment: HubTotals["nextAdjustment"] = null;
    let ending90 = 0, overdueTerm = 0, adjustments90 = 0, deposits = 0, depositsCount = 0;

    for (const row of inForce) {
        const end = row.summary.effectiveEnd;
        if (end) {
            const days = daysBetween(today, end);
            if (days < 0) overdueTerm++;
            else {
                if (days <= 90) ending90++;
                if (!nextEnd || end < nextEnd.date) nextEnd = { row, date: end, days };
            }
        }
        const adj = row.summary.nextAdjustmentDate;
        if (adj && (!end || adj <= end)) {
            const days = daysBetween(today, adj);
            if (days <= 90) adjustments90++;
            if (!nextAdjustment || adj < nextAdjustment.date) {
                nextAdjustment = { row, date: adj, days, accumulatedPct: row.summary.monthsCounted > 0 ? row.summary.accumulatedPct : null, monthsCounted: row.summary.monthsCounted };
            }
        }
        if (row.lease.security_deposit && row.lease.security_deposit > 0) {
            deposits += row.lease.security_deposit;
            depositsCount++;
        }
    }

    return {
        total: rows.length,
        inForce: inForce.length,
        ending90,
        overdueTerm,
        contractedRent: round2(inForce.reduce((s, r) => s + (Number(r.lease.monthly_rent) || 0), 0)),
        nextEnd,
        nextAdjustment,
        adjustments90,
        deposits: round2(deposits),
        depositsCount,
        withFile: rows.filter(r => r.hasFile).length,
        agencyManaged: inForce.filter(r => r.lease.management_type === "AGENCY").length,
        selfManaged: inForce.filter(r => r.lease.management_type !== "AGENCY").length,
        drafts: rows.filter(r => r.stored === "DRAFT").length,
    };
}

// ── Attention list ───────────────────────────────────────────────────

export type AttentionKind = "overdue_term" | "ending" | "adjustment" | "draft" | "no_file";
export type AttentionTone = "rose" | "amber" | "sky" | "slate";

export interface AttentionItem {
    kind: AttentionKind;
    tone: AttentionTone;
    row: LeaseRow;
    /** the date the item is about, when there is one */
    date: string | null;
    /** the sentence, without the contract's name */
    text: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const days = (n: number) => plural(Math.abs(n), "dia", "dias");
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/**
 * What needs a look, most pressing first: terms already over (renew or terminate), terms ending
 * within 90 days, adjustments within 30 days, drafts never finished, contracts without their file.
 */
export function attentionItems(rows: LeaseRow[]): AttentionItem[] {
    const items: AttentionItem[] = [];
    for (const row of rows) {
        if (row.stored === "DRAFT") {
            items.push({ kind: "draft", tone: "sky", row, date: null, text: "Rascunho não concluído: complete os dados e salve como ativo." });
            continue;
        }
        if (!row.inForce) continue;
        const end = row.summary.effectiveEnd;
        const left = row.summary.daysLeft;
        if (end && left !== null && left < 0) {
            items.push({ kind: "overdue_term", tone: "rose", row, date: end, text: `Prazo vencido há ${days(left)}: o contrato segue por prazo indeterminado. Renove, prorrogue ou rescinda.` });
        } else if (end && left !== null && left <= 90) {
            items.push({ kind: "ending", tone: "amber", row, date: end, text: left === 0 ? "Termina hoje." : `Termina em ${days(left)}.` });
        }
        const adj = row.summary.nextAdjustmentDate;
        const toAdj = row.summary.daysToAdjustment;
        if (adj && toAdj !== null && toAdj <= 30 && (!end || adj <= end)) {
            const acc = row.summary.monthsCounted > 0 ? row.summary.accumulatedPct : null;
            const detail = acc !== null ? ` · ${row.indexLabel} acumulado ${pct(acc)}${row.summary.adjustedRent !== null ? ` → ${brl(row.summary.adjustedRent)}` : ""}` : ` · ${row.indexLabel}`;
            items.push({ kind: "adjustment", tone: "amber", row, date: adj, text: `Reajuste em ${days(toAdj)}${detail}.` });
        }
        if (!row.hasFile) {
            items.push({ kind: "no_file", tone: "slate", row, date: null, text: "Sem o arquivo do contrato: anexe o PDF assinado." });
        }
    }
    const order: Record<AttentionKind, number> = { overdue_term: 0, ending: 1, adjustment: 2, draft: 3, no_file: 4 };
    return items.sort((a, b) => order[a.kind] - order[b.kind] || (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.row.title.localeCompare(b.row.title));
}

export const brl = (v: number, digits = 2) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });

// ── Adjustments and milestones ───────────────────────────────────────

/**
 * The lease's adjustment dates: every anniversary (at its frequency) from the start up to `until`
 * (the end of the term, or today for an open-ended lease), and the next one after today when the
 * lease still adjusts and the date falls inside the term.
 */
export function adjustmentDates(lease: Pick<LeaseWithDetails, "start_date" | "end_date" | "termination_date" | "adjustment_index" | "adjustment_frequency" | "next_adjustment_date">, today: string): { past: string[]; next: string | null } {
    if (lease.adjustment_index === "NONE") return { past: [], next: null };
    const freq = lease.adjustment_frequency && lease.adjustment_frequency > 0 ? lease.adjustment_frequency : 12;
    const start = lease.start_date.slice(0, 10);
    const end = (lease.termination_date ?? lease.end_date)?.slice(0, 10) ?? null;
    const until = end && end < today ? end : today;
    const past: string[] = [];
    for (let d = addMonths(start, freq), i = 0; d <= until && i < 600; d = addMonths(d, freq), i++) past.push(d);
    const next = nextAdjustment(lease, today);
    return { past, next: !end || next <= end ? next : null };
}

export type MilestoneKind = "start" | "adjustment" | "next_adjustment" | "end" | "termination";

export interface Milestone {
    kind: MilestoneKind;
    date: string;
    label: string;
    /** already happened */
    done: boolean;
}

/** The contract's life as a line: start, each adjustment, the next one, the end or the termination. */
export function milestones(lease: Pick<LeaseWithDetails, "start_date" | "end_date" | "termination_date" | "adjustment_index" | "adjustment_frequency" | "next_adjustment_date" | "status">, today: string): Milestone[] {
    const start = lease.start_date.slice(0, 10);
    const list: Milestone[] = [{ kind: "start", date: start, label: "Início", done: start <= today }];
    const closed = CLOSED.has(lease.status);
    const { past, next } = adjustmentDates(lease, today);
    past.forEach((date, i) => list.push({ kind: "adjustment", date, label: `${i + 1}º reajuste`, done: true }));
    if (next && !closed) list.push({ kind: "next_adjustment", date: next, label: `${past.length + 1}º reajuste`, done: false });
    if (lease.termination_date && lease.status === "TERMINATED") {
        list.push({ kind: "termination", date: lease.termination_date.slice(0, 10), label: "Rescisão", done: true });
    } else if (lease.end_date) {
        const end = lease.end_date.slice(0, 10);
        list.push({ kind: "end", date: end, label: "Fim do prazo", done: end <= today });
    }
    return list.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Timeline (the Gantt on the hub) ──────────────────────────────────

export interface TimelineBounds { start: string; end: string }

/** First day of the month of the earliest start to the last day of the month six months after the latest end (or today). */
export function timelineBounds(rows: Array<{ lease: Pick<LeaseWithDetails, "start_date">; summary: Pick<LeaseSummary, "effectiveEnd"> }>, today: string): TimelineBounds {
    let min = today, max = today;
    for (const r of rows) {
        const s = r.lease.start_date.slice(0, 10);
        if (s < min) min = s;
        const e = r.summary.effectiveEnd ?? today;
        if (e > max) max = e;
    }
    const start = `${min.slice(0, 7)}-01`;
    // the last day of the month six months after the latest end: room for the labels past the bars
    const end = previousDay(addMonths(`${max.slice(0, 7)}-01`, 7));
    return { start, end };
}

/** 0–100: where a date sits between the bounds (clamped). */
export function positionPct(date: string, bounds: TimelineBounds): number {
    const total = daysBetween(bounds.start, bounds.end);
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, (daysBetween(bounds.start, date.slice(0, 10)) / total) * 100));
}

export interface TimelineTick { date: string; label: string; major: boolean }

/**
 * Ticks on the calendar grid: every month up to two years, quarters (jan/abr/jul/out) up to six,
 * years beyond. January is the major tick and carries the year.
 */
export function timelineTicks(bounds: TimelineBounds): TimelineTick[] {
    const months = Math.max(1, Math.round(daysBetween(bounds.start, bounds.end) / 30.4));
    const step = months <= 24 ? 1 : months <= 72 ? 3 : 12;
    // first month on the grid at or after the start (quarters begin in January)
    const [sy, sm] = bounds.start.split("-").map(Number);
    const offset = (step - ((sm - 1) % step)) % step;
    const ticks: TimelineTick[] = [];
    for (let d = addMonths(`${sy}-${String(sm).padStart(2, "0")}-01`, offset), i = 0; d <= bounds.end && i < 400; d = addMonths(d, step), i++) {
        const [y, m] = d.split("-");
        const jan = m === "01";
        ticks.push({ date: d, label: jan ? y : MONTHS_SHORT[Number(m) - 1], major: jan });
    }
    return ticks;
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// ── Income of one contract (the property's ledger, cut to the lease) ─

export interface LeaseIncomePoint {
    /** `YYYY-MM` */
    key: string;
    /** what arrived (net of the agency's cut) */
    received: number;
    /** the rent the ledger implies (received ÷ (1 − fee)), the contract value of that month */
    gross: number;
    status: "EXPECTED" | "CONFIRMED";
}

export interface LeaseIncome {
    points: LeaseIncomePoint[];
    /** Σ received over the confirmed months */
    received: number;
    /** Σ gross rent over the confirmed months */
    gross: number;
    confirmedMonths: number;
    expectedMonths: number;
    /** months of the lease (start → end/today) with no ledger row at all */
    missingMonths: number;
    firstMonth: string | null;
    lastMonth: string | null;
    /** the last confirmed month's gross rent — what the tenant is paying now, as the ledger sees it */
    currentGross: number | null;
}

/**
 * The lease's months inside the property's income ledger. A lease for one unit reads that unit's
 * rows; a whole-property lease reads the months added up across units (`aggregateIncomeByMonth`).
 * Months run from the start to the end of the term (or today when open-ended / still running).
 */
export function leaseIncome(lease: Pick<LeaseWithDetails, "start_date" | "end_date" | "termination_date" | "unit_id" | "status">, rows: PropertyIncomeRow[], today: string): LeaseIncome {
    const from = monthKey(lease.start_date);
    const closed = CLOSED.has(lease.status);
    const endDate = (lease.termination_date ?? lease.end_date)?.slice(0, 10) ?? null;
    const to = endDate && (closed || endDate < today) ? monthKey(endDate) : monthKey(today);
    const scoped = lease.unit_id ? rows.filter(r => (r.unit_id ?? null) === lease.unit_id) : aggregateIncomeByMonth(rows);
    const byMonth = new Map<string, PropertyIncomeRow>();
    for (const r of scoped) byMonth.set(monthKey(r.month), r);

    const points: LeaseIncomePoint[] = [];
    let received = 0, gross = 0, confirmed = 0, expected = 0, missing = 0, currentGross: number | null = null;
    for (let m = from, i = 0; m <= to && i < 600; m = addMonths(`${m}-01`, 1).slice(0, 7), i++) {
        const row = byMonth.get(m);
        if (!row) { missing++; continue; }
        const b = breakdown(row);
        points.push({ key: m, received: b.received, gross: b.grossRent, status: row.status });
        if (row.status === "CONFIRMED") {
            received += b.received;
            gross += b.grossRent;
            confirmed++;
            if (b.grossRent > 0) currentGross = b.grossRent;
        } else expected++;
    }
    return {
        points,
        received: round2(received),
        gross: round2(gross),
        confirmedMonths: confirmed,
        expectedMonths: expected,
        missingMonths: missing,
        firstMonth: points[0]?.key ?? null,
        lastMonth: points.length ? points[points.length - 1].key : null,
        currentGross,
    };
}

// ── Import helpers (old contracts) ───────────────────────────────────

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Which unit of a multi-unit property a contract is about, from what the AI read ("Kitnet 35B",
 * "apto 302, bloco A"): the unit whose name appears in the hints, else the unit whose identifying
 * tokens ("35b", "302") do — "35 D" split by a scan still finds "Casa 35D", and "35D" beats a
 * bare "35" when both fit. Null when nothing or more than one unit fits: the screen asks. Hand in
 * the unit's name and complement, never the street or its number.
 */
export function guessUnit<T extends { id: string; name: string }>(units: T[], hints: Array<string | null | undefined>): T | null {
    const text = ` ${hints.filter((h): h is string => Boolean(h)).map(fold).join(" ")} `;
    if (!text.trim() || units.length === 0) return null;
    const byName = units.filter(u => { const n = fold(u.name); return n.length > 0 && text.includes(` ${n} `); });
    if (byName.length === 1) return byName[0];
    if (byName.length > 1) return null;

    const words = text.trim().split(" ");
    const tokens = new Set(words);
    // "35 d" → "35d", "bloco a 302" stays: only a number next to one or two letters is glued back
    for (let i = 1; i < words.length; i++) {
        const a = words[i - 1], b = words[i];
        if ((/^\d+$/.test(a) && /^[a-z]{1,2}$/.test(b)) || (/^[a-z]{1,2}$/.test(a) && /^\d+$/.test(b))) tokens.add(a + b);
    }
    const partsOf = (u: T) => fold(u.name).split(" ").filter(p => /\d/.test(p));
    const byToken = units.filter(u => { const parts = partsOf(u); return parts.length > 0 && parts.every(p => tokens.has(p)); });
    if (byToken.length === 1) return byToken[0];
    if (byToken.length === 0) return null;
    const specific = byToken.filter(u => partsOf(u).some(p => /[a-z]/.test(p)));
    return specific.length === 1 ? specific[0] : null;
}

/** "SANTO ANTONIO · Kitnet 35B - Maria Silva - 2025", the convention of the form's suggestion. */
export function referenceNameFor(propertyName: string | null | undefined, unitName: string | null | undefined, tenantName: string | null | undefined, startDate: string | null | undefined): string {
    const place = [propertyName, unitName].filter(Boolean).join(" · ");
    const year = startDate ? startDate.slice(0, 4) : String(new Date().getFullYear());
    return [place, tenantName, year].filter(Boolean).join(" - ");
}
