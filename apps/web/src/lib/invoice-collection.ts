/**
 * Who collects each component of a lease — the rent and each charge the tenant pays — and what
 * therefore goes into the owner's invoice.
 *
 * A lease says who PAYS a charge (`responsibility`); who COLLECTS it is a separate answer, stored per
 * component (`leases.rent_collected_by`, `lease_charges.collected_by`):
 *   OWNER        the owner charges the tenant: it goes into the invoice
 *   AGENCY       the agency collects it and forwards it in its deposit
 *   THIRD_PARTY  someone else bills the tenant: the building's own condominium (a studio in a
 *                building), the utility, the city's IPTU booklet
 *   null         not answered. Rent and condominium are then read from how the lease is managed —
 *                gestão própria: the owner; imobiliária: the agency; a corretor only brokered the
 *                deal, so it stays open until the owner says. Every other charge stays out of the
 *                invoice until the owner marks it: "paid by the tenant" often means paid straight to
 *                the supplier.
 *
 * So an agency-managed lease whose condominium the owner collects is: rent derived (AGENCY),
 * condominium stored OWNER. The contract form asks it per charge as "Emissor da fatura".
 */
import type { ChargeType, LeaseCharge, LeaseManagementType } from "@/types/lease";
import { chargeName } from "@/lib/lease-charges";

export const COLLECTORS = ["OWNER", "AGENCY", "THIRD_PARTY"] as const;
export type Collector = (typeof COLLECTORS)[number];

export const COLLECTOR_LABELS: Record<Collector, string> = {
    OWNER: "Proprietário",
    AGENCY: "Imobiliária",
    THIRD_PARTY: "Terceiros",
};

export const isCollector = (v: unknown): v is Collector => typeof v === "string" && (COLLECTORS as readonly string[]).includes(v);

/** What a line of an invoice can be: the rent, or one of the lease's charge types. */
export type InvoiceItemKind = "RENT" | ChargeType;

/** The component key of the rent; a charge's key is its id. */
export const RENT_KEY = "rent";

export interface CollectionComponent {
    /** `rent`, or the id of the lease charge */
    key: string;
    kind: InvoiceItemKind;
    /** "Aluguel", "Condomínio", "IPTU", or what was typed for an "Outro" */
    label: string;
    /** monthly amount; null when the lease gives the charge no fixed value */
    amount: number | null;
    /** what the owner answered; null = not answered */
    stored: Collector | null;
    /** who collects it once the lease's management is taken into account; null = nobody decided */
    collector: Collector | null;
    /** `collector` comes from the lease's management, not from an answer */
    derived: boolean;
    /** rent or condominium of a lease brokered by a corretor: the owner has to say who collects */
    undecided: boolean;
    /** goes into the invoice: the owner collects it and it has an amount */
    billable: boolean;
}

/** The components whose collector follows the lease's management when the owner has not answered. */
const FOLLOWS_MANAGEMENT: ReadonlySet<InvoiceItemKind> = new Set<InvoiceItemKind>(["RENT", "CONDOMINIUM"]);

export function resolveCollector(kind: InvoiceItemKind, stored: Collector | null | undefined, management: LeaseManagementType): { collector: Collector | null; derived: boolean; undecided: boolean } {
    if (stored) return { collector: stored, derived: false, undecided: false };
    if (!FOLLOWS_MANAGEMENT.has(kind)) return { collector: null, derived: false, undecided: false };
    if (management === "SELF_MANAGED") return { collector: "OWNER", derived: true, undecided: false };
    if (management === "AGENCY") return { collector: "AGENCY", derived: true, undecided: false };
    return { collector: null, derived: false, undecided: true };
}

export interface CollectionLease {
    management_type: LeaseManagementType;
    monthly_rent: number | string | null;
    rent_collected_by?: string | null;
    charges?: ReadonlyArray<Pick<LeaseCharge, "id" | "charge_type" | "label" | "responsibility" | "amount"> & { collected_by?: string | null }> | null;
}

const amount = (v: number | string | null | undefined): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

/** The rent and every charge the tenant pays, each with who collects it. Charges the owner pays or that are included in the rent are not the tenant's to be charged. */
export function leaseComponents(lease: CollectionLease): CollectionComponent[] {
    const component = (key: string, kind: InvoiceItemKind, label: string, value: number | null, stored: Collector | null): CollectionComponent => {
        const resolved = resolveCollector(kind, stored, lease.management_type);
        return { key, kind, label, amount: value, stored, ...resolved, billable: resolved.collector === "OWNER" && value !== null };
    };
    return [
        component(RENT_KEY, "RENT", "Aluguel", amount(lease.monthly_rent), isCollector(lease.rent_collected_by) ? lease.rent_collected_by : null),
        ...(lease.charges ?? [])
            .filter(c => c.responsibility === "TENANT")
            .map(c => component(c.id, c.charge_type, chargeName(c), amount(c.amount), isCollector(c.collected_by) ? c.collected_by : null)),
    ];
}

export interface BillableItem { kind: InvoiceItemKind; description: string; amount: number }

/** The lines of the lease's invoice: what the owner collects, rent first. */
export const billableItems = (components: readonly CollectionComponent[]): BillableItem[] =>
    components.filter(c => c.billable).map(c => ({ kind: c.kind, description: c.label, amount: c.amount as number }));

export const billableTotal = (components: readonly CollectionComponent[]): number =>
    Math.round(billableItems(components).reduce((s, i) => s + i.amount, 0) * 100) / 100;

/**
 * Charges are rewritten (deleted and inserted again) whenever a lease is saved. The contract form sends
 * each charge's collector (null when the owner cleared it); the imports know nothing about collectors
 * and send none (`undefined`): such a charge inherits the one its predecessor had — same type and, for
 * an "Outro", same label — so re-importing a contract never erases the owner's answer.
 * Only a charge the tenant pays has a collector.
 */
export function inheritCollectors<T extends { charge_type: string; label?: string | null; responsibility: string; collected_by?: string | null }>(
    incoming: readonly T[],
    previous: ReadonlyArray<{ charge_type: string; label?: string | null; collected_by?: string | null }>
): Array<Omit<T, "collected_by"> & { collected_by: Collector | null }> {
    const keyOf = (c: { charge_type: string; label?: string | null }) => `${c.charge_type}|${(c.label ?? "").trim().toLowerCase()}`;
    const pool = new Map<string, Collector[]>();
    for (const p of previous) {
        if (isCollector(p.collected_by)) pool.set(keyOf(p), [...(pool.get(keyOf(p)) ?? []), p.collected_by]);
    }
    return incoming.map(c => {
        // the predecessor's answer is used up either way: two charges of a type keep their own
        const inherited = pool.get(keyOf(c))?.shift() ?? null;
        if (c.responsibility !== "TENANT") return { ...c, collected_by: null };
        if (c.collected_by !== undefined) return { ...c, collected_by: isCollector(c.collected_by) ? c.collected_by : null };
        return { ...c, collected_by: inherited };
    });
}
