/**
 * Everything the contract template needs about a lease, gathered from the account's records: the lease
 * and its charges, the tenants, the holding (/proprietario), the agency, the property's address and
 * register (the owner's profile JSON, paired with the `properties` row as the Imóveis page does) and
 * the late fee the Faturas settings charge.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { loadOwnedLease } from "@/lib/leases-server";
import { parsePropertyType, type PropertyType } from "@/lib/property-type";
import { sanitizeAddress, sanitizeAdmin, type HoldingAddress } from "@/lib/profile-holding";
import { formatCEP, formatCNPJ, formatCPF, formatPhone } from "@/lib/validators";
import type { AdjustmentIndex, ChargeCollector, ChargeResponsibility, ChargeType, LeaseManagementType, LeaseStatus } from "@/types/lease";
import type { ContractData, ContractPerson } from "./template";

type Json = Record<string, unknown>;

const asObject = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** "Rua X, 12, apto 3, Centro, Cidade/UF, CEP 00000-000", only what is filled in; null when nothing is. */
export function addressLine(a: { street?: string | null; number?: string | null; complement?: string | null; neighborhood?: string | null; city?: string | null; state?: string | null; cep?: string | null }): string | null {
    const cityState = [str(a.city), str(a.state)].filter(Boolean).join("/");
    const parts = [str(a.street), str(a.number), str(a.complement), str(a.neighborhood), cityState || null, str(a.cep) ? `CEP ${formatCEP(a.cep!)}` : null].filter(Boolean);
    return str(a.street) ? parts.join(", ") : null;
}

const holdingAddress = (a: HoldingAddress) => addressLine({ street: a.street, number: a.number, complement: a.complement, neighborhood: a.neighborhood, city: a.city, state: a.state, cep: a.cep });

function isStandaloneUc(electronicId: unknown): boolean {
    if (!electronicId) return false;
    try {
        return !!JSON.parse(electronicId as string).isStandaloneUc;
    } catch {
        return false;
    }
}

/** The profile entry (type, details, units) of one property row — paired like lib/property-units-server.ts. */
export function propertyEntryFor(properties: { id: string; name: string }[], profile: Json, propertyId: string): { type: PropertyType; details: Json; units: Json[] } | null {
    const claimed = new Set<string>();
    const additional = Array.isArray(profile.additional_properties) ? profile.additional_properties : [];
    for (const raw of additional) {
        const entry = asObject(raw);
        if (!entry) continue;
        const details = asObject(entry.details) ?? {};
        const entryName = typeof details.propertyName === "string" ? details.propertyName.trim().toLowerCase() : "";
        const row = properties.find(p => p.id === entry.id) ?? properties.find(p => !claimed.has(p.id) && entryName !== "" && p.name.trim().toLowerCase() === entryName);
        if (!row) continue;
        claimed.add(row.id);
        if (row.id === propertyId) {
            return { type: parsePropertyType(entry.propertyType), details, units: (Array.isArray(entry.subUnits) ? entry.subUnits : []).map(asObject).filter((u): u is Json => !!u) };
        }
    }
    const primaryDetails = asObject(profile.property_details) ?? {};
    const primaryName = typeof primaryDetails.propertyName === "string" ? primaryDetails.propertyName.trim().toLowerCase() : "";
    const free = properties.filter(p => !claimed.has(p.id));
    const primary = free.find(p => primaryName !== "" && p.name.trim().toLowerCase() === primaryName) ?? free[0];
    if (primary?.id === propertyId) {
        return { type: parsePropertyType(profile.property_type), details: primaryDetails, units: (Array.isArray(profile.sub_units) ? profile.sub_units : []).map(asObject).filter((u): u is Json => !!u) };
    }
    return null;
}

const TENANT_COLUMNS = "id, full_name, cpf, rg, occupation, email, main_phone, street, street_number, address_complement, neighborhood, city, state, postal_code";

function person(t: Json | null): ContractPerson {
    return {
        name: str(t?.full_name),
        cpf: str(t?.cpf) ? formatCPF(String(t!.cpf)) : null,
        rg: str(t?.rg),
        occupation: str(t?.occupation),
        email: str(t?.email),
        phone: str(t?.main_phone) ? formatPhone(String(t!.main_phone)) : null,
        address: t ? addressLine({ street: t.street as string, number: t.street_number as string, complement: t.address_complement as string, neighborhood: t.neighborhood as string, city: t.city as string, state: t.state as string, cep: t.postal_code as string }) : null,
    };
}

export interface LoadedContractData {
    data: ContractData;
    leaseStatus: LeaseStatus;
    /** the e-mail and phone the signing link goes to: the primary tenant's */
    tenantEmail: string | null;
    tenantPhone: string | null;
    tenantName: string | null;
}

export async function loadContractData(supabase: AdminSupabase, profileId: string, leaseId: string): Promise<LoadedContractData> {
    const lease = await loadOwnedLease(supabase, leaseId, profileId, "*");
    const propertyId = String(lease.property_id);

    const [primaryRes, othersRes, chargesRes, profileRes, propertiesRes, agencyRes, billingRes] = await Promise.all([
        supabase.from("tenants").select(TENANT_COLUMNS).eq("id", String(lease.primary_tenant_id)).eq("user_id", profileId).maybeSingle(),
        supabase.from("lease_tenants").select(`role, tenant:tenants!tenant_id(${TENANT_COLUMNS})`).eq("lease_id", leaseId),
        supabase.from("lease_charges").select("charge_type, label, responsibility, amount, collected_by, adjusts_with_rent").eq("lease_id", leaseId),
        supabase.from("profiles").select("email, phone, cnpj, business_name, address, admin_data, property_type, property_details, sub_units, additional_properties").eq("id", profileId).maybeSingle(),
        supabase.from("properties").select("id, name, address, city, state, zip, electronic_id").eq("owner_id", profileId).order("created_at", { ascending: true }),
        lease.agency_id ? supabase.from("agencies").select("name, cnpj, creci_number, creci_state, creci_type, owner_name, email, main_phone, street, street_number, address_complement, neighborhood, city, state, postal_code").eq("id", String(lease.agency_id)).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("billing_settings").select("fine_pct, interest_pct_month").eq("owner_id", profileId).maybeSingle(),
    ]);

    const profile = (profileRes.data ?? {}) as Json;
    const rows = ((propertiesRes.data ?? []) as Json[]).filter(p => !isStandaloneUc(p.electronic_id));
    const row = rows.find(p => p.id === propertyId) ?? null;
    const entry = propertyEntryFor(rows.map(p => ({ id: String(p.id), name: String(p.name ?? "") })), profile, propertyId);
    const details = entry?.details ?? {};
    const unit = lease.unit_id ? entry?.units.find(u => u.id === lease.unit_id) ?? null : null;
    const type: PropertyType = entry?.type ?? "single";

    const parking = type === "multi" ? (unit ? (unit.garage ? 1 : 0) : null) : num(details.parkingSpaces);
    const city = str(row?.city), state = str(row?.state);
    const street = str(row?.address);
    const propertyAddress = street
        ? [street, city && !street.toLowerCase().includes(city.toLowerCase()) ? [city, state].filter(Boolean).join("/") : null, str(row?.zip) ? `CEP ${formatCEP(String(row!.zip))}` : null].filter(Boolean).join(", ")
        : null;

    const admin = sanitizeAdmin(profile.admin_data);
    const ownerAddress = holdingAddress(sanitizeAddress(profile.address));
    const agency = agencyRes.data as Json | null;
    const others = ((othersRes.data ?? []) as Json[]).map(r => ({ role: r.role as string, tenant: asObject(r.tenant) }));
    const primary = primaryRes.data as Json | null;
    const billing = billingRes.data as Json | null;
    const management = String(lease.management_type) as LeaseManagementType;

    const data: ContractData = {
        reference: [str(row?.name), str(lease.unit_name)].filter(Boolean).join(" · ") || "Imóvel",
        owner: {
            name: str(profile.business_name),
            cnpj: str(profile.cnpj) ? formatCNPJ(String(profile.cnpj)) : null,
            address: ownerAddress,
            representative: str(admin.name),
            email: str(profile.email) ?? str(admin.email),
            phone: str(profile.phone) ? formatPhone(String(profile.phone)) : str(admin.phone) ? formatPhone(admin.phone) : null,
        },
        agency: management === "AGENCY" && agency ? {
            name: String(agency.name ?? "Imobiliária"),
            cnpj: str(agency.cnpj) ? formatCNPJ(String(agency.cnpj)) : null,
            creci: str(agency.creci_number) ? `${agency.creci_type === "PJ" ? "J-" : ""}${agency.creci_number}${str(agency.creci_state) ? `/${agency.creci_state}` : ""}` : null,
            address: addressLine({ street: agency.street as string, number: agency.street_number as string, complement: agency.address_complement as string, neighborhood: agency.neighborhood as string, city: agency.city as string, state: agency.state as string, cep: agency.postal_code as string }),
            representative: str(agency.owner_name),
            email: str(agency.email),
            phone: str(agency.main_phone) ? formatPhone(String(agency.main_phone)) : null,
        } : null,
        tenants: [person(primary), ...others.filter(o => o.role === "CO_TENANT" && o.tenant).map(o => person(o.tenant))],
        occupants: others.filter(o => o.role === "OCCUPANT").map(o => str(o.tenant?.full_name)).filter((n): n is string => !!n),
        property: {
            type,
            unitName: str(lease.unit_name) ?? str(unit?.name),
            unitType: str(unit?.unitType),
            address: propertyAddress,
            city,
            state,
            matricula: str(details.matricula),
            inscricao: str(details.inscricaoImobiliaria),
            parkingSpaces: parking == null ? null : Math.max(0, Math.round(parking)),
        },
        lease: {
            start: String(lease.start_date).slice(0, 10),
            end: lease.end_date ? String(lease.end_date).slice(0, 10) : null,
            rent: Number(lease.monthly_rent) || 0,
            dueDay: Number(lease.rent_due_day) || 10,
            deposit: num(lease.security_deposit),
            depositMonths: num(lease.deposit_months),
            index: (str(lease.adjustment_index) as AdjustmentIndex | null) ?? null,
            frequencyMonths: num(lease.adjustment_frequency),
            management,
        },
        charges: ((chargesRes.data ?? []) as Json[]).map(c => ({
            type: String(c.charge_type) as ChargeType,
            label: str(c.label),
            responsibility: String(c.responsibility) as ChargeResponsibility,
            amount: num(c.amount),
            collectedBy: (str(c.collected_by) as ChargeCollector | null) ?? null,
            adjustsWithRent: c.adjusts_with_rent === true,
        })),
        iptuPaidBy: details.iptuPaidBy === "landlord" ? "landlord" : details.iptuPaidBy === "tenant" ? "tenant" : null,
        billing: { finePct: num(billing?.fine_pct), interestPctMonth: num(billing?.interest_pct_month) },
    };

    return {
        data,
        leaseStatus: String(lease.status) as LeaseStatus,
        tenantEmail: str(primary?.email),
        tenantPhone: str(primary?.main_phone),
        tenantName: str(primary?.full_name),
    };
}
