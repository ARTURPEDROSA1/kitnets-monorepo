/**
 * Reading the "Comprovante de Inscrição e de Situação Cadastral" — the Cartão CNPJ the Receita
 * Federal issues — into the holding's record (profiles.company_registry).
 *
 * Pure helpers shared by the import (lib/company-import-server.ts) and its tests: the prompt the AI
 * reader gets, a regex reader for the card's text layer (the card is a text PDF, so the CNPJ, the
 * CNAEs, the natureza jurídica and the porte come straight from it and never depend on a model),
 * the sanitizer that turns either answer into a CompanyRegistry, and the mapping of the card's
 * natureza jurídica and porte onto the accounting policies' options (/contabil/politicas).
 */
import type { CompanySize, LegalNature } from "@/lib/accounting-policies";
import { formatCNPJ, normalizeCNPJ, validateCNPJ } from "@/lib/validators";

export interface CnaeEntry {
    /** "68.10-2-02" */
    codigo: string;
    descricao: string;
}

export interface RegistryAddress {
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    municipio: string | null;
    uf: string | null;
    cep: string | null;
}

/** What the card says; null where it shows nothing (or asterisks). Dates are ISO. */
export interface CompanyRegistry {
    /** formatted, 00.000.000/0000-00 */
    cnpj: string | null;
    razao_social: string | null;
    nome_fantasia: string | null;
    data_abertura: string | null;
    situacao_cadastral: string | null;
    data_situacao_cadastral: string | null;
    natureza_juridica: { codigo: string | null; descricao: string } | null;
    /** as printed: ME, EPP, DEMAIS */
    porte: string | null;
    cnae_principal: CnaeEntry | null;
    cnaes_secundarios: CnaeEntry[];
    endereco: RegistryAddress | null;
    telefone: string | null;
    email: string | null;
    ente_federativo: string | null;
    situacao_especial: string | null;
    data_situacao_especial: string | null;
}

export const EMPTY_REGISTRY: CompanyRegistry = {
    cnpj: null,
    razao_social: null,
    nome_fantasia: null,
    data_abertura: null,
    situacao_cadastral: null,
    data_situacao_cadastral: null,
    natureza_juridica: null,
    porte: null,
    cnae_principal: null,
    cnaes_secundarios: [],
    endereco: null,
    telefone: null,
    email: null,
    ente_federativo: null,
    situacao_especial: null,
    data_situacao_especial: null,
};

export const CNPJ_CARD_PROMPT = `You are reading a "Comprovante de Inscrição e de Situação Cadastral" (the Cartão CNPJ) issued by the Receita Federal do Brasil.
Return ONLY a JSON object with exactly these keys; use null when the card does not show a field (a row of asterisks means not informed):
{
  "cnpj": "the NÚMERO DE INSCRIÇÃO, formatted 00.000.000/0000-00",
  "razao_social": "the NOME EMPRESARIAL, as printed",
  "nome_fantasia": "the TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA), or null",
  "data_abertura": "DATA DE ABERTURA as YYYY-MM-DD",
  "situacao_cadastral": "SITUAÇÃO CADASTRAL, e.g. ATIVA",
  "data_situacao_cadastral": "DATA DA SITUAÇÃO CADASTRAL as YYYY-MM-DD",
  "natureza_juridica": { "codigo": "e.g. 206-2", "descricao": "e.g. Sociedade Empresária Limitada" },
  "porte": "PORTE as printed: ME, EPP or DEMAIS",
  "cnae_principal": { "codigo": "e.g. 68.10-2-02", "descricao": "the activity's text" },
  "cnaes_secundarios": [ { "codigo": "...", "descricao": "..." } ],
  "endereco": { "logradouro": "", "numero": "", "complemento": null, "bairro": "", "municipio": "", "uf": "", "cep": "00000-000" },
  "telefone": "TELEFONE or null",
  "email": "ENDEREÇO ELETRÔNICO or null",
  "ente_federativo": "ENTE FEDERATIVO RESPONSÁVEL (EFR) or null",
  "situacao_especial": "SITUAÇÃO ESPECIAL or null",
  "data_situacao_especial": "DATA DA SITUAÇÃO ESPECIAL as YYYY-MM-DD or null"
}
Copy every code and description exactly as printed. List every secondary CNAE; "Não informada" means an empty list. Never invent a value.`;

/* ---------- the card's text layer ---------- */

const CNAE_CODE = /\d{2}\.\d{2}-\d-\d{2}/;
// "68.10-2-02 - Aluguel de imóveis próprios", one per line or several on one (merged text layers)
const CNAE_LINE = /(\d{2}\.\d{2}-\d-\d{2})\s*-\s*(.+?)(?=\s+\d{2}\.\d{2}-\d-\d{2}\s*-|\s+C[ÓO]DIGO E DESCRI|\n|$)/g;
const NATURE_LINE = /(\d{3}-\d)\s*-\s*(.+?)(?=\s+LOGRADOURO|\n|$)/;
const CNPJ_TEXT = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
const DATE_TEXT = /\d{2}\/\d{2}\/\d{4}/;

const PRINCIPAL_LABEL = /ATIVIDADE ECON[ÔO]MICA PRINCIPAL/i;
const SECONDARY_LABEL = /ATIVIDADES ECON[ÔO]MICAS SECUND[ÁA]RIAS/i;
const NATURE_LABEL = /NATUREZA JUR[ÍI]DICA/i;
const PORTE_LABEL = /\bPORTE\b/i;
const LABEL_WORDS = /T[ÍI]TULO DO ESTABELECIMENTO|C[ÓO]DIGO E DESCRI|\bPORTE\b|NOME EMPRESARIAL|DATA DE ABERTURA|SITUA[ÇC][ÃA]O CADASTRAL/i;

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

function cnaesIn(slice: string): CnaeEntry[] {
    const out: CnaeEntry[] = [];
    for (const m of slice.matchAll(CNAE_LINE)) {
        const descricao = tidy(m[2]);
        if (!descricao || out.some((c) => c.codigo === m[1])) continue;
        out.push({ codigo: m[1], descricao });
    }
    return out;
}

/** The text on the line after a label (or after it on the same line); null when it looks like another label. */
function afterLabel(text: string, label: RegExp): string | null {
    const m = text.match(label);
    if (!m || m.index === undefined) return null;
    const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 300);
    const sameLine = tidy(rest.split("\n")[0] ?? "");
    const nextLine = tidy(rest.split("\n").slice(1).find((l) => l.trim()) ?? "");
    const value = sameLine || nextLine;
    if (!value || /^\*+$/.test(value) || LABEL_WORDS.test(value) || value.length > 200) return null;
    return value;
}

/** What the regexes find in the card's text: the fields that never need a model. */
export interface CardTextFacts {
    cnpj: string | null;
    razao_social: string | null;
    nome_fantasia: string | null;
    data_abertura: string | null;
    situacao_cadastral: string | null;
    data_situacao_cadastral: string | null;
    cnae_principal: CnaeEntry | null;
    cnaes_secundarios: CnaeEntry[];
    natureza_juridica: { codigo: string | null; descricao: string } | null;
    porte: string | null;
}

export function readCardText(text: string): CardTextFacts {
    const principalAt = text.search(PRINCIPAL_LABEL);
    const secondaryAt = text.search(SECONDARY_LABEL);
    const natureAt = text.search(NATURE_LABEL);

    let cnae_principal: CnaeEntry | null = null;
    if (principalAt >= 0) {
        const end = secondaryAt > principalAt ? secondaryAt : principalAt + 400;
        cnae_principal = cnaesIn(text.slice(principalAt, end))[0] ?? null;
    }

    let cnaes_secundarios: CnaeEntry[] = [];
    if (secondaryAt >= 0) {
        const end = natureAt > secondaryAt ? natureAt : undefined;
        cnaes_secundarios = cnaesIn(text.slice(secondaryAt, end)).filter((c) => c.codigo !== cnae_principal?.codigo);
    }

    let natureza_juridica: CardTextFacts["natureza_juridica"] = null;
    if (natureAt >= 0) {
        const m = text.slice(natureAt, natureAt + 300).match(NATURE_LINE);
        if (m) natureza_juridica = { codigo: m[1], descricao: tidy(m[2]) };
    }

    let porte: string | null = null;
    const porteAt = text.search(PORTE_LABEL);
    if (porteAt >= 0) {
        const m = text.slice(porteAt + 5, porteAt + 80).match(/^[\s:]*(ME|EPP|DEMAIS|MICRO ?EMPRESA|EMPRESA DE PEQUENO PORTE)\b/i);
        if (m) porte = m[1].toUpperCase();
    }

    const cnpjMatch = text.match(CNPJ_TEXT);
    const cnpj = cnpjMatch && validateCNPJ(normalizeCNPJ(cnpjMatch[0])) ? cnpjMatch[0] : null;

    const openingText = afterLabel(text, /DATA DE ABERTURA/i);
    // the words also sit in the card's title; the label is the one a status follows
    const status = text.match(/SITUA[ÇC][ÃA]O CADASTRAL\s*:?\s*(ATIVA|BAIXADA|INAPTA|SUSPENSA|NULA)\b/i);
    const statusDateText = afterLabel(text, /DATA DA SITUA[ÇC][ÃA]O CADASTRAL/i);

    return {
        cnpj,
        razao_social: afterLabel(text, /NOME EMPRESARIAL/i),
        nome_fantasia: afterLabel(text, /T[ÍI]TULO DO ESTABELECIMENTO\s*\(NOME DE FANTASIA\)/i),
        data_abertura: isoDate(openingText?.match(DATE_TEXT)?.[0]),
        situacao_cadastral: status ? status[1].toUpperCase() : null,
        data_situacao_cadastral: isoDate(statusDateText?.match(DATE_TEXT)?.[0]),
        cnae_principal,
        cnaes_secundarios,
        natureza_juridica,
        porte,
    };
}

/* ---------- the sanitizer ---------- */

const str = (v: unknown, max = 300): string | null => {
    if (typeof v !== "string") return null;
    const t = tidy(v);
    if (!t || /^\*+$/.test(t) || t.toLowerCase() === "null") return null;
    return t.slice(0, max);
};

/** "2021-07-15" or "15/07/2021" → "2021-07-15"; anything else → null */
export const isoDate = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    return null;
};

const cnae = (v: unknown): CnaeEntry | null => {
    if (!v || typeof v !== "object") return null;
    const { codigo, descricao } = v as { codigo?: unknown; descricao?: unknown };
    const code = typeof codigo === "string" ? codigo.trim() : "";
    const text = str(descricao, 200);
    if (!CNAE_CODE.test(code) || !text) return null;
    return { codigo: code.match(CNAE_CODE)![0], descricao: text };
};

const cnaeList = (v: unknown): CnaeEntry[] => {
    if (!Array.isArray(v)) return [];
    const out: CnaeEntry[] = [];
    for (const item of v) {
        const c = cnae(item);
        if (c && !out.some((o) => o.codigo === c.codigo)) out.push(c);
    }
    return out.slice(0, 60);
};

const cnpjOf = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const digits = normalizeCNPJ(v);
    return digits.length === 14 && validateCNPJ(digits) ? formatCNPJ(digits) : null;
};

const cepOf = (v: unknown): string | null => {
    const digits = typeof v === "string" ? v.replace(/\D/g, "") : "";
    return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : null;
};

const address = (v: unknown): RegistryAddress | null => {
    if (!v || typeof v !== "object") return null;
    const a = v as Record<string, unknown>;
    const out: RegistryAddress = {
        logradouro: str(a.logradouro, 200),
        numero: str(a.numero, 20),
        complemento: str(a.complemento, 120),
        bairro: str(a.bairro, 120),
        municipio: str(a.municipio, 120),
        uf: str(a.uf, 2)?.toUpperCase() ?? null,
        cep: cepOf(a.cep),
    };
    return Object.values(out).some((x) => x !== null) ? out : null;
};

const nature = (v: unknown): CompanyRegistry["natureza_juridica"] => {
    if (v && typeof v === "object") {
        const n = v as { codigo?: unknown; descricao?: unknown };
        const descricao = str(n.descricao, 160);
        if (!descricao) return null;
        const code = typeof n.codigo === "string" ? n.codigo.match(/\d{3}-\d/)?.[0] ?? null : null;
        return { codigo: code, descricao };
    }
    if (typeof v === "string") {
        const m = v.match(/(\d{3}-\d)\s*-\s*(.+)/);
        const descricao = m ? str(m[2], 160) : str(v, 160);
        return descricao ? { codigo: m ? m[1] : null, descricao } : null;
    }
    return null;
};

/**
 * The reader's answer (or an edited registry) as a clean CompanyRegistry. With the card's text,
 * the fields the regexes read from it win over the model's — the CNPJ (checked), the CNAEs, the
 * natureza jurídica and the porte — and the others fill in where the model answered nothing.
 * Null when nothing usable is in it.
 */
export function normalizeCompanyRegistry(raw: unknown, text?: string): CompanyRegistry | null {
    const source = raw && typeof raw === "object" ? ((raw as { extracted_data?: unknown }).extracted_data ?? raw) : {};
    const d = (source && typeof source === "object" ? source : {}) as Record<string, unknown>;

    const reg: CompanyRegistry = {
        cnpj: cnpjOf(d.cnpj),
        razao_social: str(d.razao_social, 200),
        nome_fantasia: str(d.nome_fantasia, 200),
        data_abertura: isoDate(d.data_abertura),
        situacao_cadastral: str(d.situacao_cadastral, 60)?.toUpperCase() ?? null,
        data_situacao_cadastral: isoDate(d.data_situacao_cadastral),
        natureza_juridica: nature(d.natureza_juridica),
        porte: str(d.porte, 40)?.toUpperCase() ?? null,
        cnae_principal: cnae(d.cnae_principal),
        cnaes_secundarios: cnaeList(d.cnaes_secundarios),
        endereco: address(d.endereco),
        telefone: str(d.telefone, 60),
        email: str(d.email, 160)?.toLowerCase() ?? null,
        ente_federativo: str(d.ente_federativo, 160),
        situacao_especial: str(d.situacao_especial, 120),
        data_situacao_especial: isoDate(d.data_situacao_especial),
    };

    if (text && text.trim()) {
        const facts = readCardText(text);
        if (facts.cnpj) reg.cnpj = facts.cnpj;
        if (facts.cnae_principal) reg.cnae_principal = facts.cnae_principal;
        if (facts.cnaes_secundarios.length > 0) reg.cnaes_secundarios = facts.cnaes_secundarios.filter((c) => c.codigo !== reg.cnae_principal?.codigo);
        if (facts.natureza_juridica) reg.natureza_juridica = facts.natureza_juridica;
        if (facts.porte) reg.porte = facts.porte;
        reg.razao_social ??= facts.razao_social;
        reg.nome_fantasia ??= facts.nome_fantasia;
        reg.data_abertura ??= facts.data_abertura;
        reg.situacao_cadastral ??= facts.situacao_cadastral;
        reg.data_situacao_cadastral ??= facts.data_situacao_cadastral;
    }

    const anything = reg.cnpj || reg.razao_social || reg.cnae_principal || reg.cnaes_secundarios.length > 0;
    return anything ? reg : null;
}

/* ---------- onto the accounting policies ---------- */

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/**
 * The card's natureza jurídica as the policies' option. The Receita files every limitada under
 * 206-2 "Sociedade Empresária Limitada", one partner or several, so a sociedade limitada
 * unipessoal is only recognised when the card (or the name) spells it out; otherwise it maps to
 * LTDA and the owner switches it to SLU on the policies page.
 */
export function legalNatureFromRegistry(reg: Pick<CompanyRegistry, "natureza_juridica" | "razao_social">): LegalNature | null {
    if (!reg.natureza_juridica) return null;
    const nat = fold(reg.natureza_juridica.descricao);
    const name = fold(reg.razao_social ?? "");
    if (nat.includes("UNIPESSOAL") || name.includes("UNIPESSOAL") || /\bSLU\b/.test(name)) return "SLU";
    if (nat.includes("ANONIMA")) return "SA";
    if (nat.includes("LIMITADA")) return "LTDA";
    if (nat.includes("EMPRESARIO") && nat.includes("INDIVIDUAL")) return "EI";
    return "OUTRA";
}

/** The card's porte (ME, EPP, DEMAIS, or spelled out) as the policies' option. */
export function companySizeFromRegistry(porte: string | null | undefined): CompanySize | null {
    const p = fold(porte ?? "").trim();
    if (!p) return null;
    if (p === "EPP" || p.includes("PEQUENO PORTE")) return "EPP";
    if (p === "ME" || p.includes("MICRO")) return "ME";
    if (p.includes("DEMAIS")) return "DEMAIS";
    return null;
}
