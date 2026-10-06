/**
 * Kitnets' residential lease contract (Lei nº 8.245/1991), written from what the owner already told
 * the app — the lease, the tenants, the holding, the property, the charges and the Faturas settings —
 * and from a few choices the editor's side panel asks (`ContractOptions`).
 *
 * The text leans to the landlord where the law lets it and stops where it would not hold up:
 * - a 30-month term is what lets the owner take the property back at the end without a reason (art. 46);
 *   a shorter one renews by itself (art. 47) and the panel says so;
 * - rent is paid after the month is used (art. 42/43, III: rent in advance only without a guarantee);
 * - one guarantee only (art. 37), a cash deposit up to 3 rents in a savings account (art. 38, § 2º);
 * - the early-exit fine is proportional to what is left of the term (art. 4º, CC art. 413);
 * - a negative index keeps the rent (as lib/lease-adjustments.ts calculates it);
 * - late fee and interest follow the owner's Faturas settings; interest stays within 1% a month;
 * - fire insurance and IPTU go to the tenant only when the contract says so (art. 22, VIII; art. 25);
 * - improvements are not indemnified (art. 35, Súmula 335 STJ), the urgent ones the owner ignored are;
 * - the owner never charges the tenant administration or brokerage fees (art. 22, VII).
 *
 * Whatever the app does not know (nationality, marital status, the representative's CPF…) is a blank
 * (`field` mark) the owner fills in the editor. Pure: no I/O, the same on the server and the browser.
 */
import type { AdjustmentIndex, ChargeCollector, ChargeResponsibility, ChargeType, LeaseManagementType } from "@/types/lease";
import type { PropertyType } from "@/lib/property-type";
import { addMonths, cents } from "@/lib/lease-summary";
import { termMonths } from "@/lib/lease-dashboard";
import { paymentSchedule } from "@/lib/lease-term";
import { heading, paragraph, type ContractDoc, type Inline, type PMNode } from "./doc";
import { countWithWords, formatMoney, moneyWithWords, percentWithWords } from "./extenso";

// ── What the contract is written from ─────────────────────────────────

/** A person as the contract qualifies them; every string ready to print (CPF formatted…), null = unknown. */
export interface ContractPerson {
    name: string | null;
    cpf: string | null;
    rg: string | null;
    occupation: string | null;
    email: string | null;
    phone: string | null;
    /** where they live now: "Rua X, 12, Centro, Cidade/UF, CEP 00000-000" */
    address: string | null;
}

export interface ContractCharge {
    type: ChargeType;
    label: string | null;
    responsibility: ChargeResponsibility;
    amount: number | null;
    collectedBy: ChargeCollector | null;
    /** the condominium follows the rent's index and date */
    adjustsWithRent: boolean;
}

export interface ContractData {
    /** "SANTO ANTONIO · Kitnet 35B" — the PDF's footer and file name */
    reference: string;
    owner: {
        name: string | null;
        cnpj: string | null;
        address: string | null;
        representative: string | null;
        email: string | null;
        phone: string | null;
    };
    /** the agency that manages the lease, when it does */
    agency: {
        name: string;
        cnpj: string | null;
        creci: string | null;
        address: string | null;
        representative: string | null;
        email: string | null;
        phone: string | null;
    } | null;
    /** the primary tenant first, then the co-tenants */
    tenants: ContractPerson[];
    /** who lives with them (lease_tenants OCCUPANT) */
    occupants: string[];
    property: {
        type: PropertyType;
        unitName: string | null;
        /** the unit's kind on Imóveis: kitnet, studio, apartment, house, bedroom, commercial_room, garage, other */
        unitType: string | null;
        /** the full address line, city and CEP included */
        address: string | null;
        city: string | null;
        state: string | null;
        matricula: string | null;
        inscricao: string | null;
        /** spaces that come with it; 0 = none; null = unknown */
        parkingSpaces: number | null;
    };
    lease: {
        start: string;
        end: string | null;
        rent: number;
        dueDay: number;
        deposit: number | null;
        depositMonths: number | null;
        index: AdjustmentIndex | null;
        frequencyMonths: number | null;
        management: LeaseManagementType;
    };
    charges: ContractCharge[];
    /** who pays the property tax, as the property's register says (used when the lease has no IPTU charge) */
    iptuPaidBy: "tenant" | "landlord" | null;
    /** the owner's Faturas settings: what the invoices already charge when late */
    billing: { finePct: number | null; interestPctMonth: number | null };
}

// ── What the owner chooses in the editor ──────────────────────────────

export type GuaranteeKind = "CAUCAO" | "FIANCA" | "SEGURO_FIANCA" | "NENHUMA";

export interface ContractOptions {
    /** bumped when the template changes in a way old options must be read differently */
    version: 1;
    guarantee: GuaranteeKind;
    /** fiança: the guarantor is married or in a stable union (the spouse consents and signs) */
    guarantorSpouse: boolean;
    /** early exit: the fine in rents, before the proportional cut */
    earlyExitFineRents: number;
    /** after this many months the tenant leaves without the fine (0 = never) */
    fineWaivedAfterMonths: number;
    /** the notice the tenant gives before leaving, in days */
    noticeDays: number;
    lateFeePct: number;
    interestPctMonth: number;
    /** lawyer's fees in an extrajudicial collection; 0 leaves the clause out */
    collectionFeePct: number;
    pets: "ALLOWED" | "SMALL" | "NONE";
    /** how many people may live there; null = not limited */
    maxOccupants: number | null;
    furnished: boolean;
    fireInsurance: "TENANT" | "LANDLORD";
    /** a sale during the term: the buyer may end the lease (TERMINATE, the landlord's choice) or must keep it (KEEP) */
    saleClause: "TERMINATE" | "KEEP";
    /** INVOICE: boleto/PIX sent by e-mail (Faturas); PIX: a PIX key */
    payment: "INVOICE" | "PIX";
    pixKey: string;
    witnesses: boolean;
}

export const GUARANTEE_LABELS: Record<GuaranteeKind, string> = {
    CAUCAO: "Caução em dinheiro",
    FIANCA: "Fiança (fiador)",
    SEGURO_FIANCA: "Seguro-fiança",
    NENHUMA: "Sem garantia",
};

/** The choices a new contract starts from: the landlord's side of what is common and lawful. */
export function defaultContractOptions(data: ContractData): ContractOptions {
    const deposit = Number(data.lease.deposit) || 0;
    const fine = data.billing.finePct;
    const interest = data.billing.interestPctMonth;
    return {
        version: 1,
        guarantee: deposit > 0 ? "CAUCAO" : "NENHUMA",
        guarantorSpouse: true,
        earlyExitFineRents: 3,
        fineWaivedAfterMonths: 12,
        noticeDays: 30,
        lateFeePct: fine != null && fine > 0 ? fine : 10,
        interestPctMonth: interest != null && interest > 0 ? Math.min(interest, 1) : 1,
        collectionFeePct: 10,
        pets: "SMALL",
        maxOccupants: null,
        furnished: false,
        fireInsurance: "TENANT",
        saleClause: "TERMINATE",
        payment: "INVOICE",
        pixKey: "",
        witnesses: false,
    };
}

/** Options read back from the database or a request, every value checked; what is missing comes from the defaults. */
export function readContractOptions(raw: unknown, data: ContractData): ContractOptions {
    const d = defaultContractOptions(data);
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const num = (v: unknown, min: number, max: number, fallback: number) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
    };
    const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
    const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
    const maxOcc = o.maxOccupants == null || o.maxOccupants === "" ? null : num(o.maxOccupants, 1, 20, NaN);
    return {
        version: 1,
        guarantee: oneOf(o.guarantee, ["CAUCAO", "FIANCA", "SEGURO_FIANCA", "NENHUMA"] as const, d.guarantee),
        guarantorSpouse: bool(o.guarantorSpouse, d.guarantorSpouse),
        earlyExitFineRents: num(o.earlyExitFineRents, 0, 12, d.earlyExitFineRents),
        fineWaivedAfterMonths: Math.round(num(o.fineWaivedAfterMonths, 0, 120, d.fineWaivedAfterMonths)),
        noticeDays: Math.round(num(o.noticeDays, 0, 180, d.noticeDays)),
        lateFeePct: num(o.lateFeePct, 0, 20, d.lateFeePct),
        interestPctMonth: num(o.interestPctMonth, 0, 10, d.interestPctMonth),
        collectionFeePct: num(o.collectionFeePct, 0, 20, d.collectionFeePct),
        pets: oneOf(o.pets, ["ALLOWED", "SMALL", "NONE"] as const, d.pets),
        maxOccupants: maxOcc == null || Number.isNaN(maxOcc) ? null : Math.round(maxOcc),
        furnished: bool(o.furnished, d.furnished),
        fireInsurance: oneOf(o.fireInsurance, ["TENANT", "LANDLORD"] as const, d.fireInsurance),
        saleClause: oneOf(o.saleClause, ["TERMINATE", "KEEP"] as const, d.saleClause),
        payment: oneOf(o.payment, ["INVOICE", "PIX"] as const, d.payment),
        pixKey: typeof o.pixKey === "string" ? o.pixKey.trim().slice(0, 140) : "",
        witnesses: bool(o.witnesses, d.witnesses),
    };
}

// the option keys a draft keeps (their values are checked again whenever they are read: readContractOptions)
const OPTION_KEYS = [
    "version", "guarantee", "guarantorSpouse", "earlyExitFineRents", "fineWaivedAfterMonths", "noticeDays", "lateFeePct", "interestPctMonth",
    "collectionFeePct", "pets", "maxOccupants", "furnished", "fireInsurance", "saleClause", "payment", "pixKey", "witnesses",
    // the text was changed by hand after it was written from the options
    "manualEdits",
] as const;

/** The blanks the owner filled in ({ "tenant.0.nationality": "brasileiro" }), kept so a rewrite fills them again. */
export function readFieldValues(raw: unknown): Record<string, string> {
    const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o).slice(0, 120)) {
        if (/^[a-zA-Z0-9_.]{1,60}$/.test(k) && typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 300);
    }
    return out;
}

/** Only the known option keys with plain values, and the filled blanks: what a draft stores. */
export function pickOptions(raw: unknown): Record<string, unknown> {
    const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of OPTION_KEYS) {
        const v = o[k];
        if (typeof v === "string") out[k] = v.slice(0, 140);
        else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
    }
    const fields = readFieldValues(o.fields);
    if (Object.keys(fields).length) out.fields = fields;
    return out;
}

// ── What the template does not cover ──────────────────────────────────

/** A lease the residential template does not fit: a garage space or a commercial room (other rules apply). */
export function contractSupport(data: Pick<ContractData, "property">): { ok: true } | { ok: false; reason: string } {
    const { type, unitType } = data.property;
    if (type === "garage" || unitType === "garage") {
        return { ok: false, reason: "Vaga de garagem avulsa não segue a Lei do Inquilinato (art. 1º, parágrafo único) e precisa de outro modelo de contrato, que o Kitnets ainda não gera." };
    }
    if (unitType === "commercial_room") {
        return { ok: false, reason: "Sala comercial segue as regras da locação não residencial (renovatória, art. 51) e precisa de outro modelo de contrato, que o Kitnets ainda não gera." };
    }
    return { ok: true };
}

// ── Helpers ───────────────────────────────────────────────────────────

const br = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
};
const dayBefore = (iso: string) => new Date(Date.parse(iso.slice(0, 10) + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
const upper = (s: string) => s.toLocaleUpperCase("pt-BR");
const has = (v: string | null | undefined): v is string => typeof v === "string" && v.trim().length > 0;

/** A value, or a blank to fill in when it is unknown. */
function fld(key: string, label: string, value?: string | null): Inline {
    return has(value) ? value.trim() : { text: `[${upper(label)}]`, field: { key, label } };
}

/** "a, b e c" */
function listPt(items: string[]): string {
    if (items.length <= 1) return items[0] ?? "";
    return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

const INDEX_NAMES: Record<string, string> = {
    IPCA: "IPCA (Índice Nacional de Preços ao Consumidor Amplo, do IBGE)",
    IGP_M: "IGP-M (Índice Geral de Preços do Mercado, da FGV)",
    INPC: "INPC (Índice Nacional de Preços ao Consumidor, do IBGE)",
    IVAR: "IVAR (Índice de Variação de Aluguéis Residenciais, da FGV)",
};
const INDEX_SHORT: Record<string, string> = { IPCA: "IPCA", IGP_M: "IGP-M", INPC: "INPC", IVAR: "IVAR" };

const UNIT_TYPE_WORDS: Record<string, string> = { kitnet: "kitnet", studio: "studio", apartment: "apartamento", house: "casa", bedroom: "quarto" };

const UTILITY_WORDS: Partial<Record<ChargeType, string>> = { ELECTRICITY: "energia elétrica", WATER: "água e esgoto", GAS: "gás", INTERNET: "internet" };
const CHARGE_WORDS: Record<ChargeType, string> = { CONDOMINIUM: "condomínio", IPTU: "IPTU", WATER: "água e esgoto", ELECTRICITY: "energia elétrica", GAS: "gás", INTERNET: "internet", OTHER: "outro encargo" };
const chargeWords = (c: Pick<ContractCharge, "type" | "label">) => (c.type === "OTHER" && has(c.label) ? c.label.trim().toLowerCase() : CHARGE_WORDS[c.type]);

/** The clauses in their order; the optional ones only when they apply. Numbers come from here. */
type ClauseKey =
    | "objeto" | "prazo" | "aluguel" | "reajuste" | "encargos" | "atraso" | "garantia" | "seguro" | "uso" | "conservacao"
    | "benfeitorias" | "devolucao" | "rescisao" | "restituicao" | "venda" | "administracao" | "comunicacoes" | "dados" | "gerais" | "foro";

const SECTIONS: { title: string; clauses: ClauseKey[] }[] = [
    { title: "Objeto e prazo", clauses: ["objeto", "prazo"] },
    { title: "Aluguel, reajuste e encargos", clauses: ["aluguel", "reajuste", "encargos", "atraso"] },
    { title: "Garantia e seguro", clauses: ["garantia", "seguro"] },
    { title: "Uso, conservação e benfeitorias", clauses: ["uso", "conservacao", "benfeitorias"] },
    { title: "Extinção da locação e devolução do imóvel", clauses: ["devolucao", "rescisao", "restituicao"] },
    { title: "Disposições finais", clauses: ["venda", "administracao", "comunicacoes", "dados", "gerais", "foro"] },
];

/** Who signs, in the order the signature page lists them. */
export interface ContractSigner {
    role: string;
    name: Inline;
    document: Inline;
}

export function contractSigners(data: ContractData, options: ContractOptions): ContractSigner[] {
    const out: ContractSigner[] = [];
    out.push({
        role: "LOCADOR",
        name: has(data.owner.name) ? `${data.owner.name}${has(data.owner.representative) ? `, por ${data.owner.representative}` : ""}` : fld("owner.name", "Razão social do locador"),
        document: has(data.owner.cnpj) ? `CNPJ nº ${data.owner.cnpj}` : fld("owner.cnpj", "CNPJ do locador"),
    });
    if (data.agency) {
        out.push({
            role: "ADMINISTRADORA",
            name: `${data.agency.name}${has(data.agency.representative) ? `, por ${data.agency.representative}` : ""}`,
            document: has(data.agency.cnpj) ? `CNPJ nº ${data.agency.cnpj}` : fld("agency.cnpj", "CNPJ da administradora"),
        });
    }
    data.tenants.forEach((t, i) => {
        out.push({
            role: data.tenants.length > 1 ? `LOCATÁRIO ${i + 1}` : "LOCATÁRIO",
            name: has(t.name) ? t.name : fld(`tenant.${i}.name`, `Nome do locatário ${i + 1}`),
            document: has(t.cpf) ? `CPF nº ${t.cpf}` : fld(`tenant.${i}.cpf`, `CPF do locatário ${i + 1}`),
        });
    });
    if (options.guarantee === "FIANCA") {
        out.push({ role: "FIADOR", name: fld("guarantor.name", "Nome do fiador"), document: fld("guarantor.cpf", "CPF do fiador") });
        if (options.guarantorSpouse) {
            out.push({ role: "CÔNJUGE DO FIADOR (ANUENTE)", name: fld("guarantor.spouse", "Nome do cônjuge do fiador"), document: fld("guarantor.spouseCpf", "CPF do cônjuge do fiador") });
        }
    }
    if (options.witnesses) {
        for (const n of [1, 2]) out.push({ role: `TESTEMUNHA ${n}`, name: fld(`witness.${n}.name`, `Nome da testemunha ${n}`), document: fld(`witness.${n}.cpf`, `CPF da testemunha ${n}`) });
    }
    return out;
}

// ── Charges: who pays what, and how ───────────────────────────────────

interface ChargePlan {
    /** utilities the tenant pays to the provider, in their own name */
    direct: string[];
    /** fixed amounts paid with the rent */
    withRent: ContractCharge[];
    /** paid by the tenant straight to a third party (a condominium's administration…) */
    thirdParty: ContractCharge[];
    /** inside the rent */
    included: string[];
    /** inside the condominium fee */
    inCondo: string[];
    /** the landlord's */
    landlord: string[];
    /** IPTU: who and how */
    iptu: { who: "TENANT_DIRECT" | "TENANT_WITH_RENT" | "LANDLORD" | "INCLUDED" | "IN_CONDO"; amount: number | null };
    /** the condominium the landlord runs in their own multi-unit building, paid with the rent */
    ownCondo: ContractCharge | null;
}

function planCharges(data: ContractData): ChargePlan {
    const plan: ChargePlan = { direct: [], withRent: [], thirdParty: [], included: [], inCondo: [], landlord: [], iptu: { who: "TENANT_DIRECT", amount: null }, ownCondo: null };
    const multi = data.property.type === "multi";
    const charges = data.charges.filter(c => c.type !== "IPTU");

    for (const c of charges) {
        const amount = Number(c.amount) || 0;
        const words = chargeWords(c);
        if (c.responsibility === "INCLUDED") plan.included.push(words);
        else if (c.responsibility === "INCLUDED_IN_CONDO") plan.inCondo.push(words);
        else if (c.responsibility === "LANDLORD") plan.landlord.push(words);
        else if (c.collectedBy === "THIRD_PARTY") plan.thirdParty.push(c);
        else if (amount > 0) {
            plan.withRent.push(c);
            if (c.type === "CONDOMINIUM" && multi && !plan.ownCondo) plan.ownCondo = c;
        } else if (UTILITY_WORDS[c.type]) plan.direct.push(UTILITY_WORDS[c.type]!);
        else if (c.type === "CONDOMINIUM") plan.thirdParty.push(c);
    }
    // energy and water nobody mentioned: the tenant's own accounts
    for (const t of ["ELECTRICITY", "WATER"] as const) {
        if (!data.charges.some(c => c.type === t)) plan.direct.push(UTILITY_WORDS[t]!);
    }
    plan.direct = Array.from(new Set(plan.direct));

    const iptu = data.charges.find(c => c.type === "IPTU");
    if (iptu) {
        const amount = Number(iptu.amount) || 0;
        plan.iptu = iptu.responsibility === "LANDLORD" ? { who: "LANDLORD", amount: null }
            : iptu.responsibility === "INCLUDED" ? { who: "INCLUDED", amount: null }
            : iptu.responsibility === "INCLUDED_IN_CONDO" ? { who: "IN_CONDO", amount: null }
            : amount > 0 && iptu.collectedBy !== "THIRD_PARTY" ? { who: "TENANT_WITH_RENT", amount }
            : { who: "TENANT_DIRECT", amount: null };
    } else {
        // a kitnet has no IPTU of its own: the building's is the landlord's unless the lease says otherwise
        plan.iptu = { who: multi || data.iptuPaidBy === "landlord" ? "LANDLORD" : "TENANT_DIRECT", amount: null };
    }
    if (plan.iptu.who === "IN_CONDO") plan.inCondo.push("IPTU");
    if (plan.iptu.who === "INCLUDED") plan.included.push("IPTU");
    return plan;
}

// ── Warnings the side panel shows ─────────────────────────────────────

export interface ContractWarning {
    level: "error" | "warning" | "info";
    text: string;
}

export function contractWarnings(data: ContractData, options: ContractOptions): ContractWarning[] {
    const out: ContractWarning[] = [];
    const months = termMonths(data.lease.start, data.lease.end);
    const rent = Number(data.lease.rent) || 0;
    const deposit = Number(data.lease.deposit) || 0;
    if (months != null && months < 30) {
        out.push({ level: "info", text: `Prazo de ${months} meses: ao fim, o contrato se prorroga sozinho e você só retoma o imóvel nos casos do art. 47. Com 30 meses ou mais, a retomada no fim do prazo não precisa de motivo (art. 46).` });
    }
    if (options.guarantee === "CAUCAO" && rent > 0 && deposit > rent * 3 + 0.005) {
        out.push({ level: "error", text: `A caução de ${formatMoney(deposit)} passa de 3 aluguéis, o limite do art. 38, § 2º. Exigir mais é contravenção penal (art. 43, I).` });
    }
    if (options.guarantee === "CAUCAO" && deposit <= 0) {
        out.push({ level: "warning", text: "Garantia por caução sem valor no contrato: preencha o valor no texto ou no cadastro do contrato." });
    }
    if (data.lease.frequencyMonths != null && data.lease.frequencyMonths > 0 && data.lease.frequencyMonths < 12) {
        out.push({ level: "error", text: `O cadastro diz reajuste a cada ${data.lease.frequencyMonths} meses, mas a lei só admite reajuste anual (Lei nº 10.192/2001): o texto usa 12 meses.` });
    }
    if (options.interestPctMonth > 1) out.push({ level: "error", text: "Juros acima de 1% ao mês com inquilino pessoa física ultrapassam o limite da Lei de Usura." });
    if (options.lateFeePct > 10) out.push({ level: "warning", text: "Multa por atraso acima de 10% costuma ser reduzida pelos tribunais." });
    if (options.earlyExitFineRents > 3) out.push({ level: "warning", text: "Multa por devolução antecipada acima de 3 aluguéis tende a ser reduzida pelo juiz (art. 413 do Código Civil)." });
    const { finePct, interestPctMonth } = data.billing;
    if (finePct != null && Math.abs(finePct - options.lateFeePct) > 0.001) {
        out.push({ level: "warning", text: `As Faturas cobram multa de ${String(finePct).replace(".", ",")}% e o contrato diz ${String(options.lateFeePct).replace(".", ",")}%: deixe os dois iguais.` });
    }
    if (interestPctMonth != null && Math.abs(interestPctMonth - options.interestPctMonth) > 0.001) {
        out.push({ level: "warning", text: `As Faturas cobram juros de ${String(interestPctMonth).replace(".", ",")}% ao mês e o contrato diz ${String(options.interestPctMonth).replace(".", ",")}%: deixe os dois iguais.` });
    }
    if (options.payment === "PIX" && !has(options.pixKey)) out.push({ level: "warning", text: "Pagamento por PIX: informe a chave PIX do locador." });
    return out;
}

// ── The contract ──────────────────────────────────────────────────────

class Writer {
    readonly nodes: PMNode[] = [];
    private clause = 0;
    private item = 0;
    private letter = 0;
    private section = 0;

    constructor(private readonly numbers: Map<ClauseKey, number>) {}

    /** "Cláusula 4ª" */
    ref(key: ClauseKey): string {
        return `Cláusula ${this.numbers.get(key) ?? "?"}ª`;
    }
    title(text: string) {
        this.nodes.push(heading(1, [upper(text)]));
    }
    part(text: string) {
        this.nodes.push(heading(2, [text], "left"));
    }
    openSection(title: string) {
        this.section++;
        this.nodes.push(heading(2, [`${ROMAN[this.section] ?? this.section} – ${title}`], "left"));
    }
    openClause(key: ClauseKey, title: string) {
        this.clause = this.numbers.get(key) ?? this.clause + 1;
        this.item = 0;
        this.nodes.push(heading(3, [`Cláusula ${this.clause}ª – ${title}`], "left"));
    }
    /** The next numbered item ("4.2."); returns its number */
    p(...inlines: Inline[]): number {
        this.item++;
        this.letter = 0;
        this.nodes.push(paragraph([{ text: `${this.clause}.${this.item}.`, bold: true }, " ", ...inlines]));
        return this.item;
    }
    /** "a) …" under the last item */
    sub(...inlines: Inline[]) {
        const l = LETTERS[this.letter++] ?? "?";
        this.nodes.push(paragraph([`${l}) `, ...inlines], { indent: 1 }));
    }
    text(inlines: Inline[], opts: Parameters<typeof paragraph>[1] = {}) {
        this.nodes.push(paragraph(inlines, opts));
    }
}

export function buildContract(data: ContractData, options: ContractOptions): ContractDoc {
    const L = data.lease;
    const multi = data.property.type === "multi";
    const agency = data.agency;
    const months = termMonths(L.start, L.end);
    const fixedTerm = months != null && months > 0;
    const rent = cents(Number(L.rent) || 0);
    const plan = planCharges(data);
    const signers = contractSigners(data, options);
    const plural = data.tenants.length > 1;
    const toLandlordOrAgency = agency ? "ao LOCADOR ou à ADMINISTRADORA" : "ao LOCADOR";
    const indexCode = L.index && INDEX_NAMES[L.index] ? L.index : null;
    const correctionIndex = indexCode ? INDEX_SHORT[indexCode] : "IPCA";

    // clause numbers first: the text refers forward and back
    const included = new Set<ClauseKey>(SECTIONS.flatMap(s => s.clauses));
    if (!agency) included.delete("administracao");
    if (!fixedTerm) included.delete("devolucao");
    const numbers = new Map<ClauseKey, number>();
    for (const key of SECTIONS.flatMap(s => s.clauses)) if (included.has(key)) numbers.set(key, numbers.size + 1);

    const w = new Writer(numbers);
    const section = (i: number) => w.openSection(SECTIONS[i].title);

    // ── Title and parties
    w.title("Contrato de Locação de Imóvel Residencial");
    w.part("Partes");

    const o = data.owner;
    w.text([
        { text: "LOCADOR: ", bold: true },
        { text: has(o.name) ? o.name : "", bold: true }, has(o.name) ? null : fld("owner.name", "Razão social do locador"),
        ", pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ", fld("owner.cnpj", "CNPJ do locador", o.cnpj),
        ", com sede na ", fld("owner.address", "Endereço da sede do locador", o.address),
        ", neste ato representada, na forma de seu contrato social, por ", fld("owner.representative", "Nome do representante do locador", o.representative),
        ", inscrito(a) no CPF sob o nº ", fld("owner.representativeCpf", "CPF do representante do locador"),
        ", e-mail ", fld("owner.email", "E-mail do locador", o.email),
        ", telefone/WhatsApp ", fld("owner.phone", "Telefone do locador", o.phone), ".",
    ]);

    if (agency) {
        w.text([
            { text: "ADMINISTRADORA: ", bold: true }, { text: agency.name, bold: true },
            ", inscrita no CNPJ sob o nº ", fld("agency.cnpj", "CNPJ da administradora", agency.cnpj),
            has(agency.creci) ? `, CRECI nº ${agency.creci}` : null,
            ", com sede na ", fld("agency.address", "Endereço da administradora", agency.address),
            ", neste ato representada por ", fld("agency.representative", "Representante da administradora", agency.representative),
            ", e-mail ", fld("agency.email", "E-mail da administradora", agency.email),
            ", telefone/WhatsApp ", fld("agency.phone", "Telefone da administradora", agency.phone),
            ", que atua como mandatária do LOCADOR.",
        ]);
    }

    data.tenants.forEach((t, i) => {
        const n = plural ? ` ${i + 1}` : "";
        const who = has(t.name) ? t.name.split(/\s+/)[0] : `locatário${n}`;
        w.text([
            { text: `LOCATÁRIO${n}: `, bold: true },
            has(t.name) ? { text: t.name, bold: true } : fld(`tenant.${i}.name`, `Nome do locatário${n}`),
            ", ", fld(`tenant.${i}.nationality`, `Nacionalidade de ${who}`),
            ", ", fld(`tenant.${i}.maritalStatus`, `Estado civil de ${who}`),
            ", ", fld(`tenant.${i}.occupation`, `Profissão de ${who}`, t.occupation),
            ", portador(a) do RG nº ", fld(`tenant.${i}.rg`, `RG de ${who}`, t.rg),
            ", inscrito(a) no CPF sob o nº ", fld(`tenant.${i}.cpf`, `CPF de ${who}`, t.cpf),
            ", com residência atual na ", fld(`tenant.${i}.address`, `Endereço atual de ${who}`, t.address),
            ", e-mail ", fld(`tenant.${i}.email`, `E-mail de ${who}`, t.email),
            ", telefone/WhatsApp ", fld(`tenant.${i}.phone`, `Telefone de ${who}`, t.phone), ".",
        ]);
    });
    if (plural) w.text(["Neste contrato, LOCATÁRIO designa todos os locatários acima, que respondem solidariamente por todas as obrigações nele previstas."]);

    if (options.guarantee === "FIANCA") {
        w.text([
            { text: "FIADOR: ", bold: true }, fld("guarantor.name", "Nome do fiador"),
            ", ", fld("guarantor.nationality", "Nacionalidade do fiador"),
            ", ", fld("guarantor.maritalStatus", "Estado civil do fiador"),
            ", ", fld("guarantor.occupation", "Profissão do fiador"),
            ", portador(a) do RG nº ", fld("guarantor.rg", "RG do fiador"),
            ", inscrito(a) no CPF sob o nº ", fld("guarantor.cpf", "CPF do fiador"),
            ", residente e domiciliado(a) na ", fld("guarantor.address", "Endereço do fiador"),
            ", e-mail ", fld("guarantor.email", "E-mail do fiador"),
            ", telefone/WhatsApp ", fld("guarantor.phone", "Telefone do fiador"),
            options.guarantorSpouse ? ", e seu cônjuge ou companheiro(a), " : null,
            options.guarantorSpouse ? fld("guarantor.spouse", "Nome do cônjuge do fiador") : null,
            options.guarantorSpouse ? ", inscrito(a) no CPF sob o nº " : null,
            options.guarantorSpouse ? fld("guarantor.spouseCpf", "CPF do cônjuge do fiador") : null,
            options.guarantorSpouse ? ", que assina como anuente (art. 1.647, III, do Código Civil)" : null,
            ".",
        ]);
    }

    w.text(["As partes acima qualificadas celebram o presente Contrato de Locação de Imóvel Residencial, regido pela Lei nº 8.245/1991 (Lei do Inquilinato) e, no que couber, pelo Código Civil, mediante as cláusulas e condições a seguir."]);

    // ── I – Objeto e prazo
    section(0);
    w.openClause("objeto", "Do objeto");
    const p = data.property;
    const unitKind = p.unitType ? UNIT_TYPE_WORDS[p.unitType] : undefined;
    const thing = multi && has(p.unitName) ? `a unidade ${p.unitName}${unitKind ? ` (${unitKind})` : ""} do imóvel` : "o imóvel residencial";
    const parking = p.parkingSpaces == null ? null
        : p.parkingSpaces === 0 ? ", sem vaga de garagem"
        : `, com direito ao uso de ${countWithWords(p.parkingSpaces, "f")} ${p.parkingSpaces === 1 ? "vaga" : "vagas"} de garagem`;
    w.p(
        "O LOCADOR dá em locação ao LOCATÁRIO, para fins exclusivamente residenciais, ", thing, " situado na ",
        fld("property.address", "Endereço completo do imóvel", p.address),
        ", objeto da matrícula nº ", fld("property.matricula", "Matrícula do imóvel", p.matricula),
        " do Registro de Imóveis competente, inscrição imobiliária (IPTU) nº ", fld("property.inscricao", "Inscrição imobiliária", p.inscricao),
        parking, ", entregue ", options.furnished ? "mobiliado, conforme o inventário do Anexo II" : "sem mobília", ".",
    );
    w.p(`O estado do imóvel, de suas instalações${options.furnished ? ", acessórios e mobília" : " e acessórios"} está descrito no Laudo de Vistoria Inicial, com registro fotográfico (Anexo I), assinado pelas partes, que integra este contrato.`);

    w.openClause("prazo", "Do prazo");
    if (fixedTerm) {
        const long = months! >= 30;
        w.p(
            `A locação vigorará pelo prazo de ${countWithWords(months!)} meses, com início em ${br(L.start)} e término em ${br(L.end!)}`,
            long ? ", data em que o LOCATÁRIO restituirá o imóvel livre e desocupado, independentemente de notificação ou aviso (art. 46 da Lei nº 8.245/1991)." : ".",
        );
        if (long) {
            w.p("Se, findo o prazo, o LOCATÁRIO permanecer no imóvel por mais de 30 (trinta) dias sem oposição do LOCADOR, a locação ficará prorrogada por prazo indeterminado, mantidas as demais cláusulas, e o LOCADOR poderá denunciá-la a qualquer tempo, concedendo 30 (trinta) dias para a desocupação (art. 46, §§ 1º e 2º).");
        } else {
            w.p("Findo o prazo, a locação prorroga-se automaticamente por prazo indeterminado, mantidas as demais cláusulas, e o LOCADOR somente poderá retomar o imóvel nas hipóteses do art. 47 da Lei nº 8.245/1991.");
        }
        w.p("Na locação prorrogada por prazo indeterminado, o LOCATÁRIO poderá denunciá-la mediante aviso escrito com 30 (trinta) dias de antecedência; na falta do aviso, o LOCADOR poderá exigir quantia correspondente a 1 (um) mês de aluguel e encargos vigentes à época (art. 6º).");
        w.p(`Durante o prazo determinado, o LOCADOR não poderá reaver o imóvel, salvo nas hipóteses do art. 9º da Lei nº 8.245/1991. A devolução antecipada pelo LOCATÁRIO segue a ${w.ref("devolucao")}.`);
    } else {
        w.p(`A locação é por prazo indeterminado, com início em ${br(L.start)}.`);
        w.p("O LOCATÁRIO poderá denunciá-la mediante aviso escrito com 30 (trinta) dias de antecedência; na falta do aviso, o LOCADOR poderá exigir quantia correspondente a 1 (um) mês de aluguel e encargos vigentes à época (art. 6º).");
        w.p("O LOCADOR poderá retomar o imóvel nas hipóteses do art. 47 da Lei nº 8.245/1991.");
    }

    // ── II – Aluguel, reajuste e encargos
    section(1);
    w.openClause("aluguel", "Do aluguel");
    w.p("O aluguel mensal, livremente convencionado, é de ", rent > 0 ? moneyWithWords(rent) : fld("lease.rent", "Valor do aluguel"), ".");
    const dueDay = Math.min(31, Math.max(1, Math.round(L.dueDay) || 10));
    w.p(`O aluguel é pago após o mês de uso: até o dia ${countWithWords(dueDay)} de cada mês, o LOCATÁRIO paga o mês de locação vencido, isto é, o período que termina na véspera desse dia. O vencimento que cair em sábado, domingo ou feriado fica prorrogado para o primeiro dia útil seguinte.`);
    const first = paymentSchedule(L.start, L.end ?? addMonths(L.start, 24), dueDay)[0];
    if (first) {
        if (first.fraction < 0.999 && rent > 0) {
            const prorata = cents(rent * first.fraction);
            const fixed = plan.withRent.length > 0;
            w.p(`O primeiro pagamento, com vencimento em ${br(first.due)}, será proporcional ao período de ${br(L.start)} a ${br(dayBefore(first.due))}, no valor de ${moneyWithWords(prorata)}${fixed ? ", acrescido dos encargos fixos mensais na mesma proporção" : ""}.`);
        } else {
            w.p(`O primeiro pagamento vence em ${br(first.due)}.`);
        }
    }
    if (agency) {
        w.p("Os pagamentos serão feitos à ADMINISTRADORA, por boleto bancário, PIX ou outro meio que ela indicar por escrito.");
    } else if (options.payment === "PIX") {
        w.p("Os pagamentos serão feitos por PIX para a chave ", fld("options.pixKey", "Chave PIX do locador", options.pixKey), ", de titularidade do LOCADOR.");
    } else {
        w.p("Os pagamentos serão feitos por boleto bancário com PIX, emitido pelo LOCADOR e enviado ao e-mail do LOCATÁRIO indicado neste contrato com pelo menos 5 (cinco) dias de antecedência do vencimento. Se a cobrança não chegar, o LOCATÁRIO a pedirá ao LOCADOR antes do vencimento, que não se altera.");
    }
    w.p(`O comprovante bancário servirá como recibo, e ${agency ? "o LOCADOR ou a ADMINISTRADORA" : "o LOCADOR"} fornecerá recibo discriminado sempre que solicitado (art. 22, VI). Pagamentos feitos de outra forma, ou a terceiros não autorizados por escrito, não terão efeito de quitação.`);

    w.openClause("reajuste", "Do reajuste");
    if (L.index === "NONE") {
        w.p("O aluguel não será reajustado durante a locação, sem prejuízo da livre negociação de novo valor (art. 18) e da ação revisional (art. 19 da Lei nº 8.245/1991).");
    } else {
        const freq = Math.max(12, Math.round(L.frequencyMonths ?? 12) || 12);
        const indexName: Inline = indexCode ? INDEX_NAMES[indexCode] : fld("lease.index", "Índice de reajuste");
        const fallback = indexCode === "IPCA" ? INDEX_NAMES.INPC : INDEX_NAMES.IPCA;
        w.p(`O aluguel será reajustado a cada ${countWithWords(freq)} meses, contados da data de início da locação, pela variação acumulada do `, indexName, ` nos ${countWithWords(freq)} meses anteriores, considerado o último índice divulgado.`);
        w.p("Se a variação acumulada for negativa, o aluguel permanecerá inalterado naquele período.");
        w.p(`Extinto o índice, adotar-se-á o índice oficial que o substituir; na sua falta, o ${fallback}.`);
        w.p("O reajuste é automático e independe de aditivo; o novo valor constará da cobrança do mês em que passar a vigorar, com a indicação do índice aplicado.");
        w.p("As partes podem, de comum acordo e a qualquer tempo, fixar novo valor de aluguel ou modificar a cláusula de reajuste (art. 18), sem prejuízo da ação revisional prevista no art. 19 da Lei nº 8.245/1991.");
    }

    w.openClause("encargos", "Dos encargos da locação");
    w.p("Além do aluguel, cabem ao LOCATÁRIO, da entrega das chaves até a sua devolução:");
    const subs: Inline[][] = [];
    if (plan.direct.length) {
        subs.push([`o consumo de ${listPt(plan.direct)} das ligações individuais do imóvel, cujas contas transferirá para o seu nome em até 30 (trinta) dias da entrega das chaves, e os serviços de internet, TV e telefone que contratar (art. 23, VIII)`]);
    } else {
        subs.push(["os serviços de internet, TV e telefone que contratar (art. 23, VIII)"]);
    }
    for (const c of plan.withRent) {
        const amount = formatMoney(Number(c.amount) || 0);
        if (c === plan.ownCondo) subs.push([`a taxa de condomínio de ${amount} mensais, paga junto com o aluguel, nos termos do item seguinte`]);
        else if (c.type === "CONDOMINIUM") subs.push([`as despesas ordinárias de condomínio, hoje de ${amount} mensais, pagas junto com o aluguel (arts. 23, XII, e 25)`]);
        else subs.push([`${chargeWords(c)}: valor fixo de ${amount} mensais, pago junto com o aluguel, cuja conta permanece em nome do LOCADOR`]);
    }
    for (const c of plan.thirdParty) {
        if (c.type === "CONDOMINIUM") subs.push(["as despesas ordinárias de condomínio, pagas diretamente à administração do condomínio (art. 23, XII)"]);
        else subs.push([`${chargeWords(c)}, pago diretamente ao respectivo fornecedor`]);
    }
    if (plan.iptu.who === "TENANT_WITH_RENT") {
        subs.push([`a parcela mensal do IPTU e das taxas municipais incidentes sobre o imóvel, hoje de ${formatMoney(plan.iptu.amount!)}, paga junto com o aluguel (art. 25), cuja responsabilidade é expressamente transferida ao LOCATÁRIO (art. 22, VIII)`]);
    } else if (plan.iptu.who === "TENANT_DIRECT") {
        subs.push(["o IPTU e as taxas municipais incidentes sobre o imóvel, pagos diretamente nos respectivos vencimentos, cuja responsabilidade é expressamente transferida ao LOCATÁRIO (art. 22, VIII)"]);
    }
    if (options.fireInsurance === "TENANT") subs.push([`o prêmio do seguro contra incêndio previsto na ${w.ref("seguro")}`]);
    subs.forEach((s, i) => w.sub(...s, i === subs.length - 1 ? "." : ";"));

    if (plan.ownCondo) {
        const inside = [...plan.inCondo, "limpeza e manutenção das áreas comuns"];
        w.p(
            `A taxa de condomínio corresponde ao rateio das despesas comuns do imóvel, como ${listPt(inside)}, cujas contas permanecem em nome do LOCADOR. Será revista a cada 12 (doze) meses, para mais ou para menos, conforme as despesas efetivamente verificadas no período, mediante demonstrativo entregue ao LOCATÁRIO; não havendo revisão, será corrigida `,
            plan.ownCondo.adjustsWithRent || L.index === "NONE" ? "na data e pelo índice de reajuste do aluguel" : `pelo índice da ${w.ref("reajuste")}`,
            ". Tem natureza de encargo da locação e seu atraso sujeita-se às mesmas penalidades do aluguel.",
        );
    }
    const otherFixed = plan.withRent.filter(c => c !== plan.ownCondo);
    if (otherFixed.length) {
        w.p(`Os valores fixos de encargos pagos junto com o aluguel serão revistos a cada 12 (doze) meses conforme a despesa efetivamente verificada, mediante demonstrativo, ou, não havendo revisão, corrigidos pelo índice da ${w.ref("reajuste")}; têm natureza de encargo da locação.`);
    }
    if (plan.included.length) w.p(`Estão incluídos no valor do aluguel, sem cobrança à parte: ${listPt(plan.included)}.`);
    const landlordOwn = [plan.iptu.who === "LANDLORD" ? "o IPTU e as taxas municipais do imóvel" : null, ...plan.landlord].filter((x): x is string => !!x);
    w.p(`Cabem exclusivamente ao LOCADOR ${landlordOwn.length ? `${listPt(landlordOwn)}, ` : ""}as despesas extraordinárias de condomínio (art. 22, X) e as taxas de administração imobiliária e de intermediação (art. 22, VII), que nunca serão cobradas do LOCATÁRIO.`);
    w.p(`O LOCATÁRIO apresentará os comprovantes de pagamento dos encargos a seu cargo sempre que solicitado ${agency ? "pelo LOCADOR ou pela ADMINISTRADORA" : "pelo LOCADOR"}, por e-mail ou WhatsApp. Multas e juros por atraso nesses pagamentos correm por sua conta; se o LOCADOR pagar algum desses encargos para evitar prejuízo, o valor será reembolsado com o aluguel seguinte, corrigido pelo ${correctionIndex}.`);

    w.openClause("atraso", "Do atraso no pagamento");
    w.p(`O pagamento do aluguel ou de encargos após o vencimento será acrescido de multa moratória de ${percentWithWords(options.lateFeePct)} sobre o valor em atraso, juros de mora de ${percentWithWords(options.interestPctMonth)} ao mês, calculados pro rata die, e correção monetária pelo ${correctionIndex} desde o vencimento.`);
    if (options.collectionFeePct > 0) {
        w.p(`Após 30 (trinta) dias de atraso, o débito poderá ser encaminhado a advogado para cobrança, hipótese em que o LOCATÁRIO arcará também com honorários de ${percentWithWords(options.collectionFeePct)} sobre o débito na fase extrajudicial; na cobrança judicial, prevalecem as custas e os honorários fixados pelo juiz.`);
    }
    w.p("Após prévia notificação ao LOCATÁRIO, o débito poderá ser levado a protesto e incluído em cadastros de proteção ao crédito.");
    w.p("A falta de pagamento do aluguel ou de encargos autoriza o LOCADOR a propor ação de despejo, cumulada ou não com a cobrança dos valores devidos (arts. 9º, III, e 62 da Lei nº 8.245/1991).");
    w.p("O recebimento de valores em atraso, ou de forma diversa da pactuada, não implica novação nem renúncia a direitos do LOCADOR.");

    // ── III – Garantia e seguro
    section(2);
    w.openClause("garantia", "Da garantia");
    const guarantee = options.guarantee;
    if (guarantee === "NENHUMA") {
        w.p("A presente locação não conta com nenhuma das garantias do art. 37 da Lei nº 8.245/1991.");
        w.p("Por não haver garantia, na falta de pagamento do aluguel e dos encargos no vencimento o LOCADOR poderá requerer, na ação de despejo, liminar para desocupação do imóvel em 15 (quinze) dias (art. 59, § 1º, IX, da Lei nº 8.245/1991).");
    } else {
        w.p("A locação é garantida por uma única modalidade de garantia, vedada mais de uma no mesmo contrato (art. 37, parágrafo único), e a garantia vigora até a efetiva devolução do imóvel, inclusive na prorrogação por prazo indeterminado (art. 39).");
        if (guarantee === "CAUCAO") {
            const deposit = cents(Number(L.deposit) || 0);
            const depositMonths = L.depositMonths && L.depositMonths > 0 ? L.depositMonths
                : rent > 0 && deposit > 0 && Math.abs(deposit / rent - Math.round(deposit / rent)) < 0.01 ? Math.round(deposit / rent) : null;
            const keeper = agency ? "a ADMINISTRADORA" : "o LOCADOR";
            w.p(
                "O LOCATÁRIO entrega, na assinatura deste contrato, caução em dinheiro de ",
                deposit > 0 ? moneyWithWords(deposit) : fld("lease.deposit", "Valor da caução"),
                depositMonths ? `, equivalente a ${countWithWords(depositMonths)} ${depositMonths === 1 ? "aluguel" : "aluguéis"}` : null,
                `, que ${keeper} depositará em até 5 (cinco) dias úteis em caderneta de poupança, revertendo os rendimentos ao LOCATÁRIO na devolução (art. 38, § 2º).`,
            );
            w.p("Encerrada a locação, feita a vistoria final e devolvidas as chaves, a caução será restituída com seus rendimentos em até 30 (trinta) dias, deduzidos os débitos e os custos de reparo apurados, demonstrados por orçamento ou nota fiscal. Se a caução não bastar, o LOCATÁRIO pagará a diferença.");
            w.p("A caução não poderá ser usada pelo LOCATÁRIO para pagar aluguéis ou encargos, salvo concordância escrita do LOCADOR.");
        } else if (guarantee === "FIANCA") {
            w.p(`O FIADOR${options.guarantorSpouse ? ", com a anuência de seu cônjuge ou companheiro(a)," : ""} obriga-se como principal pagador e devedor solidário com o LOCATÁRIO por todas as obrigações deste contrato, inclusive aluguéis, encargos, multas, reparos de danos, custas e honorários, renunciando ao benefício de ordem (arts. 827 e 828, I e II, do Código Civil).`);
            w.p("A fiança abrange os reajustes previstos neste contrato. Prorrogada a locação por prazo indeterminado, o FIADOR poderá exonerar-se mediante notificação ao LOCADOR, ficando obrigado por todos os efeitos da fiança durante 120 (cento e vinte) dias após a notificação (art. 40, X).");
            w.p("O FIADOR declara ciência de que o imóvel residencial de sua propriedade, ainda que bem de família, pode ser penhorado por dívida decorrente desta fiança (art. 3º, VII, da Lei nº 8.009/1990).");
            w.p("Ocorrendo qualquer das hipóteses do art. 40 da Lei nº 8.245/1991, como morte, ausência, interdição, recuperação judicial, falência ou insolvência do fiador, alienação ou oneração de todos os seus bens imóveis, mudança de residência sem comunicação ao LOCADOR ou exoneração, o LOCATÁRIO comunicará o fato em até 15 (quinze) dias e apresentará novo fiador idôneo, a critério do LOCADOR, ou outra garantia admitida em lei, em até 30 (trinta) dias da notificação do LOCADOR, sob pena de desfazimento da locação (art. 40, parágrafo único).");
        } else {
            w.p(
                "O LOCATÁRIO contratará e manterá, às suas expensas, seguro-fiança locatícia na seguradora ", fld("guarantee.insurer", "Seguradora do seguro-fiança"),
                ", apólice nº ", fld("guarantee.policy", "Número da apólice do seguro-fiança"),
                ", tendo o LOCADOR como beneficiário, com cobertura de aluguéis, encargos, danos ao imóvel e multa rescisória durante todo o prazo da locação e suas prorrogações (arts. 23, XI, e 41).",
            );
            w.p("O LOCATÁRIO comprovará cada renovação da apólice com pelo menos 30 (trinta) dias de antecedência do seu vencimento. A falta de renovação autoriza o LOCADOR a exigir nova garantia em 30 (trinta) dias, sob pena de desfazimento da locação (art. 40, parágrafo único).");
        }
    }

    w.openClause("seguro", "Do seguro contra incêndio");
    if (options.fireInsurance === "TENANT") {
        w.p("O LOCATÁRIO contratará e manterá, às suas expensas, durante toda a locação e suas prorrogações, seguro do imóvel contra incêndio, raio e explosão, em seguradora idônea, tendo o LOCADOR como beneficiário e importância segurada compatível com o valor de reconstrução do imóvel indicado pelo LOCADOR, ficando expressamente transferido ao LOCATÁRIO o pagamento do prêmio (art. 22, VIII).");
        w.p(`A apólice será entregue ${toLandlordOrAgency} em até 15 (quinze) dias da assinatura e a cada renovação. Se o LOCATÁRIO não o fizer, o LOCADOR poderá contratar o seguro e cobrar o prêmio junto com o aluguel seguinte.`);
    } else {
        w.p("O LOCADOR manterá o imóvel segurado contra incêndio, às suas expensas (art. 22, VIII).");
    }
    w.p("Esse seguro não cobre os bens do LOCATÁRIO, que poderá contratar seguro próprio para eles. O LOCADOR não responde por furto, roubo ou dano aos bens do LOCATÁRIO, de seus dependentes ou visitantes, salvo se causado por culpa sua.");
    w.p("Se um sinistro tornar o imóvel inutilizável, a locação será extinta de pleno direito, sem multa para qualquer das partes, respondendo o LOCATÁRIO pelos danos a que tiver dado causa por culpa ou dolo.");

    // ── IV – Uso, conservação e benfeitorias
    section(3);
    w.openClause("uso", "Do uso e da ocupação");
    const occupants = data.occupants.filter(has);
    w.p(
        "O imóvel destina-se exclusivamente à residência do LOCATÁRIO",
        occupants.length ? ` e das pessoas que com ele residirem: ${listPt(occupants)}` : "",
        options.maxOccupants ? `, com no máximo ${countWithWords(options.maxOccupants, "f")} ${options.maxOccupants === 1 ? "pessoa" : "pessoas"}` : "",
        ". É vedado alterar essa destinação, inclusive para uso comercial, hospedagem ou locação por temporada, por aplicativo ou não.",
    );
    w.p("É vedado sublocar, ceder ou emprestar o imóvel, no todo ou em parte, sem consentimento prévio e escrito do LOCADOR (art. 13).");
    w.p(`O LOCATÁRIO cumprirá ${multi ? "o regulamento interno do imóvel e " : ""}a convenção e o regimento interno do condomínio, se houver (art. 23, X), e as normas de vizinhança, sossego e segurança. Multas aplicadas ao LOCADOR por conduta do LOCATÁRIO, de seus dependentes ou visitantes serão reembolsadas pelo LOCATÁRIO.`);
    w.p(
        options.pets === "NONE" ? "Não é permitida a permanência de animais de estimação no imóvel, salvo autorização escrita do LOCADOR."
            : `É permitida a permanência de animais de estimação${options.pets === "SMALL" ? " de pequeno porte" : ""}, observadas as normas do condomínio, respondendo o LOCATÁRIO por danos, ruídos e higiene.`,
    );

    w.openClause("conservacao", "Da conservação, dos reparos e das vistorias");
    w.p("O LOCATÁRIO declara ter visitado o imóvel e recebê-lo no estado descrito no Laudo de Vistoria Inicial, podendo apontar por escrito divergências ou defeitos não registrados em até 7 (sete) dias da entrega das chaves. Sem apontamento nesse prazo, o laudo será tido por aceito.");
    w.p("Cabe ao LOCATÁRIO:");
    w.sub("conservar o imóvel como se seu fosse e mantê-lo limpo (art. 23, II);");
    w.sub("arcar com os pequenos reparos decorrentes do uso, como troca de lâmpadas e resistências de chuveiro, reparos de torneiras, sifões, tomadas, interruptores, fechaduras e vidros quebrados, e com a limpeza de calhas, ralos e caixas de gordura quando necessária;");
    w.sub("reparar os danos causados por si, por seus dependentes, visitantes ou animais (art. 23, V);");
    w.sub("comunicar imediatamente ao LOCADOR qualquer dano ou defeito cuja reparação caiba a este, bem como turbações de terceiros (art. 23, IV);");
    w.sub("não realizar obras, trocar pisos ou revestimentos, nem pintar em cores diferentes sem autorização escrita do LOCADOR (art. 23, VI). Furos para fixação de objetos são permitidos e devem ser fechados e retocados na devolução, exceto em azulejos, porcelanatos e pisos, que dependem de autorização.");
    w.p("Cabem ao LOCADOR os reparos estruturais, de telhado e de instalações embutidas, salvo dano causado pelo LOCATÁRIO, e os vícios ou defeitos anteriores à locação (art. 22, III e IV). O LOCATÁRIO permitirá os reparos urgentes; se durarem mais de 10 (dez) dias, terá abatimento proporcional do aluguel e, se durarem mais de 30 (trinta) dias, poderá resilir o contrato (art. 26).");
    w.p(`${agency ? "O LOCADOR ou a ADMINISTRADORA" : "O LOCADOR"} poderá vistoriar o imóvel mediante aviso com pelo menos 48 (quarenta e oito) horas de antecedência, em dia e hora combinados (art. 23, IX). Constatado dano a cargo do LOCATÁRIO, este o reparará em até 15 (quinze) dias da notificação; não o fazendo, o LOCADOR poderá executar o reparo e cobrar o custo comprovado com o aluguel seguinte.`);

    w.openClause("benfeitorias", "Das benfeitorias");
    w.p("Qualquer benfeitoria, obra ou modificação no imóvel depende de autorização prévia e escrita do LOCADOR, observadas as exigências do Município e do condomínio.");
    w.p("Benfeitorias necessárias: o LOCATÁRIO comunicará a necessidade ao LOCADOR, que providenciará o reparo em prazo razoável. Em caso de urgência, se o LOCADOR não iniciar o reparo em até 5 (cinco) dias da comunicação, o LOCATÁRIO poderá executá-lo e será reembolsado do custo comprovado por nota fiscal ou recibo, compensável no aluguel seguinte. Benfeitorias necessárias feitas sem essa comunicação não serão indenizadas nem darão direito de retenção.");
    w.p("Benfeitorias úteis e voluptuárias, ainda que autorizadas, incorporam-se ao imóvel sem direito a indenização ou retenção, salvo ajuste diferente na própria autorização escrita (art. 35 da Lei nº 8.245/1991 e Súmula 335 do STJ). As voluptuárias poderão ser retiradas ao final, desde que sem dano ao imóvel (art. 36).");
    w.p("Modificações feitas sem autorização poderão, a critério do LOCADOR, permanecer no imóvel sem indenização ou ser desfeitas pelo LOCATÁRIO, à sua custa, antes da devolução.");

    // ── V – Extinção
    section(4);
    if (fixedTerm) {
        const T = months!;
        const F = options.earlyExitFineRents;
        const notice = countWithWords(options.noticeDays);
        w.openClause("devolucao", "Da devolução antecipada");
        if (F > 0) {
            w.p(`O LOCATÁRIO poderá devolver o imóvel antes do término do prazo, mediante aviso escrito com ${notice} dias de antecedência, pagando multa compensatória equivalente a ${countWithWords(F)} ${F === 1 ? "aluguel vigente" : "aluguéis vigentes"}, reduzida proporcionalmente ao período que faltar para o término do contrato (art. 4º da Lei nº 8.245/1991 e art. 413 do Código Civil).`);
            const done = Math.max(1, Math.min(T - 1, Math.round(T / 3)));
            const example = rent > 0 ? cents(F * rent * (T - done) / T) : null;
            w.p(
                `A multa será calculada assim: ${F} × aluguel vigente × (meses que faltam ÷ ${T} meses do prazo).`,
                example != null ? ` Exemplo: com o aluguel de ${formatMoney(rent)} e a devolução após ${done} ${done === 1 ? "mês" : "meses"}, a multa é de ${F} × ${formatMoney(rent)} × (${T - done} ÷ ${T}) = ${formatMoney(example)}.` : "",
            );
            if (options.fineWaivedAfterMonths > 0 && options.fineWaivedAfterMonths < T) {
                w.p(`Decorridos ${countWithWords(options.fineWaivedAfterMonths)} meses de locação, o LOCATÁRIO ficará isento da multa, desde que cumpra o aviso prévio de ${notice} dias.`);
            }
        } else {
            w.p(`O LOCATÁRIO poderá devolver o imóvel antes do término do prazo, sem multa, mediante aviso escrito com ${notice} dias de antecedência.`);
        }
        w.p(`Sem o aviso prévio, o LOCATÁRIO pagará${F > 0 ? ", além da multa eventualmente devida," : ""} o aluguel e os encargos correspondentes aos dias de aviso que faltarem.`);
        w.p("O LOCATÁRIO ficará dispensado da multa se a devolução decorrer de transferência, pelo seu empregador, para prestar serviços em localidade diversa, desde que notifique o LOCADOR por escrito com pelo menos 30 (trinta) dias de antecedência (art. 4º, parágrafo único).");
    }

    w.openClause("rescisao", "Da rescisão e das penalidades");
    w.p("A locação poderá ser desfeita nas hipóteses do art. 9º da Lei nº 8.245/1991: mútuo acordo; infração legal ou contratual; falta de pagamento do aluguel e encargos; ou reparações urgentes determinadas pelo Poder Público que não possam ser executadas com o LOCATÁRIO no imóvel, ou que ele se recuse a consentir.");
    w.p("A parte que infringir qualquer cláusula deste contrato pagará à outra multa de 3 (três) aluguéis vigentes, que poderá ser reduzida equitativamente conforme a gravidade da infração e a parte já cumprida do contrato (art. 413 do Código Civil), sem prejuízo de indenização suplementar comprovada (art. 416, parágrafo único, do Código Civil).");
    w.p(`A multa do item anterior não se aplica ao atraso no pagamento, que tem penalidade própria (${w.ref("atraso")})${fixedTerm ? `, nem à devolução antecipada (${w.ref("devolucao")})` : ""}, e não se acumula com elas pelo mesmo fato.`);

    w.openClause("restituicao", "Da restituição do imóvel e da entrega das chaves");
    w.p("Findo ou desfeito o contrato, o LOCATÁRIO restituirá o imóvel no estado descrito no Laudo de Vistoria Inicial, salvo as deteriorações decorrentes do uso normal (art. 23, III), limpo e com todas as chaves, controles e acessórios.");
    w.p("Se o Laudo de Vistoria Inicial registrar pintura nova, o LOCATÁRIO devolverá o imóvel pintado nas mesmas cores e com tinta de qualidade equivalente, escolhendo livremente o profissional, ou pagará o valor do serviço pelo menor de 2 (dois) orçamentos apresentados pelo LOCADOR.");
    w.p("A vistoria final será agendada com pelo menos 48 (quarenta e oito) horas de antecedência e feita na presença do LOCATÁRIO ou de seu representante. Se ele não comparecer nem justificar a ausência em 24 (vinte e quatro) horas, a vistoria será feita com registro fotográfico e o laudo lhe será enviado, podendo ser impugnado em até 5 (cinco) dias.");
    w.p("Na entrega das chaves, o LOCATÁRIO apresentará a quitação do consumo final das contas em seu nome, com o pedido de encerramento ou de troca de titularidade, e dos encargos proporcionais ao período da locação, e informará seu novo endereço.");
    w.p(`O aluguel e os encargos são devidos até a efetiva devolução das chaves, formalizada em termo de entrega assinado ${agency ? "pelo LOCADOR ou pela ADMINISTRADORA" : "pelo LOCADOR"}. O recebimento das chaves não implica quitação: débitos e danos apurados na vistoria final constarão do termo como ressalva e continuarão exigíveis.`);
    w.p("Apurados danos a cargo do LOCATÁRIO, o LOCADOR apresentará orçamento, e o LOCATÁRIO poderá, em até 10 (dez) dias, executar os reparos por conta própria ou pagar o valor orçado. Se os reparos impedirem nova locação, o LOCATÁRIO pagará também o aluguel proporcional ao período razoável de sua execução, limitado a 30 (trinta) dias.");

    // ── VI – Disposições finais
    section(5);
    w.openClause("venda", "Da venda do imóvel e do direito de preferência");
    w.p("Em caso de venda, promessa de venda, cessão ou promessa de cessão de direitos ou dação em pagamento, o LOCATÁRIO terá preferência para adquirir o imóvel em igualdade de condições com terceiros. O LOCADOR comunicará por escrito todas as condições do negócio, inclusive preço, forma de pagamento, ônus reais e local e horário para exame da documentação, e o LOCATÁRIO deverá aceitar integralmente a proposta em até 30 (trinta) dias, sob pena de caducidade do direito (arts. 27 e 28).");
    w.p("O direito de preferência não alcança a venda por decisão judicial, a permuta, a doação, a integralização de capital, a cisão, a fusão e a incorporação (art. 32).");
    w.p(options.saleClause === "KEEP"
        ? "Alienado o imóvel durante o prazo determinado, a locação continuará em vigor perante o adquirente, podendo qualquer das partes averbar este contrato na matrícula do imóvel (art. 8º)."
        : "Alienado o imóvel, o adquirente poderá denunciar a locação, concedendo 90 (noventa) dias para a desocupação, desde que o faça em até 90 (noventa) dias do registro da venda (art. 8º).");
    w.p(`Enquanto o imóvel estiver à venda, o LOCATÁRIO permitirá visitas de interessados em dias e horários combinados, com aviso de pelo menos 48 (quarenta e oito) horas (art. 23, IX). Nos 30 (trinta) dias que antecederem o fim da locação, ou depois do aviso de desocupação, permitirá também, nas mesmas condições, visitas de interessados em alugá-lo.`);

    if (agency) {
        w.openClause("administracao", "Da administração");
        w.p("O LOCADOR outorga à ADMINISTRADORA poderes para receber aluguéis e encargos, dar quitação, emitir boletos, notificar o LOCATÁRIO, realizar e assinar vistorias e termos de entrega de chaves e promover cobranças extrajudiciais em seu nome.");
        w.p("A remuneração da ADMINISTRADORA é ajustada em contrato próprio com o LOCADOR e paga exclusivamente por ele (art. 22, VII).");
    }

    w.openClause("comunicacoes", "Das comunicações");
    w.p("As comunicações entre as partes serão feitas por escrito e valerão quando enviadas aos e-mails ou números de WhatsApp indicados na qualificação, com registro de envio, ou por carta com aviso de recebimento aos endereços ali indicados (para o LOCATÁRIO, o do imóvel locado). As partes manterão esses contatos atualizados, informando qualquer alteração em até 5 (cinco) dias.");
    w.p(`O LOCATÁRIO${options.guarantee === "FIANCA" ? " e o FIADOR autorizam" : " autoriza"} que citações, intimações e notificações relativas a esta locação sejam feitas por correspondência com aviso de recebimento (art. 58, IV, da Lei nº 8.245/1991).`);
    w.p(`O LOCATÁRIO entregará ${toLandlordOrAgency}, em até 5 (cinco) dias do recebimento, guias de tributos, cobranças condominiais, intimações, multas e exigências de autoridades públicas relativas ao imóvel, ainda que dirigidas a ele (art. 23, VII), respondendo por multas e acréscimos decorrentes do atraso.`);

    w.openClause("dados", "Da proteção de dados pessoais");
    w.p(`Os dados pessoais das partes serão tratados exclusivamente para a celebração e a execução deste contrato, a cobrança de valores devidos, o cumprimento de obrigações legais e o exercício regular de direitos, nos termos da Lei nº 13.709/2018 (LGPD). Poderão ser compartilhados apenas com ${agency ? "a ADMINISTRADORA, " : ""}os prestadores de serviço do LOCADOR para a gestão e a cobrança da locação, seguradoras, cartórios, órgãos de proteção ao crédito e autoridades, quando necessário a essas finalidades, e serão mantidos pelo prazo exigido em lei.`);

    w.openClause("gerais", "Disposições gerais");
    w.p("A tolerância de qualquer das partes quanto ao descumprimento de cláusula não implica novação, renúncia ou alteração do contrato.");
    w.p(`Este contrato obriga as partes, seus herdeiros e sucessores. Em caso de morte do LOCATÁRIO, ou de separação, divórcio ou dissolução de união estável, observar-se-ão os arts. 11 e 12 da Lei nº 8.245/1991; neste último caso, a sub-rogação será comunicada por escrito ao LOCADOR${options.guarantee === "FIANCA" ? " e ao FIADOR" : ""}.`);
    w.p("A eventual nulidade de uma cláusula não prejudica as demais.");
    const annexes = ["Anexo I – Laudo de Vistoria Inicial, com fotos"];
    if (options.furnished) annexes.push("Anexo II – Inventário de móveis e equipamentos");
    const guaranteeDoc = guarantee === "CAUCAO" ? "comprovante do depósito da caução" : guarantee === "FIANCA" ? "documentos do FIADOR" : guarantee === "SEGURO_FIANCA" ? "apólice do seguro-fiança" : null;
    if (guaranteeDoc) annexes.push(`Anexo ${ROMAN[annexes.length + 1]} – ${upper(guaranteeDoc[0])}${guaranteeDoc.slice(1)}`);
    w.p(`Integram este contrato: ${listPt(annexes)}.`);
    w.p(
        "As partes reconhecem a validade da assinatura eletrônica deste contrato e de seus aditivos, inclusive a assinatura eletrônica avançada da plataforma gov.br (art. 4º, II, da Lei nº 14.063/2020, e art. 10, § 2º, da MP nº 2.200-2/2001). Os créditos de aluguel e encargos aqui previstos constituem título executivo extrajudicial (art. 784, VIII, do Código de Processo Civil)",
        options.witnesses ? "." : ", dispensada a assinatura de testemunhas (art. 784, § 4º, do Código de Processo Civil).",
    );
    w.p("As despesas de reconhecimento de firma, registro ou averbação deste contrato correrão por conta da parte que solicitar o ato.");

    w.openClause("foro", "Do foro");
    const city: Inline = has(p.city) ? `${p.city}${has(p.state) ? `/${p.state}` : ""}` : fld("property.city", "Comarca do imóvel");
    w.p("Fica eleito o foro da Comarca de ", city, ", local do imóvel, para dirimir as questões oriundas deste contrato.");

    // ── Signatures
    w.part("Assinaturas");
    w.text([`E, por estarem de acordo, as partes assinam este contrato eletronicamente${options.witnesses ? ", juntamente com 2 (duas) testemunhas" : ""}.`]);
    w.text([city, ", na data da última assinatura eletrônica."], { align: "left" });
    signers.forEach((s, i) => {
        const group = `sig-${i}`;
        w.text([""], { align: "center", group });
        w.text(["__________________________________"], { align: "center", group });
        w.text([typeof s.name === "string" ? { text: s.name, bold: true } : s.name], { align: "center", group });
        w.text([s.document], { align: "center", group });
        w.text([s.role], { align: "center", group });
    });

    return { type: "doc", content: w.nodes };
}

/** How many signatures the signed PDF must carry: one per party (and witness). */
export const requiredSignatures = (data: ContractData, options: ContractOptions): number => contractSigners(data, options).length;

/** "Kitnet 35B" → "Contrato - Kitnet 35B.pdf" */
export function contractFileName(reference: string, suffix = ""): string {
    const clean = reference.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "locação";
    return `Contrato - ${clean}${suffix ? ` - ${suffix}` : ""}.pdf`;
}

