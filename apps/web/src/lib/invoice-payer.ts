/**
 * Who an invoice is addressed to, and what is missing before a boleto can be issued and e-mailed.
 *
 * A bank needs the payer's name, CPF and address (with CEP); the e-mail needs an address to go to.
 * A tenant registered by the contract import has no address of their own — they live in the rented
 * property — so the property's address stands in, with the unit as the complement. What is still
 * missing after that becomes a blocker: the invoice exists and can be settled by hand, but it is never
 * issued or sent on incomplete data.
 */
import { validateCPF } from "@/lib/validators";

export type InvoiceBlocker = "NO_EMAIL" | "INVALID_CPF" | "NO_ADDRESS" | "NO_CEP";

export const BLOCKER_LABELS: Record<InvoiceBlocker, string> = {
    NO_EMAIL: "inquilino sem e-mail",
    INVALID_CPF: "CPF do inquilino inválido",
    NO_ADDRESS: "endereço do pagador incompleto",
    NO_CEP: "endereço do pagador sem CEP",
};

export const isBlocker = (v: unknown): v is InvoiceBlocker => typeof v === "string" && v in BLOCKER_LABELS;

export interface PayerAddress {
    cep: string;
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
}

export interface PayerTenant {
    full_name: string;
    cpf: string | null;
    email?: string | null;
    postal_code?: string | null;
    street?: string | null;
    street_number?: string | null;
    address_complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    use_property_address?: boolean | null;
}

/** The rented property as the `properties` row has it: one address line, the city, the UF and the CEP. */
export interface PayerProperty {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
}

export interface Payer {
    name: string;
    /** digits only */
    cpf: string;
    email: string | null;
    address: PayerAddress | null;
    blockers: InvoiceBlocker[];
}

const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const clean = (v: string | null | undefined) => (v ?? "").trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ownAddress = (t: PayerTenant): PayerAddress => ({
    cep: digits(t.postal_code), street: clean(t.street), number: clean(t.street_number), complement: clean(t.address_complement),
    neighborhood: clean(t.neighborhood), city: clean(t.city), state: clean(t.state).toUpperCase(),
});

const propertyAddress = (p: PayerProperty, unitName: string | null | undefined): PayerAddress => ({
    cep: digits(p.zip), street: clean(p.address), number: "", complement: clean(unitName), neighborhood: "", city: clean(p.city), state: clean(p.state).toUpperCase(),
});

const located = (a: PayerAddress) => Boolean(a.street && a.city && a.state.length === 2);

/**
 * The payer of a lease's invoice. The tenant's own address is used when it is complete and they do not
 * live in the rented property; otherwise the property's. `billingEmail` is the lease's own invoice
 * address, when the owner set one.
 */
export function resolvePayer(tenant: PayerTenant, property: PayerProperty | null, unitName?: string | null, billingEmail?: string | null): Payer {
    const cpf = digits(tenant.cpf);
    const email = [clean(billingEmail), clean(tenant.email)].find(e => EMAIL.test(e)) ?? null;

    const own = ownAddress(tenant);
    const rented = property ? propertyAddress(property, unitName) : null;
    const candidates = tenant.use_property_address ? [rented, own] : [own, rented];
    const address = candidates.find((a): a is PayerAddress => a !== null && located(a)) ?? null;

    const blockers: InvoiceBlocker[] = [];
    if (!email) blockers.push("NO_EMAIL");
    if (!validateCPF(cpf)) blockers.push("INVALID_CPF");
    if (!address) blockers.push("NO_ADDRESS");
    else if (address.cep.length !== 8) blockers.push("NO_CEP");

    return { name: clean(tenant.full_name), cpf, email, address, blockers };
}

/** "falta: inquilino sem e-mail, endereço do pagador sem CEP" */
export const blockersText = (blockers: readonly string[]): string =>
    blockers.filter(isBlocker).map(b => BLOCKER_LABELS[b]).join(", ");
