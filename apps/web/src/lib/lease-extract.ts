import { parseCurrencyBR } from "@/lib/currency";
import { parseCEP, parseCNPJ, parseCPF, validateCNPJ, validateCPF } from "@/lib/validators";
import {
    LEASE_ADJUSTMENT,
    LEASE_CHARGE_TYPES,
    LEASE_RESPONSIBILITIES,
} from "@/lib/schemas/lease";

/**
 * Lease-agreement import (Contratos → "Importar contrato com IA").
 *
 * Pure pieces shared by POST /api/leases/extract and its tests: the prompt,
 * the lenient normaliser for whatever JSON the model returns, and the matching
 * of the extracted parties against the account's existing records. Nothing in
 * here touches the database or creates anything: the route only reports what
 * it found and what it matched, the user decides what gets created.
 */

export const LEASE_EXTRACTION_PROMPT = `Você é um especialista em análise de contratos de locação brasileiros (residenciais e comerciais).
Analise o contrato e extraia os dados da locação, das partes e do imóvel.

ATENÇÃO:
- LOCATÁRIO(S) = inquilino(s). LOCADOR = proprietário. NÃO confunda um com o outro.
- FIADOR não é inquilino: não o inclua em "tenants".
- A IMOBILIÁRIA / ADMINISTRADORA / INTERMEDIADORA / PROCURADORA do locador (normalmente pessoa jurídica com CNPJ e CRECI, às vezes só no cabeçalho/timbre) vai em "agency". Se o contrato for direto entre locador e locatário, sem imobiliária, use "agency": null.
- O endereço em "property" é o do IMÓVEL LOCADO (objeto do contrato), não o endereço residencial das partes.

Retorne SOMENTE um JSON válido (sem markdown, sem explicações) com esta estrutura:
{
    "lease": {
        "start_date": "início da locação (YYYY-MM-DD) ou null",
        "end_date": "término da locação (YYYY-MM-DD) ou null",
        "duration_months": "prazo em meses (número) ou null",
        "monthly_rent": "valor do aluguel mensal, ex: 1500.00",
        "rent_due_day": "dia do mês do vencimento do aluguel (1-31) ou null",
        "security_deposit": "valor da caução/depósito em R$, ex: 3000.00, ou null",
        "deposit_months": "quantidade de aluguéis dados em caução (número) ou null",
        "guarantee_type": "CAUCAO | FIADOR | SEGURO_FIANCA | TITULO_CAPITALIZACAO | OUTRA | NENHUMA",
        "guarantee_details": "resumo curto da garantia (ex: nome do fiador, seguradora) ou null",
        "adjustment_index": "IPCA | IGP_M (IGP-M/IGPM) | INPC | IVAR | CUSTOM (outro índice) | NONE (sem reajuste), ou null se o contrato não tratar de reajuste",
        "adjustment_frequency": "periodicidade do reajuste em meses (número, normalmente 12) ou null",
        "purpose": "RESIDENCIAL | COMERCIAL ou null",
        "notes": "resumo breve (até 400 caracteres) de cláusulas relevantes: multa por rescisão, desconto de pontualidade, vistoria etc., ou null"
    },
    "charges": [
        {
            "charge_type": "CONDOMINIUM | IPTU | WATER | ELECTRICITY | GAS | INTERNET | OTHER",
            "label": "descrição, somente quando charge_type = OTHER",
            "responsibility": "TENANT (pago pelo inquilino) | LANDLORD (pago pelo proprietário) | INCLUDED (incluso no aluguel)",
            "amount": "valor mensal em R$ se constar, ex: 350.00, ou null"
        }
    ],
    "tenants": [
        {
            "full_name": "nome completo",
            "cpf": "CPF",
            "rg": "RG ou null",
            "email": "e-mail ou null",
            "main_phone": "telefone com DDD ou null",
            "date_of_birth": "YYYY-MM-DD ou null",
            "role": "PRIMARY (primeiro locatário) | CO_TENANT (demais locatários) | OCCUPANT (morador que não assina como locatário)"
        }
    ],
    "property": {
        "name": "identificação CURTA do imóvel/unidade, sem o endereço (ex: Apartamento 302, Kitnet 03, Casa, Loja 2) ou null",
        "property_type": "casa | apartamento | kitnet | sala comercial | loja | outro",
        "street": "logradouro",
        "street_number": "número",
        "address_complement": "complemento (apto, bloco, sala) ou null",
        "neighborhood": "bairro",
        "city": "cidade",
        "state": "UF em 2 letras",
        "postal_code": "CEP ou null"
    },
    "landlord": { "name": "nome do locador", "document": "CPF ou CNPJ do locador ou null" },
    "agency": {
        "name": "razão social",
        "trade_name": "nome fantasia ou null",
        "cnpj": "CNPJ ou null",
        "creci_number": "número do CRECI ou null",
        "creci_state": "UF do CRECI ou null",
        "owner_name": "representante legal ou null",
        "main_phone": "telefone com DDD ou null",
        "email": "e-mail ou null",
        "website": "site ou null",
        "postal_code": "CEP ou null",
        "street": "logradouro ou null",
        "street_number": "número ou null",
        "address_complement": "complemento ou null",
        "neighborhood": "bairro ou null",
        "city": "cidade ou null",
        "state": "UF ou null",
        "management_fee": "taxa de administração em % (número) ou null"
    },
    "confidence": 0.0
}

Regras:
- Extraia valores EXATOS do documento. NÃO invente dados: o que não constar é null (ou lista vazia).
- Converta decimais brasileiros: "1.500,00" → "1500.00". Converta datas: "01/03/2026" → "2026-03-01".
- Liste em "charges" somente os encargos que o contrato menciona.
- "confidence" (0.0 a 1.0) reflete a qualidade geral da extração.`;

// ── Extracted shape ──────────────────────────────────────────────────

export type ExtractedTenantRole = "PRIMARY" | "CO_TENANT" | "OCCUPANT";

export interface ExtractedTenant {
    full_name: string;
    /** 11 digits (not necessarily valid: scans misread digits), or "" when the document has none. */
    cpf: string;
    rg: string | null;
    email: string | null;
    main_phone: string | null;
    date_of_birth: string | null;
    role: ExtractedTenantRole;
}

export interface ExtractedProperty {
    name: string | null;
    property_type: string | null;
    street: string | null;
    street_number: string | null;
    address_complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    /** 8 digits or null */
    postal_code: string | null;
}

export interface ExtractedAgency {
    name: string;
    trade_name: string | null;
    /** 14 characters or null */
    cnpj: string | null;
    creci_number: string | null;
    creci_state: string | null;
    owner_name: string | null;
    main_phone: string | null;
    email: string | null;
    website: string | null;
    postal_code: string | null;
    street: string | null;
    street_number: string | null;
    address_complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    management_fee: number | null;
}

export interface ExtractedCharge {
    charge_type: (typeof LEASE_CHARGE_TYPES)[number];
    label: string;
    responsibility: (typeof LEASE_RESPONSIBILITIES)[number];
    amount: number | null;
}

export interface ExtractedLease {
    lease: {
        start_date: string | null;
        end_date: string | null;
        monthly_rent: number | null;
        rent_due_day: number | null;
        security_deposit: number | null;
        deposit_months: number | null;
        adjustment_index: (typeof LEASE_ADJUSTMENT)[number] | null;
        adjustment_frequency: number | null;
        notes: string | null;
    };
    charges: ExtractedCharge[];
    tenants: ExtractedTenant[];
    property: ExtractedProperty | null;
    agency: ExtractedAgency | null;
    confidence: number | null;
}

// ── Normalisation ────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

const NULLISH_TEXT = new Set(["null", "undefined", "n/a", "na", "não consta", "nao consta", "não informado", "nao informado", "-"]);

function text(v: unknown, max = 300): string | null {
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v !== "string") return null;
    const t = v.replace(/\s+/g, " ").trim();
    if (!t || NULLISH_TEXT.has(t.toLowerCase())) return null;
    return t.slice(0, max);
}

function isoDate(v: unknown): string | null {
    const t = text(v, 30);
    if (!t) return null;
    const br = BR_DATE.exec(t);
    const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : t.slice(0, 10);
    if (!ISO_DATE.test(iso)) return null;
    const d = new Date(`${iso}T00:00:00Z`);
    // Rejects impossible dates (2026-02-31) that the regex lets through.
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

function money(v: unknown): number | null {
    if (v == null || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
    if (typeof v !== "string") return null;
    const n = parseCurrencyBR(v);
    return n != null && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function int(v: unknown, min: number, max: number): number | null {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? Math.trunc(v) : parseInt(String(v).replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function oneOf<T extends readonly string[]>(list: T, v: unknown): T[number] | null {
    const t = text(v, 40)?.toUpperCase().replace(/[\s-]+/g, "_");
    return t && (list as readonly string[]).includes(t) ? (t as T[number]) : null;
}

/** Models write the index the way the contract does: "IGPM", "IGP-M/FGV", "IPCA (IBGE)". */
function adjustmentIndex(v: unknown): (typeof LEASE_ADJUSTMENT)[number] | null {
    const key = text(v, 60)?.toUpperCase().replace(/[^A-Z]/g, "");
    if (!key) return null;
    if (key.includes("IGPM")) return "IGP_M";
    for (const known of ["IPCA", "INPC", "IVAR"] as const) if (key.includes(known)) return known;
    if (key === "NONE" || key.startsWith("NENHUM") || key.startsWith("SEM")) return "NONE";
    return "CUSTOM";
}

const CHARGE_ALIASES: [RegExp, (typeof LEASE_CHARGE_TYPES)[number]][] = [
    [/condom/, "CONDOMINIUM"],
    [/iptu/, "IPTU"],
    [/agua|water|saneamento/, "WATER"],
    [/energia|eletric|electric|luz/, "ELECTRICITY"],
    [/\bgas\b/, "GAS"],
    [/internet|wi ?fi/, "INTERNET"],
];

/** The enum value, a Portuguese spelling of it, or an OTHER whose label names a known charge. */
function chargeType(type: unknown, label: unknown): (typeof LEASE_CHARGE_TYPES)[number] | null {
    const exact = oneOf(LEASE_CHARGE_TYPES, type);
    if (exact && exact !== "OTHER") return exact;
    const hint = normalizeText(`${text(type, 60) ?? ""} ${text(label, 100) ?? ""}`);
    const alias = CHARGE_ALIASES.find(([re]) => re.test(hint));
    return alias ? alias[1] : exact ?? (text(label, 100) ? "OTHER" : null);
}

function responsibility(v: unknown): (typeof LEASE_RESPONSIBILITIES)[number] {
    const exact = oneOf(LEASE_RESPONSIBILITIES, v);
    if (exact) return exact;
    const key = normalizeText(text(v, 60));
    if (/inclus|included/.test(key)) return "INCLUDED";
    if (/proprietari|locador|landlord/.test(key)) return "LANDLORD";
    return "TENANT";
}

function uf(v: unknown): string | null {
    const t = text(v, 10)?.toUpperCase();
    return t && /^[A-Z]{2}$/.test(t) ? t : null;
}

function cep(v: unknown): string | null {
    const digits = parseCEP(text(v, 20) ?? "");
    return digits.length === 8 ? digits : null;
}

function obj(v: unknown): Record<string, unknown> | null {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** start + N months − 1 day, the way Brazilian leases state their term. */
export function endDateFromDuration(startIso: string, months: number): string | null {
    const [y, m, d] = startIso.split("-").map(Number);
    const end = new Date(Date.UTC(y, m - 1 + months, d));
    // A start on the 31st must not spill into the following month.
    if (end.getUTCDate() !== d) end.setUTCDate(0);
    else end.setUTCDate(end.getUTCDate() - 1);
    return Number.isNaN(end.getTime()) ? null : end.toISOString().slice(0, 10);
}

const GUARANTEE_LABELS: Record<string, string> = {
    CAUCAO: "Caução",
    FIADOR: "Fiador",
    SEGURO_FIANCA: "Seguro fiança",
    TITULO_CAPITALIZACAO: "Título de capitalização",
    OUTRA: "Outra",
};

/**
 * Turns whatever the model answered into the shape the import flow relies on.
 * Lenient on purpose: a wrong or missing field becomes null, never an error,
 * because the user reviews everything in the form before saving.
 */
export function normalizeLeaseExtraction(raw: unknown): ExtractedLease {
    const root = obj(raw) ?? {};
    const l = obj(root.lease) ?? {};

    const start = isoDate(l.start_date);
    let end = isoDate(l.end_date);
    const duration = int(l.duration_months, 1, 600);
    if (!end && start && duration) end = endDateFromDuration(start, duration);
    if (start && end && end <= start) end = null;

    const monthlyRent = money(l.monthly_rent);
    let deposit = money(l.security_deposit);
    const depositMonths = int(l.deposit_months, 1, 36);
    if (!deposit && depositMonths && monthlyRent) deposit = Math.round(monthlyRent * depositMonths * 100) / 100;

    const guaranteeType = text(l.guarantee_type, 40)?.toUpperCase().replace(/[\s-]+/g, "_") ?? null;
    const guaranteeLabel = guaranteeType ? GUARANTEE_LABELS[guaranteeType] : null;
    const guaranteeDetails = text(l.guarantee_details, 300);
    const purpose = text(l.purpose, 20)?.toUpperCase();
    const landlord = obj(root.landlord);
    const landlordName = text(landlord?.name, 200);

    const notes = [
        purpose === "RESIDENCIAL" ? "Locação residencial." : purpose === "COMERCIAL" ? "Locação comercial." : null,
        landlordName ? `Locador: ${landlordName}.` : null,
        guaranteeLabel ? `Garantia: ${guaranteeLabel}${guaranteeDetails ? ` (${guaranteeDetails})` : ""}.` : null,
        text(l.notes, 600),
    ].filter(Boolean).join("\n") || null;

    const charges: ExtractedCharge[] = [];
    for (const item of Array.isArray(root.charges) ? root.charges : []) {
        const c = obj(item);
        const type = c ? chargeType(c.charge_type, c.label) : null;
        if (!c || !type) continue;
        // One line per charge type, except the free-form OTHER.
        if (type !== "OTHER" && charges.some((x) => x.charge_type === type)) continue;
        charges.push({
            charge_type: type,
            label: type === "OTHER" ? text(c.label, 100) ?? "" : "",
            responsibility: responsibility(c.responsibility),
            amount: money(c.amount),
        });
    }

    const tenants: ExtractedTenant[] = [];
    for (const item of Array.isArray(root.tenants) ? root.tenants : []) {
        const t = obj(item);
        const fullName = text(t?.full_name, 200);
        if (!t || !fullName) continue;
        const cpfDigits = parseCPF(text(t.cpf, 30) ?? "");
        // A CPF that fails its check digits is kept so the user can fix the typo instead of retyping it.
        const cpf = cpfDigits.length === 11 ? cpfDigits : "";
        if (cpf && tenants.some((x) => x.cpf === cpf)) continue;
        tenants.push({
            full_name: fullName,
            cpf,
            rg: text(t.rg, 30),
            email: text(t.email, 200)?.toLowerCase() ?? null,
            main_phone: text(t.main_phone, 40),
            date_of_birth: isoDate(t.date_of_birth),
            role: oneOf(["PRIMARY", "CO_TENANT", "OCCUPANT"] as const, t.role) ?? "CO_TENANT",
        });
    }
    // Exactly one primary: the first one flagged, else the first listed.
    const primaryIdx = Math.max(0, tenants.findIndex((t) => t.role === "PRIMARY"));
    tenants.forEach((t, i) => {
        if (i === primaryIdx) t.role = "PRIMARY";
        else if (t.role === "PRIMARY") t.role = "CO_TENANT";
    });
    if (primaryIdx > 0) tenants.unshift(...tenants.splice(primaryIdx, 1));

    const p = obj(root.property);
    const property: ExtractedProperty | null = p
        ? {
              name: text(p.name, 120),
              property_type: text(p.property_type, 40),
              street: text(p.street, 200),
              street_number: text(p.street_number, 20),
              address_complement: text(p.address_complement, 100),
              neighborhood: text(p.neighborhood, 100),
              city: text(p.city, 100),
              state: uf(p.state),
              postal_code: cep(p.postal_code),
          }
        : null;

    const a = obj(root.agency);
    const agencyName = text(a?.name, 200) ?? text(a?.trade_name, 200);
    const cnpjDigits = parseCNPJ(text(a?.cnpj, 30) ?? "");
    const fee = a?.management_fee == null ? NaN : parseFloat(String(a.management_fee).replace("%", "").replace(",", "."));
    const agency: ExtractedAgency | null = a && agencyName
        ? {
              name: agencyName,
              trade_name: text(a.trade_name, 200),
              cnpj: cnpjDigits.length === 14 && validateCNPJ(cnpjDigits) ? cnpjDigits : null,
              creci_number: text(a.creci_number, 30),
              creci_state: uf(a.creci_state),
              owner_name: text(a.owner_name, 200),
              main_phone: text(a.main_phone, 40),
              email: text(a.email, 200)?.toLowerCase() ?? null,
              website: text(a.website, 300),
              postal_code: cep(a.postal_code),
              street: text(a.street, 200),
              street_number: text(a.street_number, 20),
              address_complement: text(a.address_complement, 100),
              neighborhood: text(a.neighborhood, 100),
              city: text(a.city, 100),
              state: uf(a.state),
              management_fee: Number.isFinite(fee) && fee > 0 && fee <= 100 ? fee : null,
          }
        : null;

    const hasProperty = property && Object.values(property).some(Boolean);
    const confidence = typeof root.confidence === "number" && root.confidence >= 0 && root.confidence <= 1 ? root.confidence : null;

    return {
        lease: {
            start_date: start,
            end_date: end,
            monthly_rent: monthlyRent,
            rent_due_day: int(l.rent_due_day, 1, 31),
            security_deposit: deposit,
            deposit_months: depositMonths,
            adjustment_index: adjustmentIndex(l.adjustment_index),
            adjustment_frequency: int(l.adjustment_frequency, 1, 120),
            notes,
        },
        charges,
        tenants,
        property: hasProperty ? property : null,
        agency,
        confidence,
    };
}

/** True when the model found nothing a lease form could use. */
export function isEmptyExtraction(e: ExtractedLease): boolean {
    return !e.lease.start_date && !e.lease.monthly_rent && e.tenants.length === 0 && !e.property;
}

// ── Matching against the account's records ───────────────────────────

/** Lower-case, accent-free, punctuation-free, single-spaced. */
export function normalizeText(v: string | null | undefined): string {
    return (v ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

const STREET_PREFIXES = new Set([
    "rua", "r", "avenida", "av", "ave", "travessa", "tv", "trav", "alameda", "al", "praca", "pc", "pca",
    "rodovia", "rod", "estrada", "estr", "est", "largo", "lgo", "beco", "via", "viela",
]);
const STREET_FILLERS = new Set(["de", "da", "do", "das", "dos", "e"]);
const STREET_TITLES: Record<string, string> = {
    dr: "doutor", dra: "doutora", prof: "professor", profa: "professora", cel: "coronel", cap: "capitao",
    gal: "general", gen: "general", mal: "marechal", pres: "presidente", gov: "governador", sen: "senador",
    dep: "deputado", eng: "engenheiro", pe: "padre", sta: "santa", sto: "santo", s: "sao", n: "nossa", sra: "senhora",
    des: "desembargador", ver: "vereador", brig: "brigadeiro", alm: "almirante", ten: "tenente", sgt: "sargento", d: "dom",
};

/** "Av. Dr. João da Silva" → "doutor joao silva" */
export function streetKey(street: string | null | undefined): string {
    const tokens = normalizeText(street).split(" ").filter(Boolean);
    while (tokens.length > 1 && STREET_PREFIXES.has(tokens[0])) tokens.shift();
    return tokens
        .filter((t) => !STREET_FILLERS.has(t))
        .map((t) => STREET_TITLES[t] ?? t)
        .join(" ");
}

/** "120-A" → "120a"; "s/n" and friends → "". */
function numberKey(n: string | null | undefined): string {
    const k = normalizeText(n).replace(/\s+/g, "");
    return /\d/.test(k) ? k : "";
}

export interface PropertyCandidate {
    id: string;
    name: string;
    /** Free-form, usually "Rua X, 120 - Bairro". */
    address?: string | null;
    street?: string | null;
    street_number?: string | null;
    city?: string | null;
    zip?: string | null;
}

export interface MatchResult {
    id: string;
    name: string;
    /** What the match was made on, for the review screen. */
    by: "cpf" | "cnpj" | "name" | "address";
}

function candidateHasAddress(c: PropertyCandidate, street: string, number: string): boolean {
    if (c.street && streetKey(c.street) === street && numberKey(c.street_number) === number) return true;
    if (!c.address) return false;
    // "Rua X, 120 - Bairro": the street is what precedes the first comma.
    const [head, ...rest] = c.address.split(",");
    if (streetKey(head) !== street) return false;
    const firstNumber = normalizeText(rest.join(",")).split(" ").find((t) => /\d/.test(t)) ?? "";
    return numberKey(firstNumber) === number;
}

/**
 * Same street and number wins (a contract names the unit, "Apto 302", far more
 * often than the name the landlord gave the property). A name match is the
 * fallback, and only an exact one: a wrong property on a lease is worse than
 * an empty select.
 */
export function matchProperty(extracted: ExtractedProperty | null, candidates: PropertyCandidate[]): MatchResult | null {
    if (!extracted || candidates.length === 0) return null;

    const street = streetKey(extracted.street);
    const number = numberKey(extracted.street_number);
    if (street && number) {
        const city = normalizeText(extracted.city);
        const hits = candidates.filter((c) => candidateHasAddress(c, street, number));
        // The same street + number in two cities is possible; the city settles it when both sides have one.
        const sameCity = hits.filter((c) => !city || !c.city || normalizeText(c.city) === city);
        if (sameCity.length === 1) return { id: sameCity[0].id, name: sameCity[0].name, by: "address" };
        if (sameCity.length > 1) {
            const name = normalizeText(extracted.name);
            const byName = name ? sameCity.filter((c) => normalizeText(c.name) === name) : [];
            if (byName.length === 1) return { id: byName[0].id, name: byName[0].name, by: "address" };
            return null; // ambiguous: let the user pick
        }
    }

    const name = normalizeText(extracted.name);
    if (name) {
        const hits = candidates.filter((c) => normalizeText(c.name) === name);
        if (hits.length === 1) return { id: hits[0].id, name: hits[0].name, by: "name" };
    }
    return null;
}

const COMPANY_SUFFIXES = new Set(["ltda", "me", "epp", "eireli", "sa", "s", "a", "ss", "cia", "limitada", "mei"]);

/** "MR IMÓVEIS LTDA-ME" → "mr imoveis" */
export function companyKey(name: string | null | undefined): string {
    const tokens = normalizeText(name).split(" ").filter(Boolean);
    while (tokens.length > 1 && COMPANY_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
    return tokens.join(" ");
}

export interface AgencyCandidate {
    id: string;
    name: string;
    trade_name?: string | null;
    cnpj?: string | null;
}

export function matchAgency(extracted: ExtractedAgency | null, candidates: AgencyCandidate[]): MatchResult | null {
    if (!extracted || candidates.length === 0) return null;

    if (extracted.cnpj) {
        const hit = candidates.find((c) => c.cnpj && parseCNPJ(c.cnpj) === extracted.cnpj);
        if (hit) return { id: hit.id, name: hit.name, by: "cnpj" };
    }

    const keys = [companyKey(extracted.name), companyKey(extracted.trade_name)].filter(Boolean);
    if (keys.length === 0) return null;
    const hits = candidates.filter((c) => {
        // Two different CNPJs are two different companies, whatever they are called.
        if (extracted.cnpj && c.cnpj && parseCNPJ(c.cnpj) !== extracted.cnpj) return false;
        return [companyKey(c.name), companyKey(c.trade_name)].filter(Boolean).some((k) => keys.includes(k));
    });
    return hits.length === 1 ? { id: hits[0].id, name: hits[0].name, by: "name" } : null;
}

export interface TenantCandidate {
    id: string;
    full_name: string;
    cpf?: string | null;
}

export function matchTenant(extracted: ExtractedTenant, candidates: TenantCandidate[]): MatchResult | null {
    if (extracted.cpf) {
        const hit = candidates.find((c) => c.cpf && parseCPF(c.cpf) === extracted.cpf);
        if (hit) return { id: hit.id, name: hit.full_name, by: "cpf" };
        // The CPF is unique per account: with a valid one in hand, a name-only match would be another person.
        if (validateCPF(extracted.cpf)) return null;
    }
    const name = normalizeText(extracted.full_name);
    const hits = candidates.filter((c) => normalizeText(c.full_name) === name);
    return hits.length === 1 ? { id: hits[0].id, name: hits[0].full_name, by: "name" } : null;
}
