/**
 * The holding's record behind /proprietario: what the page reads and writes in `profiles`, and how
 * the Cartão CNPJ read by the AI (lib/cnpj-card-extract.ts) lands in it.
 *
 * PJ only: the owner is always the holding (a pessoa física never signs up). The scalar columns the
 * app already had (cnpj, business_name, trade_name, registration_status_date, address, phone,
 * admin_data) stay the source for everything that reads them; `company_registry` keeps the whole
 * card (CNAEs, natureza jurídica, porte, situação…) and the page shows both.
 */
import { formatCEP, formatCNPJ, formatPhone, normalizeCNPJ, validateCNPJ, validateEmail } from "@/lib/validators";
import { EMPTY_REGISTRY, type CompanyRegistry } from "@/lib/cnpj-card-extract";

/** The owner's address as `profiles.address` keeps it (the legacy profile form's shape). */
export interface HoldingAddress {
    cep: string;
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
}

/** `profiles.admin_data`: the person who answers for the holding. */
export interface HoldingAdmin {
    name: string;
    email: string;
    phone: string;
    address: HoldingAddress;
}

/** What /proprietario shows and edits. */
export interface HoldingProfile {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    cnpj: string;
    business_name: string;
    trade_name: string;
    registration_status_date: string;
    address: HoldingAddress;
    admin: HoldingAdmin;
    registry: CompanyRegistry | null;
    /** when the card was read; null before the first import */
    registry_read_at: string | null;
    updated_at: string | null;
}

export const EMPTY_ADDRESS: HoldingAddress = { cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" };
export const EMPTY_ADMIN: HoldingAdmin = { name: "", email: "", phone: "", address: { ...EMPTY_ADDRESS } };

/** The columns the page needs from `profiles`. */
export const HOLDING_COLUMNS = "id, full_name, email, phone, cnpj, business_name, trade_name, registration_status_date, address, admin_data, company_registry, updated_at";

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function sanitizeAddress(v: unknown): HoldingAddress {
    const a = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const cepDigits = text(a.cep, 20).replace(/\D/g, "");
    return {
        cep: cepDigits.length === 8 ? formatCEP(cepDigits) : cepDigits.slice(0, 8),
        street: text(a.street, 200),
        number: text(a.number, 20),
        complement: text(a.complement, 120),
        neighborhood: text(a.neighborhood, 120),
        city: text(a.city, 120),
        state: text(a.state, 2).toUpperCase(),
    };
}

export function sanitizeAdmin(v: unknown): HoldingAdmin {
    const a = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    return {
        name: text(a.name, 200),
        email: text(a.email, 160).toLowerCase(),
        phone: text(a.phone, 40),
        address: sanitizeAddress(a.address),
    };
}

/** A stored registry (JSON column) as the typed shape, every key present. */
export function registryFromRow(v: unknown): CompanyRegistry | null {
    if (!v || typeof v !== "object") return null;
    const r = v as Partial<CompanyRegistry>;
    return { ...EMPTY_REGISTRY, ...r, cnaes_secundarios: Array.isArray(r.cnaes_secundarios) ? r.cnaes_secundarios : [] };
}

/** One `profiles` row as the page's record. */
export function holdingFromRow(row: Record<string, unknown>): HoldingProfile {
    const registry = registryFromRow(row.company_registry);
    const readAt = (row.company_registry as { read_at?: unknown } | null)?.read_at;
    return {
        id: String(row.id),
        full_name: text(row.full_name, 200),
        email: text(row.email, 160),
        phone: text(row.phone, 40),
        cnpj: text(row.cnpj, 20),
        business_name: text(row.business_name, 200),
        trade_name: text(row.trade_name, 200),
        registration_status_date: text(row.registration_status_date, 10),
        address: sanitizeAddress(row.address),
        admin: sanitizeAdmin(row.admin_data),
        registry,
        registry_read_at: typeof readAt === "string" ? readAt : null,
        updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    };
}

/** The fields the page may change by hand (everything the card fills can also be corrected). */
export interface HoldingPatch {
    full_name?: string;
    phone?: string;
    cnpj?: string;
    business_name?: string;
    trade_name?: string;
    registration_status_date?: string;
    address?: HoldingAddress;
    admin?: HoldingAdmin;
}

export type HoldingPatchResult = { columns: Record<string, unknown> } | { error: string };

/**
 * A PATCH body as `profiles` columns. Unknown keys are ignored; a wrong value answers with the
 * message the form shows. `cnpj` is stored formatted (00.000.000/0000-00) — the one shape every
 * reader expects — and "" clears it.
 */
export function sanitizeHoldingPatch(body: unknown): HoldingPatchResult {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Corpo da requisição inválido." };
    const b = body as Record<string, unknown>;
    const columns: Record<string, unknown> = {};

    if ("full_name" in b) columns.full_name = text(b.full_name, 200);
    if ("phone" in b) columns.phone = text(b.phone, 40) ? formatPhone(text(b.phone, 40)) : "";
    if ("business_name" in b) columns.business_name = text(b.business_name, 200);
    if ("trade_name" in b) columns.trade_name = text(b.trade_name, 200);
    if ("cnpj" in b) {
        const raw = normalizeCNPJ(text(b.cnpj, 30));
        if (raw && !validateCNPJ(raw)) return { error: "CNPJ inválido." };
        columns.cnpj = raw ? formatCNPJ(raw) : "";
    }
    if ("registration_status_date" in b) {
        const d = text(b.registration_status_date, 10);
        if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: "Data da situação cadastral inválida." };
        columns.registration_status_date = d || null;
    }
    if ("address" in b) columns.address = sanitizeAddress(b.address);
    if ("admin" in b) {
        const admin = sanitizeAdmin(b.admin);
        if (admin.email && !validateEmail(admin.email)) return { error: "E-mail do administrador inválido." };
        columns.admin_data = admin;
    }

    if (Object.keys(columns).length === 0) return { error: "Nada para salvar." };
    columns.person_type = "pj";
    columns.updated_at = new Date().toISOString();
    return { columns };
}

/**
 * The card as `profiles` columns: the registry itself (with who read it and when) and the scalar
 * mirrors. A field the card does not show keeps what the profile had, so a card without a nome
 * fantasia never wipes one typed by hand.
 */
export function registryToProfileColumns(reg: CompanyRegistry, meta: { read_at: string; read_by: unknown; source_path: string | null }): Record<string, unknown> {
    const columns: Record<string, unknown> = {
        company_registry: { ...reg, ...meta },
        person_type: "pj",
        updated_at: meta.read_at,
    };
    if (reg.cnpj) columns.cnpj = reg.cnpj;
    if (reg.razao_social) columns.business_name = reg.razao_social;
    if (reg.nome_fantasia) columns.trade_name = reg.nome_fantasia;
    if (reg.data_situacao_cadastral) columns.registration_status_date = reg.data_situacao_cadastral;
    if (reg.telefone) columns.phone = formatPhone(reg.telefone.split("/")[0].trim());
    if (reg.endereco) {
        const e = reg.endereco;
        columns.address = sanitizeAddress({
            cep: e.cep ?? "",
            street: e.logradouro ?? "",
            number: e.numero ?? "",
            complement: e.complemento ?? "",
            neighborhood: e.bairro ?? "",
            city: e.municipio ?? "",
            state: e.uf ?? "",
        });
    }
    return columns;
}

/** "Rua X, 10 · Sala 2 · Centro · Curitiba/PR · CEP 80000-000", or "" when empty. */
export function addressLine(a: HoldingAddress | null | undefined): string {
    if (!a) return "";
    return [
        [a.street, a.number].filter(Boolean).join(", "),
        a.complement,
        a.neighborhood,
        [a.city, a.state].filter(Boolean).join("/"),
        a.cep ? `CEP ${a.cep}` : null,
    ].filter(Boolean).join(" · ");
}
