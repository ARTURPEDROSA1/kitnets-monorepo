/**
 * The maths behind the Projetos figures shared by the hub and the dashboard: which projects are live, the
 * totals over a slice, and the ones that get their own map pin. Pure functions over what
 * `loadProjectList` / `loadInvestmentList` return; the components only render.
 */
import type { InvestmentCardSummary } from "./new-investment-metrics";
import type { InvestmentStatus, NewInvestment } from "./new-investments";

/** A live project: still owned, not yet a property. ARCHIVED is unreachable from the UI and reads as shelved. */
export const LIVE_PROJECT_STATUSES: ReadonlySet<InvestmentStatus> = new Set<InvestmentStatus>(["ACTIVE"]);

/** The hub's "Em andamento" slice (its default view): the live projects plus any shelved one. */
export const IN_PROGRESS_STATUSES: ReadonlySet<InvestmentStatus> = new Set<InvestmentStatus>(["ACTIVE", "ARCHIVED"]);

export interface ProjectHubTotals {
    count: number;
    active: number;
    completed: number;
    sold: number;
    /** Σ paidToDate */
    paid: number;
    /** Σ committed (paid + remaining) */
    committed: number;
    /** Σ remaining */
    remaining: number;
    /** paid ÷ committed × 100, 0 when nothing is committed */
    paidPct: number;
    /** Σ overdueCount */
    overdue: number;
    /** the earliest next due date across the slice */
    nextDueOn: string | null;
    /** Σ nextDueAmount of the projects due on that date */
    nextDueAmount: number;
    /** Σ saleNet (SOLD only) */
    saleNet: number;
    /** Σ realizedGain (SOLD only) */
    realizedGain: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function projectHubTotals(investments: NewInvestment[], summaries: Record<string, InvestmentCardSummary | undefined>): ProjectHubTotals {
    const t: ProjectHubTotals = { count: investments.length, active: 0, completed: 0, sold: 0, paid: 0, committed: 0, remaining: 0, paidPct: 0, overdue: 0, nextDueOn: null, nextDueAmount: 0, saleNet: 0, realizedGain: 0 };
    for (const inv of investments) {
        if (inv.status === "ACTIVE" || inv.status === "ARCHIVED") t.active += 1;
        else if (inv.status === "COMPLETED") t.completed += 1;
        else if (inv.status === "SOLD") t.sold += 1;
        const s = summaries[inv.id];
        if (!s) continue;
        t.paid += s.paidToDate;
        t.committed += s.committed;
        t.remaining += s.remaining;
        t.overdue += s.overdueCount;
        t.saleNet += s.saleNet ?? 0;
        t.realizedGain += s.realizedGain ?? 0;
        if (s.nextDueOn) {
            if (t.nextDueOn === null || s.nextDueOn < t.nextDueOn) {
                t.nextDueOn = s.nextDueOn;
                t.nextDueAmount = s.nextDueAmount;
            } else if (s.nextDueOn === t.nextDueOn) {
                t.nextDueAmount += s.nextDueAmount;
            }
        }
    }
    t.paid = r2(t.paid);
    t.committed = r2(t.committed);
    t.remaining = r2(t.remaining);
    t.saleNet = r2(t.saleNet);
    t.realizedGain = r2(t.realizedGain);
    t.nextDueAmount = r2(t.nextDueAmount);
    t.paidPct = t.committed > 0 ? Math.round((t.paid / t.committed) * 1000) / 10 : 0;
    return t;
}

/** The projects that get their own map pin: live, and not already a property (a promoted project is pinned as its property). */
export function mappableProjects<T extends Pick<NewInvestment, "status" | "promoted_property_id">>(investments: T[]): T[] {
    return investments.filter(i => LIVE_PROJECT_STATUSES.has(i.status) && i.promoted_property_id === null);
}
