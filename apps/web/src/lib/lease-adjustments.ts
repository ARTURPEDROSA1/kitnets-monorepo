/**
 * A lease's rent adjustments over time: what each anniversary changed, and what is due.
 *
 * Truth, in this order: an addendum ("aditivo") the owner imported says the new values; without one,
 * Kitnets' own calculation — the previous rent times the index of the cycle that closed on that date,
 * the market's count (lib/lease-summary.ts). Each adjustment starts from the one before it, so the
 * cycle that ends in 2027 is counted on what 2026 left.
 *
 * Stored rows (`lease_adjustments`) are never recalculated on their own: a calculated adjustment is
 * recorded once, when every month of its cycle is published. Only an addendum rewrites history — it
 * replaces the row of its date and what was calculated after it is chained again from its value.
 *
 * With a negative index the amount is kept, as most contracts do; the row still shows the index, and
 * an addendum can say otherwise.
 *
 * Next to the rent the history follows one charge, the property's own: the condominium, or — in a
 * contract without one, a house — the energy bill. The `*_condo` fields carry it (the database
 * columns keep that name); `charge_type` says which.
 */
import { addMonths, cents, cycleFactor, daysBetween, leaseIndexSeriesCode, nextAdjustment, round2, type IndexPoint, type LeaseForSummary } from "@/lib/lease-summary";
import { amountOf, chargeAdjustmentRule } from "@/lib/lease-charges";
import type { LeaseCharge } from "@/types/lease";

export type AdjustmentSource = "CALCULATED" | "ADDENDUM";

/** The charge the history follows next to the rent: the condominium, else the energy. */
export type AdjustedChargeType = "CONDOMINIUM" | "ELECTRICITY";
export const ADJUSTED_CHARGE_TYPES: readonly AdjustedChargeType[] = ["CONDOMINIUM", "ELECTRICITY"];
export const ADJUSTED_CHARGE_LABELS: Record<AdjustedChargeType, string> = { CONDOMINIUM: "Condomínio", ELECTRICITY: "Energia" };

/** The charge the history follows: the condominium when the contract has one with an amount, else the energy with an amount. */
export function trackedCharge<C extends Pick<LeaseCharge, "charge_type" | "amount">>(charges: readonly C[] | null | undefined): (C & { charge_type: AdjustedChargeType }) | null {
    for (const type of ADJUSTED_CHARGE_TYPES) {
        const charge = (charges ?? []).find(c => c.charge_type === type && amountOf(c) > 0);
        if (charge) return charge as C & { charge_type: AdjustedChargeType };
    }
    return null;
}

/** One adjustment, as `lease_adjustments` stores it. */
export interface AdjustmentRow {
    /** `YYYY-MM-DD` the new values apply from */
    effective_date: string;
    source: AdjustmentSource;
    /** IPCA, IGP_M…; null when an addendum names none */
    index_code: string | null;
    /** the cycle's index in %, two decimals; null when an addendum does not say */
    index_pct: number | null;
    /** the exact factor behind it, kept so an addendum can chain the later rows again */
    index_factor: number | null;
    previous_rent: number;
    new_rent: number;
    /** the followed charge (condominium or energy) before; null when the lease has none */
    previous_condo: number | null;
    /** the followed charge after; null = unchanged */
    new_condo: number | null;
    /** the factor applied to it (the rent's, or its own index's); null = not adjusted */
    condo_factor: number | null;
    /** which charge the `*_condo` fields carry; null on the rows written before the energy was followed (the condominium) */
    charge_type?: AdjustedChargeType | null;
    /** the addendum's file among the lease's documents */
    document_id?: string | null;
    notes: string | null;
}

export interface StoredAdjustment extends AdjustmentRow {
    id: string;
    lease_id: string;
    created_at?: string;
}

export type AdjustableLease = Pick<LeaseForSummary, "start_date" | "monthly_rent" | "adjustment_index" | "adjustment_frequency" | "next_adjustment_date"> & {
    charges?: ReadonlyArray<Pick<LeaseCharge, "charge_type" | "amount" | "adjustment_index" | "adjusts_with_rent">> | null;
};

/** A row a few days before an anniversary (an addendum signed ahead of it) stands for that anniversary. */
export const COVER_DAYS = 45;
export const NEGATIVE_NOTE = "Índice negativo: valor mantido.";

const frequencyOf = (lease: Pick<AdjustableLease, "adjustment_frequency">) => (lease.adjustment_frequency && lease.adjustment_frequency > 0 ? lease.adjustment_frequency : 12);
const byDate = <T extends { effective_date: string }>(rows: readonly T[]): T[] => [...rows].sort((a, b) => (a.effective_date < b.effective_date ? -1 : a.effective_date > b.effective_date ? 1 : 0));

/** The followed charge (condominium, else energy) when it is readjusted on the lease's dates (with the rent, or by its own index). */
export function adjustableCharge(lease: AdjustableLease): { type: AdjustedChargeType; amount: number; withRent: boolean; index: string | null } | null {
    const charge = trackedCharge(lease.charges);
    if (!charge) return null;
    const rule = chargeAdjustmentRule(charge, lease.adjustment_index);
    return rule ? { type: charge.charge_type, amount: amountOf(charge), ...rule } : null;
}

/** The adjustment dates already behind `today` — the anniversaries at the lease's frequency — oldest first. */
export function pastAdjustmentDates(lease: AdjustableLease, today: string): string[] {
    if (lease.adjustment_index === "NONE") return [];
    const start = lease.start_date.slice(0, 10);
    const frequency = frequencyOf(lease);
    const next = nextAdjustment(lease, today);
    const dates: string[] = [];
    for (let k = 1; k < 600; k++) {
        const date = addMonths(next, -k * frequency);
        if (date <= start) break;
        dates.unshift(date);
    }
    return dates;
}

/** The cycle that closes on an adjustment date: its first day (never before the lease) and its months. */
export function cycleOf(lease: AdjustableLease, date: string): { start: string; periods: number } {
    const leaseStart = lease.start_date.slice(0, 10);
    const frequency = frequencyOf(lease);
    const back = addMonths(date, -frequency);
    const start = back < leaseStart ? leaseStart : back;
    let periods = 0;
    while (periods < frequency && addMonths(start, periods + 1) <= date) periods++;
    return { start, periods };
}

/** The new amount of an adjustment: the factor applied to the cent, or the amount kept when the index is negative. */
export const adjusted = (amount: number, factor: number): number => (factor < 1 ? amount : cents(amount * factor));

export type WaitingReason =
    /** the cycle's last months are not published yet */
    | "NOT_PUBLISHED"
    /** the lease's index (or the followed charge's) has no series in Kitnets: only an addendum can say the value */
    | "NO_SERIES";

export interface DueAdjustments {
    /** adjustments to record, oldest first */
    rows: AdjustmentRow[];
    /** the lease's values after them */
    rent: number;
    condo: number | null;
    /** an adjustment date already behind today that cannot be calculated yet */
    waiting: { date: string; reason: WaitingReason } | null;
}

/**
 * The calculated adjustments a lease still owes: every anniversary behind `today` that is later than
 * the last one recorded, each on top of the one before. `lease.monthly_rent` (and the followed
 * charge's amount — condominium or energy) are the values in force since the last recorded adjustment
 * — or since the start. The count stops at the first date whose cycle is not fully published.
 */
export function dueAdjustments(
    lease: AdjustableLease,
    rows: readonly Pick<AdjustmentRow, "effective_date">[],
    seriesByCode: Record<string, IndexPoint[] | null | undefined>,
    today: string
): DueAdjustments {
    const condoRule = adjustableCharge(lease);
    let rent = Number(lease.monthly_rent) || 0;
    let condo = condoRule ? condoRule.amount : null;
    const out: DueAdjustments = { rows: [], rent, condo, waiting: null };

    const recorded = byDate(rows).map(r => r.effective_date.slice(0, 10));
    const last = recorded.length > 0 ? recorded[recorded.length - 1] : null;
    const covered = (date: string) => recorded.some(d => d <= date && daysBetween(d, date) < COVER_DAYS);
    const dates = pastAdjustmentDates(lease, today).filter(d => (!last || d > last) && !covered(d));
    if (dates.length === 0 || rent <= 0) return out;

    const code = leaseIndexSeriesCode(lease.adjustment_index);
    const condoCode = condoRule && !condoRule.withRent ? leaseIndexSeriesCode(condoRule.index) : null;
    for (const date of dates) {
        if (!code) return { ...out, rent, condo, waiting: { date, reason: "NO_SERIES" } };
        const cycle = cycleOf(lease, date);
        const series = seriesByCode[code];
        const factor = series ? cycleFactor(series, cycle.start, cycle.periods) : null;
        if (factor === null) return { ...out, rent, condo, waiting: { date, reason: "NOT_PUBLISHED" } };

        let condoFactor: number | null = null;
        if (condoRule && condo !== null) {
            const own = condoCode ? seriesByCode[condoCode] : null;
            condoFactor = condoRule.withRent ? factor : own ? cycleFactor(own, cycle.start, cycle.periods) : null;
            // the charge's own index is not out yet: the whole adjustment waits for it
            if (condoFactor === null) return { ...out, rent, condo, waiting: { date, reason: "NOT_PUBLISHED" } };
        }

        const newRent = adjusted(rent, factor);
        const newCondo = condo !== null && condoFactor !== null ? adjusted(condo, condoFactor) : null;
        out.rows.push({
            effective_date: date,
            source: "CALCULATED",
            index_code: lease.adjustment_index ?? null,
            index_pct: round2((factor - 1) * 100),
            index_factor: factor,
            previous_rent: rent,
            new_rent: newRent,
            previous_condo: condo,
            new_condo: newCondo,
            condo_factor: condoFactor,
            charge_type: condoRule ? condoRule.type : null,
            notes: factor < 1 ? NEGATIVE_NOTE : null,
        });
        rent = newRent;
        condo = newCondo ?? condo;
    }
    return { ...out, rent, condo };
}

export interface AddendumInput {
    effective_date: string;
    new_rent: number;
    /** null / undefined = the addendum does not change the followed charge (condominium or energy) */
    new_condo?: number | null;
    /** which charge `new_condo` is */
    charge_type?: AdjustedChargeType | null;
    index_code?: string | null;
    index_pct?: number | null;
    document_id?: string | null;
    notes?: string | null;
}

/**
 * The history with an addendum in it: it takes the place of whatever its date had — and of the
 * calculated row of the anniversary it sits next to — and every later calculated row is chained again
 * from its values (later addenda keep what they say). `initial` are
 * the contract's original amounts, before any adjustment.
 */
export function withAddendum<T extends AdjustmentRow>(
    rows: readonly T[],
    addendum: AddendumInput,
    initial: { rent: number; condo: number | null }
): { rows: Array<T | AdjustmentRow>; rent: number; condo: number | null } {
    const date = addendum.effective_date.slice(0, 10);
    const row: AdjustmentRow = {
        effective_date: date,
        source: "ADDENDUM",
        index_code: addendum.index_code ?? null,
        index_pct: addendum.index_pct ?? null,
        index_factor: null,
        previous_rent: 0,
        new_rent: cents(addendum.new_rent),
        previous_condo: null,
        new_condo: addendum.new_condo == null ? null : cents(addendum.new_condo),
        condo_factor: null,
        charge_type: addendum.charge_type ?? null,
        document_id: addendum.document_id ?? null,
        notes: addendum.notes ?? null,
    };
    // it stands for the anniversary next to it: the calculated row of that date gives way
    const stands = (r: T) => r.effective_date.slice(0, 10) === date || (r.source === "CALCULATED" && Math.abs(daysBetween(r.effective_date, date)) < COVER_DAYS);
    const merged = byDate<T | AdjustmentRow>([...rows.filter(r => !stands(r)), row]);

    let rent = initial.rent, condo = initial.condo;
    const chained = merged.map(r => {
        const next: T | AdjustmentRow = { ...r, previous_rent: rent, previous_condo: condo };
        if (r.source === "CALCULATED") {
            next.new_rent = r.index_factor !== null ? adjusted(rent, r.index_factor) : rent;
            next.new_condo = condo !== null && r.condo_factor !== null ? adjusted(condo, r.condo_factor) : null;
        }
        rent = next.new_rent;
        condo = next.new_condo ?? condo;
        return next;
    });
    return { rows: chained, rent, condo };
}

/**
 * The contract's original amounts: what the first adjustment started from, or today's values when there
 * is none. `condo` is the followed charge, `chargeType` which one it is (null: the contract has neither).
 */
export function initialValues(
    lease: AdjustableLease,
    rows: readonly Pick<AdjustmentRow, "effective_date" | "previous_rent" | "previous_condo">[]
): { rent: number; condo: number | null; chargeType: AdjustedChargeType | null } {
    const first = byDate(rows)[0];
    const charge = trackedCharge(lease.charges);
    const chargeType = charge ? charge.charge_type : null;
    if (first) return { rent: Number(first.previous_rent) || 0, condo: first.previous_condo === null ? null : Number(first.previous_condo), chargeType };
    return { rent: Number(lease.monthly_rent) || 0, condo: charge ? amountOf(charge) : null, chargeType };
}

/** The variation an adjustment made to the rent, in % (an addendum may not name an index). */
export const rentChangePct = (row: Pick<AdjustmentRow, "previous_rent" | "new_rent">): number | null =>
    row.previous_rent > 0 ? round2((row.new_rent / row.previous_rent - 1) * 100) : null;

/** What one adjustment took and left: all the lists need of it. */
export type AdjustmentBrief = Pick<AdjustmentRow, "effective_date" | "previous_rent" | "new_rent" | "previous_condo" | "new_condo">;
