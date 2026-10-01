/**
 * What a contract costs the tenant each month besides the rent, and over its term.
 *
 * A single-family property (a house, an apartment) carries its energy bill; a multi-unit one (kitnets)
 * carries the condominium instead — the charge the contract's card names next to the rent. The
 * monthly total adds the charges the tenant pays with a fixed amount; the contract's total value is
 * that monthly figure over the whole term, at the contract's values (adjustments aside).
 */
import type { LeaseCharge } from "@/types/lease";

export type PropertyKind = "single" | "multi";

/** The charge the card names: condominium for a multi-unit property, energy for a single-family one. */
export const KIND_CHARGE: Record<PropertyKind, { type: LeaseCharge["charge_type"]; label: string }> = {
    multi: { type: "CONDOMINIUM", label: "Condomínio" },
    single: { type: "ELECTRICITY", label: "Energia" },
};

export const RESPONSIBILITY_LABELS: Record<string, string> = { TENANT: "Pago pelo inquilino", LANDLORD: "Pago pelo proprietário", INCLUDED: "Incluso no aluguel" };

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
