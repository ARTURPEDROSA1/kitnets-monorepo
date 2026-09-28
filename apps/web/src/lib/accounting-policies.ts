/**
 * Holding accounting policies (Contábil & Fiscal › Políticas contábeis).
 *
 * The contador decides them; in Fase 1 he does it outside the platform and the owner
 * records who decided and when. The first and most consequential choice is the standard
 * and the measurement model of the rented properties:
 *
 *   A) NBC TG 1002 (microentidade, receita até R$ 4,8 mi) — Seção 17: propriedade para
 *      investimento dentro do imobilizado, "custo menos a depreciação acumulada", linha
 *      reta pela vida útil da Receita (edificações 25 anos); terreno não deprecia. There is
 *      no fair-value option in this standard.
 *   B) Normas completas (NBC TG 1002, item P5: voluntary, at least 2 years) with CPC 28 at
 *      fair value: no depreciation, changes in fair value in profit or loss (§35).
 *
 * In Lucro Presumido depreciation has no tax effect in the year, lowers the "lucro efetivo"
 * that allows exempt distribution above the presumed profit (RIR/2018 art. 725 §2) and
 * raises the taxable gain on a sale (Lei 9.430 art. 25 §1); fair-value gains are not taxed
 * when booked (§3) and stay out of the book value used for the gain (§4).
 * See lib/accounting-simulation.ts for the side-by-side numbers.
 */
import type { PropertyMeasurement } from "./accounting-chart";

export type LegalNature = "SLU" | "LTDA" | "SA" | "EI" | "OUTRA";
export type CompanySize = "ME" | "EPP" | "DEMAIS";
export type TaxRegime = "LUCRO_PRESUMIDO" | "LUCRO_REAL";
export type TaxBasis = "COMPETENCIA" | "CAIXA";
export type AccountingStandard = "NBC_TG_1002" | "NBC_TG_1001" | "NBC_TG_1000" | "NBC_TG_COMPLETAS";
export type UsefulLifeBasis = "RFB" | "ESTIMATIVA";
export type ReimbursementsPolicy = "RECEITA" | "REPASSE";

export interface AccountingSettings {
    legal_nature: LegalNature | null;
    company_size: CompanySize | null;
    nire: string | null;
    tax_regime: TaxRegime;
    tax_basis: TaxBasis | null;
    accounting_standard: AccountingStandard;
    property_measurement: PropertyMeasurement;
    building_useful_life_years: number;
    useful_life_basis: UsefulLifeBasis;
    reimbursements_policy: ReimbursementsPolicy | null;
    first_adoption_deemed_cost: boolean | null;
    opening_date: string;
    accountant_name: string | null;
    accountant_crc: string | null;
    accountant_crc_uf: string | null;
    accountant_email: string | null;
    policies_decided_by: string | null;
    policies_decided_on: string | null;
}

/** Edificações: 4% a.a. (IN SRF 162/1998, anexo I) — the default under NBC TG 1002 Seção 17. */
export const RFB_BUILDING_USEFUL_LIFE_YEARS = 25;

export const DEFAULT_SETTINGS: AccountingSettings = {
    legal_nature: null,
    company_size: null,
    nire: null,
    tax_regime: "LUCRO_PRESUMIDO",
    tax_basis: null,
    accounting_standard: "NBC_TG_1002",
    property_measurement: "COST",
    building_useful_life_years: RFB_BUILDING_USEFUL_LIFE_YEARS,
    useful_life_basis: "RFB",
    reimbursements_policy: null,
    first_adoption_deemed_cost: null,
    opening_date: "2026-01-01",
    accountant_name: null,
    accountant_crc: null,
    accountant_crc_uf: null,
    accountant_email: null,
    policies_decided_by: null,
    policies_decided_on: null,
};

export const LEGAL_NATURE_LABELS: Record<LegalNature, string> = {
    SLU: "Sociedade Limitada Unipessoal (SLU)",
    LTDA: "Sociedade limitada (Ltda.)",
    SA: "Sociedade anônima (S/A)",
    EI: "Empresário individual",
    OUTRA: "Outra",
};
export const COMPANY_SIZE_LABELS: Record<CompanySize, string> = { ME: "Microempresa (ME)", EPP: "Empresa de pequeno porte (EPP)", DEMAIS: "Demais" };
export const TAX_REGIME_LABELS: Record<TaxRegime, string> = { LUCRO_PRESUMIDO: "Lucro Presumido", LUCRO_REAL: "Lucro Real" };
export const TAX_BASIS_LABELS: Record<TaxBasis, string> = { COMPETENCIA: "Regime de competência", CAIXA: "Regime de caixa" };
export const STANDARD_LABELS: Record<AccountingStandard, string> = {
    NBC_TG_1002: "NBC TG 1002 — microentidades",
    NBC_TG_1001: "NBC TG 1001 — pequenas empresas",
    NBC_TG_1000: "NBC TG 1000 — médias empresas",
    NBC_TG_COMPLETAS: "Normas completas (CPCs)",
};
export const MEASUREMENT_LABELS: Record<PropertyMeasurement, string> = {
    COST: "Custo menos depreciação",
    FAIR_VALUE: "Valor justo (CPC 28)",
};
export const USEFUL_LIFE_BASIS_LABELS: Record<UsefulLifeBasis, string> = {
    RFB: "Vida útil da Receita Federal (edificações: 25 anos)",
    ESTIMATIVA: "Estimativa da administração, justificada",
};
export const REIMBURSEMENTS_LABELS: Record<ReimbursementsPolicy, string> = {
    RECEITA: "Receita da holding (entra na receita bruta)",
    REPASSE: "Repasse (valor de terceiros, fora da receita)",
};

export const BRAZIL_UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"] as const;

/**
 * NBC TG 1002 has no fair-value option (Seção 17); the full standards do (CPC 28 §30).
 * NBC TG 1000/1001 are not blocked here: the contador confirms the option in the chosen standard.
 */
export function allowsFairValue(standard: AccountingStandard): boolean {
    return standard !== "NBC_TG_1002";
}

const oneOf = <T extends string>(v: unknown, values: readonly T[]): T | null => (typeof v === "string" && (values as readonly string[]).includes(v) ? (v as T) : null);
const text = (v: unknown, max: number): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Validates a PUT body into a full settings row (missing fields keep `current`). */
export function validateSettings(body: Record<string, unknown>, current: AccountingSettings = DEFAULT_SETTINGS):
    { value: AccountingSettings } | { error: string } {
    const has = (k: keyof AccountingSettings) => Object.prototype.hasOwnProperty.call(body, k);
    const next: AccountingSettings = { ...current };

    if (has("legal_nature")) next.legal_nature = oneOf(body.legal_nature, ["SLU", "LTDA", "SA", "EI", "OUTRA"] as const);
    if (has("company_size")) next.company_size = oneOf(body.company_size, ["ME", "EPP", "DEMAIS"] as const);
    if (has("nire")) next.nire = text(body.nire, 20);
    if (has("tax_regime")) {
        const v = oneOf(body.tax_regime, ["LUCRO_PRESUMIDO", "LUCRO_REAL"] as const);
        if (!v) return { error: "Regime tributário inválido" };
        next.tax_regime = v;
    }
    if (has("tax_basis")) next.tax_basis = oneOf(body.tax_basis, ["COMPETENCIA", "CAIXA"] as const);
    if (has("accounting_standard")) {
        const v = oneOf(body.accounting_standard, ["NBC_TG_1002", "NBC_TG_1001", "NBC_TG_1000", "NBC_TG_COMPLETAS"] as const);
        if (!v) return { error: "Norma contábil inválida" };
        next.accounting_standard = v;
    }
    if (has("property_measurement")) {
        const v = oneOf(body.property_measurement, ["COST", "FAIR_VALUE"] as const);
        if (!v) return { error: "Modelo de mensuração inválido" };
        next.property_measurement = v;
    }
    if (next.property_measurement === "FAIR_VALUE" && !allowsFairValue(next.accounting_standard)) {
        return { error: "A NBC TG 1002 não tem a opção de valor justo: para usar o CPC 28 a valor justo, adote as normas completas" };
    }
    if (has("useful_life_basis")) {
        const v = oneOf(body.useful_life_basis, ["RFB", "ESTIMATIVA"] as const);
        if (!v) return { error: "Base da vida útil inválida" };
        next.useful_life_basis = v;
    }
    if (has("building_useful_life_years")) {
        const n = Number(body.building_useful_life_years);
        if (!Number.isFinite(n) || n <= 0 || n > 100) return { error: "Vida útil das edificações deve estar entre 1 e 100 anos" };
        next.building_useful_life_years = Math.round(n * 100) / 100;
    }
    if (next.useful_life_basis === "RFB") next.building_useful_life_years = RFB_BUILDING_USEFUL_LIFE_YEARS;
    if (has("reimbursements_policy")) next.reimbursements_policy = oneOf(body.reimbursements_policy, ["RECEITA", "REPASSE"] as const);
    if (has("first_adoption_deemed_cost")) next.first_adoption_deemed_cost = typeof body.first_adoption_deemed_cost === "boolean" ? body.first_adoption_deemed_cost : null;
    if (has("opening_date")) {
        const v = typeof body.opening_date === "string" ? body.opening_date : "";
        if (!ISO.test(v) || !v.endsWith("-01")) return { error: "A escrituração começa no primeiro dia de um mês" };
        next.opening_date = v;
    }
    if (has("accountant_name")) next.accountant_name = text(body.accountant_name, 120);
    if (has("accountant_crc")) next.accountant_crc = text(body.accountant_crc, 30);
    if (has("accountant_crc_uf")) {
        const uf = typeof body.accountant_crc_uf === "string" ? body.accountant_crc_uf.trim().toUpperCase() : "";
        if (uf && !(BRAZIL_UFS as readonly string[]).includes(uf)) return { error: "UF do CRC inválida" };
        next.accountant_crc_uf = uf || null;
    }
    if (has("accountant_email")) {
        const e = text(body.accountant_email, 160);
        if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { error: "E-mail do contador inválido" };
        next.accountant_email = e;
    }
    if (has("policies_decided_by")) next.policies_decided_by = text(body.policies_decided_by, 160);
    if (has("policies_decided_on")) {
        const v = typeof body.policies_decided_on === "string" && ISO.test(body.policies_decided_on) ? body.policies_decided_on : null;
        next.policies_decided_on = v;
    }
    return { value: next };
}

/** Decisions still open, for the "Atenção" list and the contador package. */
export function pendingDecisions(s: AccountingSettings): string[] {
    const out: string[] = [];
    if (!s.accountant_name || !s.accountant_crc || !s.accountant_crc_uf) out.push("Cadastrar o contador responsável (nome, CRC e UF)");
    if (!s.policies_decided_by || !s.policies_decided_on) out.push("Registrar a decisão do contador sobre a norma e o modelo de mensuração");
    if (!s.tax_basis) out.push("Definir o regime de apuração dos tributos (caixa ou competência)");
    if (!s.reimbursements_policy) out.push("Definir se IPTU e condomínio reembolsados pelo inquilino são receita ou repasse");
    if (s.first_adoption_deemed_cost === null) out.push("Confirmar se é a primeira adoção formal da norma (custo atribuído, NBC TG 1002 item 35.3)");
    return out;
}
