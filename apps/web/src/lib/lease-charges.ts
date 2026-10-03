/**
 * What a contract costs the tenant each month besides the rent, and over its term.
 *
 * A single-family property (a house, an apartment) carries its energy bill; a multi-unit one (kitnets)
 * carries the condominium instead — the charge the contract's card names next to the rent. The
 * monthly total adds the charges the tenant pays with a fixed amount; the contract's total value is
 * that monthly figure over the whole term, at the contract's values (adjustments aside).
 */
import type { PropertyType } from "@/lib/property-type";
import type { LeaseCharge } from "@/types/lease";
import { LEASE_INDEX_LABELS, leaseIndexSeriesCode, leaseSummary, type IndexPoint, type LeaseForSummary } from "@/lib/lease-summary";

export type PropertyKind = "single" | "multi";

/**
 * The kind that names the card's charge. A garage has none of its own (a space in a building pays
 * condominium, the garage of a house pays nothing), so the card shows whichever the contract has.
 */
export const chargeKindOf = (type: PropertyType): PropertyKind | null => (type === "garage" ? null : type);

/** The charge the card names: condominium for a multi-unit property, energy for a single-family one. */
export const KIND_CHARGE: Record<PropertyKind, { type: LeaseCharge["charge_type"]; label: string }> = {
    multi: { type: "CONDOMINIUM", label: "Condomínio" },
    single: { type: "ELECTRICITY", label: "Energia" },
};

export const RESPONSIBILITY_LABELS: Record<string, string> = { TENANT: "Pago pelo inquilino", LANDLORD: "Pago pelo proprietário", INCLUDED: "Incluso no aluguel", INCLUDED_IN_CONDO: "Incluso no condomínio" };
export const CHARGE_LABELS: Record<string, string> = { CONDOMINIUM: "Condomínio", IPTU: "IPTU", WATER: "Água", ELECTRICITY: "Energia elétrica", GAS: "Gás", INTERNET: "Internet", OTHER: "Outro" };
export const CHARGE_INDEX_LABELS: Record<string, string> = { IPCA: "IPCA", IGP_M: "IGP-M", INPC: "INPC", IVAR: "IVAR", CUSTOM: "Outra regra", NONE: "Valor fixo" };

/** "Condomínio", "Energia elétrica", or the label typed for an "Outro". */
export const chargeName = (c: Pick<LeaseCharge, "charge_type" | "label">): string => (c.charge_type === "OTHER" && c.label ? c.label : CHARGE_LABELS[c.charge_type] ?? c.charge_type);

export const amountOf = (c: Pick<LeaseCharge, "amount">): number => Number(c.amount) || 0;

/** The property's own charge (condomínio / energia), by kind; with an unknown kind, whichever the contract has. */
export function featuredCharge(charges: readonly LeaseCharge[], kind: PropertyKind | null): { label: string; charge: LeaseCharge | null } {
    if (kind) {
        const spec = KIND_CHARGE[kind];
        return { label: spec.label, charge: charges.find(c => c.charge_type === spec.type) ?? null };
    }
    for (const k of ["multi", "single"] as const) {
        const spec = KIND_CHARGE[k];
        const charge = charges.find(c => c.charge_type === spec.type);
        if (charge) return { label: spec.label, charge };
    }
    return { label: "Encargos", charge: null };
}

/** The charges the tenant pays with a known amount, and their sum. */
export function tenantCharges(charges: readonly LeaseCharge[]): { items: LeaseCharge[]; total: number } {
    const items = charges.filter(c => c.responsibility === "TENANT" && amountOf(c) > 0);
    return { items, total: items.reduce((s, c) => s + amountOf(c), 0) };
}

/** rent + the tenant's fixed charges: what leaves the tenant's pocket each month. */
export const monthlyTotal = (rent: number, charges: readonly LeaseCharge[]): number => (Number(rent) || 0) + tenantCharges(charges).total;

/** The monthly total over the term's whole months; null when the lease is open-ended. */
export const contractTotal = (monthly: number, termMonths: number | null): number | null =>
    termMonths === null || termMonths <= 0 ? null : monthly * termMonths;

export interface LeaseTotals {
    featured: ReturnType<typeof featuredCharge>;
    tenantFixed: ReturnType<typeof tenantCharges>;
    monthly: number;
    /** null when the lease is open-ended */
    total: number | null;
}

/** Everything the card's charge/total figures need, in one call; charges may be missing on a list row. */
export function leaseTotals(rent: number, charges: readonly LeaseCharge[] | null | undefined, termMonths: number | null, kind: PropertyKind | null): LeaseTotals {
    const list = charges ?? [];
    const monthly = monthlyTotal(rent, list);
    return { featured: featuredCharge(list, kind), tenantFixed: tenantCharges(list), monthly, total: contractTotal(monthly, termMonths) };
}

// ── A charge's adjustment ────────────────────────────────────────────

/**
 * "Reajusta com o aluguel" survives a save that does not mention it (the imports send no such answer),
 * matched like the issuers are: same type, same label. Only the condominium carries it.
 */
export function inheritRentAdjustment<T extends { charge_type: string; label?: string | null; adjusts_with_rent?: boolean }>(
    incoming: readonly T[],
    previous: ReadonlyArray<{ charge_type: string; label?: string | null; adjusts_with_rent?: boolean | null }>
): Array<T & { adjusts_with_rent: boolean }> {
    const keyOf = (c: { charge_type: string; label?: string | null }) => `${c.charge_type}|${(c.label ?? "").trim().toLowerCase()}`;
    const pool = new Map<string, boolean[]>();
    for (const p of previous) pool.set(keyOf(p), [...(pool.get(keyOf(p)) ?? []), p.adjusts_with_rent === true]);
    return incoming.map(c => {
        const inherited = pool.get(keyOf(c))?.shift() ?? false;
        const value = c.adjusts_with_rent !== undefined ? c.adjusts_with_rent : inherited;
        return { ...c, adjusts_with_rent: c.charge_type === "CONDOMINIUM" && value === true };
    });
}

type AdjustableCharge = Pick<LeaseCharge, "amount" | "adjustment_index" | "adjusts_with_rent">;

/**
 * The index a charge is readjusted by on the lease's adjustment date: the rent's own when it is marked
 * "Reajusta com o aluguel", else the published index the charge names (a charge has no date of its own,
 * so it follows the lease's). Null = a fixed amount, a rule in words, or nothing said.
 */
export function chargeAdjustmentRule(charge: Pick<AdjustableCharge, "adjustment_index" | "adjusts_with_rent">, leaseIndex: string | null | undefined): { index: string | null; withRent: boolean } | null {
    if (charge.adjusts_with_rent) return leaseIndex === "NONE" ? null : { index: leaseIndex ?? null, withRent: true };
    return leaseIndexSeriesCode(charge.adjustment_index) ? { index: charge.adjustment_index, withRent: false } : null;
}

/** What the screens show about a charge readjusted on the lease's adjustment date. */
export interface ChargeAdjustment {
    /** true: "Reajusta com o aluguel" (the lease's index); false: the charge's own index, on the lease's dates */
    withRent: boolean;
    /** IPCA, IGP_M…; null when the lease names none */
    index: string | null;
    indexLabel: string;
    /** `YYYY-MM-DD` */
    nextDate: string;
    cycleStart: string | null;
    /** accumulated in the cycle, in %; null when the index has no series here or nothing of the cycle is published yet */
    accumulatedPct: number | null;
    daysCounted: number;
    /** `YYYY-MM-DD` the accumulated figure runs to */
    indexThroughDate: string | null;
    /** amount × accumulated factor: what the charge would be if adjusted today; null without a figure or an amount */
    adjustedAmount: number | null;
}

/**
 * The adjustment of a charge on the lease's cycle — the rent's own maths (lib/lease-summary.ts) with
 * the charge's amount in the rent's place. Null when the charge has no index to follow.
 */
export function chargeAdjustment(
    charge: AdjustableCharge | null | undefined,
    lease: LeaseForSummary,
    seriesByCode: Record<string, IndexPoint[] | null | undefined>,
    today: string
): ChargeAdjustment | null {
    if (!charge) return null;
    const rule = chargeAdjustmentRule(charge, lease.adjustment_index);
    if (!rule) return null;
    const code = leaseIndexSeriesCode(rule.index);
    const amount = amountOf(charge);
    const s = leaseSummary({ ...lease, adjustment_index: rule.index, monthly_rent: amount }, code ? seriesByCode[code] ?? null : null, today);
    if (!s.nextAdjustmentDate) return null;
    const known = s.accumulatedPct !== null && s.monthsCounted > 0;
    return {
        withRent: rule.withRent,
        index: rule.index,
        indexLabel: rule.index ? LEASE_INDEX_LABELS[rule.index] ?? rule.index : "Índice não informado",
        nextDate: s.nextAdjustmentDate,
        cycleStart: s.cycleStart,
        accumulatedPct: known ? s.accumulatedPct : null,
        daysCounted: s.daysCounted,
        indexThroughDate: s.indexThroughDate,
        adjustedAmount: known && amount > 0 ? s.adjustedRent : null,
    };
}
