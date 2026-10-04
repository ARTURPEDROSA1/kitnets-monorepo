/**
 * What a contract adds up to over its term, split into what already came in ("realizado", what the
 * property's income ledger confirmed) and what is still to come ("previsto", what the contract says).
 *
 * The contract's schedule: rent is paid on the due day for the month that just ran. So the first
 * payment is pro rata — from the lease's start to the first due day — the ones after it are whole,
 * and what runs from the last due day to the end of the term is pro rata again. Pro rata uses the
 * commercial month (30/360), so the first and the last pieces add up to whole months and a 30-month
 * term is 30 months of rent.
 *
 * A month the ledger confirmed counts at what the ledger says, whatever the schedule expected. Every
 * other payment of the schedule is a forecast at the contract's amount: the amount in force on its due
 * date when that is behind today (the adjustments tell it), today's amount for the ones ahead. The
 * adjustments follow the rent and one charge — the condominium, or the energy of a contract without
 * one (lib/lease-adjustments.ts); any other charge counts at today's amount.
 */
import { addMonths, cents } from "@/lib/lease-summary";
import { amountOf, tenantCharges } from "@/lib/lease-charges";
import { trackedCharge, type AdjustmentBrief } from "@/lib/lease-adjustments";
import type { LeaseCharge } from "@/types/lease";

export interface ScheduledPayment {
    /** `YYYY-MM-DD` it falls due */
    due: string;
    /** `YYYY-MM`: the ledger month it lands in */
    month: string;
    /** the share of a whole month it pays for: 1, or days ÷ 30 for the first and the last */
    fraction: number;
}

const parts = (d: string) => d.slice(0, 10).split("-").map(Number) as [number, number, number];
const nextDay = (d: string) => new Date(Date.parse(d.slice(0, 10) + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);

/** Days between two dates in the commercial month (30/360) pro rata is counted in. */
export function days360(from: string, to: string): number {
    const [y1, m1, d1] = parts(from), [y2, m2, d2] = parts(to);
    return (y2 - y1) * 360 + (m2 - m1) * 30 + (Math.min(d2, 30) - Math.min(d1, 30));
}

/** The due day inside a month, never past its last day. */
function dueIn(month: string, dueDay: number): string {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${month}-${String(Math.min(dueDay, last)).padStart(2, "0")}`;
}

/**
 * The payments a lease owes from its start to its end: the first pro rata to the first due day, whole
 * months after it, and the rest of the term after the last due day, pro rata. Empty for an open-ended
 * lease (no end to count to).
 */
export function paymentSchedule(start: string, end: string | null, dueDay: number): ScheduledPayment[] {
    if (!end) return [];
    const s = start.slice(0, 10), e = end.slice(0, 10);
    // an end on the eve of the anniversary (01/03 → 28/02) is a whole number of months
    const stop = parts(nextDay(e))[2] === parts(s)[2] ? nextDay(e) : e;
    if (stop <= s) return [];
    const day = Math.min(31, Math.max(1, Math.round(dueDay) || 1));

    const out: ScheduledPayment[] = [];
    let due = dueIn(s.slice(0, 7), day);
    if (due <= s) due = dueIn(addMonths(`${s.slice(0, 7)}-01`, 1).slice(0, 7), day);
    let previous = s;
    for (let i = 0; due <= stop && i < 1200; i++) {
        out.push({ due, month: due.slice(0, 7), fraction: i === 0 ? Math.min(1, days360(s, due) / 30) : 1 });
        previous = due;
        due = dueIn(addMonths(`${due.slice(0, 7)}-01`, 1).slice(0, 7), day);
    }
    const rest = days360(previous, stop);
    if (rest > 0) out.push({ due: stop, month: stop.slice(0, 7), fraction: Math.min(1, rest / 30) });
    return out;
}

/** A month the ledger confirmed: what the tenant paid of rent (before the agency's fee) and of condominium. */
export interface RealizedMonth {
    /** `YYYY-MM` */
    month: string;
    rent: number;
    condo: number;
    /** what the tenant paid for energy (inside the deposit, or by invoice) */
    energy?: number;
}

export interface TermSplit {
    /** confirmed by the ledger */
    realized: number;
    /** still to come, by the contract */
    forecast: number;
    total: number;
}

export interface LeaseTermTotals {
    rent: TermSplit;
    /** the condominium the tenant pays; null when the tenant pays none with an amount */
    condo: TermSplit | null;
    /** the energy the tenant pays the owner at a fixed amount (a house with solar panels); null when there is none */
    energy: TermSplit | null;
    /** rent + condominium + energy + the tenant's other fixed charges (these only in the forecast: the ledger does not track them) */
    total: TermSplit;
    /** false for an open-ended lease: there is no term to forecast, only what was realized */
    forecastKnown: boolean;
    /** months of rent the schedule adds up to (the first and last pieces as fractions) */
    months: number;
}

export interface TermLease {
    start_date: string;
    end_date: string | null;
    termination_date?: string | null;
    rent_due_day: number;
    monthly_rent: number;
    charges?: readonly LeaseCharge[] | null;
}

/**
 * The lease's totals over its term. `adjustments` are the lease's recorded adjustments, `realized`
 * the months its ledger confirmed (none when the ledger is not at hand: everything is then forecast —
 * what the contract adds up to).
 */
export function leaseTermTotals(lease: TermLease, adjustments: readonly AdjustmentBrief[], realized: readonly RealizedMonth[], today: string): LeaseTermTotals {
    const tenant = tenantCharges(lease.charges ?? []);
    const tenantCondo = tenant.items.find(c => c.charge_type === "CONDOMINIUM") ?? null;
    const currentRent = Number(lease.monthly_rent) || 0;
    const currentCondo = tenantCondo ? amountOf(tenantCondo) : null;
    const tenantEnergy = tenant.items.find(c => c.charge_type === "ELECTRICITY") ?? null;
    const currentEnergy = tenantEnergy ? amountOf(tenantEnergy) : null;
    const others = tenant.total - (currentCondo ?? 0) - (currentEnergy ?? 0);

    // the history's *_condo fields carry the condominium, or the energy of a contract without one
    const followsEnergy = trackedCharge(lease.charges)?.charge_type === "ELECTRICITY";
    const currentFollowed = followsEnergy ? currentEnergy : currentCondo;

    const sorted = [...adjustments].sort((a, b) => (a.effective_date < b.effective_date ? -1 : 1));
    const firstChargeChange = sorted.find(r => r.new_condo !== null);
    const initialRent = sorted.length > 0 ? Number(sorted[0].previous_rent) || 0 : currentRent;
    const initialFollowed = currentFollowed === null ? null : firstChargeChange && firstChargeChange.previous_condo !== null ? Number(firstChargeChange.previous_condo) : currentFollowed;
    /** the amounts in force on a date: by the history behind today, today's ahead of it */
    const inForce = (date: string): { rent: number; charge: number | null } => {
        if (date > today) return { rent: currentRent, charge: currentFollowed };
        let rent = initialRent, charge = initialFollowed;
        for (const r of sorted) {
            if (r.effective_date.slice(0, 10) > date) break;
            rent = Number(r.new_rent) || 0;
            if (charge !== null && r.new_condo !== null) charge = Number(r.new_condo);
        }
        return { rent, charge };
    };

    const confirmed = new Set(realized.map(r => r.month));
    const rentRealized = realized.reduce((sum, r) => sum + r.rent, 0);
    const condoRealized = realized.reduce((sum, r) => sum + r.condo, 0);
    const energyRealized = realized.reduce((sum, r) => sum + (r.energy ?? 0), 0);

    const schedule = paymentSchedule(lease.start_date, lease.termination_date ?? lease.end_date, lease.rent_due_day);
    let rentForecast = 0, condoForecast = 0, energyForecast = 0, otherForecast = 0, months = 0;
    for (const p of schedule) {
        months += p.fraction;
        if (confirmed.has(p.month)) continue;
        const amounts = inForce(p.due);
        rentForecast += amounts.rent * p.fraction;
        condoForecast += ((followsEnergy ? currentCondo : amounts.charge) ?? 0) * p.fraction;
        energyForecast += ((followsEnergy ? amounts.charge : currentEnergy) ?? 0) * p.fraction;
        otherForecast += others * p.fraction;
    }

    const split = (r: number, f: number): TermSplit => ({ realized: cents(r), forecast: cents(f), total: cents(cents(r) + cents(f)) });
    const rent = split(rentRealized, rentForecast);
    const condo = currentCondo === null ? null : split(condoRealized, condoForecast);
    const energy = currentEnergy === null ? null : split(energyRealized, energyForecast);
    return {
        rent,
        condo,
        energy,
        total: split(rent.realized + (condo?.realized ?? 0) + (energy?.realized ?? 0), rent.forecast + (condo?.forecast ?? 0) + (energy?.forecast ?? 0) + otherForecast),
        forecastKnown: schedule.length > 0,
        months: Math.round(months * 100) / 100,
    };
}
