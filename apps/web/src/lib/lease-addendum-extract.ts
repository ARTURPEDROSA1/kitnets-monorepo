/**
 * Reading a lease addendum ("aditivo") with AI: the prompt and the lenient normaliser of what comes back.
 *
 * An addendum is the source of truth of an adjustment: the parties may agree on any value, whatever the
 * index did (a spike, a crisis, force majeure). The owner reviews what was read before it is saved.
 */
import { parseCurrencyBR } from "@/lib/currency";
import { LEASE_ADJUSTMENT } from "@/lib/schemas/lease";

export const ADDENDUM_EXTRACTION_PROMPT = `Você lê aditivos de contratos de locação de imóveis no Brasil: termo aditivo, termo de reajuste, comunicado ou acordo de reajuste do aluguel.
Extraia SOMENTE o que o documento diz. Não calcule, não estime e não invente valores.

Retorne SOMENTE um JSON com esta estrutura:
{
  "is_addendum": true ou false,
  "effective_date": "AAAA-MM-DD" ou null,
  "signed_date": "AAAA-MM-DD" ou null,
  "new_rent": número ou null,
  "previous_rent": número ou null,
  "new_condominium": número ou null,
  "index": "IPCA", "IGP_M", "INPC", "IVAR", "CUSTOM" ou null,
  "percent": número ou null,
  "new_end_date": "AAAA-MM-DD" ou null,
  "summary": texto curto ou null,
  "confidence": número de 0 a 1
}

Regras:
- "is_addendum": false quando o documento não altera nem reajusta o valor do aluguel.
- "effective_date": a data a partir da qual o novo valor passa a valer (não a data de assinatura, quando forem diferentes).
- "new_rent": o novo valor MENSAL do aluguel, em reais. "previous_rent": o valor anterior, se o documento disser.
- "new_condominium": o novo valor mensal do condomínio, somente se o documento o alterar.
- "index": o índice citado para o reajuste; "CUSTOM" para outro índice ou para valor negociado sem índice.
- "percent": o percentual de reajuste aplicado, se o documento disser (4,83% = 4.83).
- "new_end_date": o novo término do contrato, somente se o aditivo prorrogar o prazo.
- "summary": uma frase dizendo o que o aditivo altera e, se constar, o motivo (por exemplo, valor negociado abaixo do índice).
- Valores como número (1234.56), sem "R$". Use null para o que o documento não informar.`;

export interface ExtractedAddendum {
    is_addendum: boolean;
    /** `YYYY-MM-DD` the new value applies from */
    effective_date: string | null;
    signed_date: string | null;
    new_rent: number | null;
    previous_rent: number | null;
    new_condominium: number | null;
    index: (typeof LEASE_ADJUSTMENT)[number] | null;
    percent: number | null;
    new_end_date: string | null;
    summary: string | null;
    /** 0–1 */
    confidence: number | null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** A real calendar date as `YYYY-MM-DD` (the model sometimes answers dd/mm/aaaa), else null. */
function date(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim().slice(0, 10);
    const iso = ISO_DATE.exec(s);
    const br = BR_DATE.exec(s);
    const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : br ? [br[3], br[2], br[1]] : ["", "", ""];
    if (!y) return null;
    const t = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return t.getUTCFullYear() === Number(y) && t.getUTCMonth() === Number(m) - 1 && t.getUTCDate() === Number(d) ? `${y}-${m}-${d}` : null;
}

/** A positive amount in reais, to the cent; null for nothing, zero or nonsense. */
function money(v: unknown): number | null {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : typeof v === "string" ? parseCurrencyBR(v) : NaN;
    return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : null;
}

function percent(v: unknown): number | null {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace("%", "").replace(/\s/g, "").replace(",", ".")) : NaN;
    return Number.isFinite(n) && Math.abs(n) <= 1000 ? Math.round(n * 10000) / 10000 : null;
}

export function normalizeAddendumExtraction(raw: unknown): ExtractedAddendum {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const index = typeof r.index === "string" ? r.index.trim().toUpperCase().replace("-", "_") : null;
    const confidence = typeof r.confidence === "number" && Number.isFinite(r.confidence) ? Math.min(1, Math.max(0, r.confidence)) : null;
    const summary = typeof r.summary === "string" && r.summary.trim() ? r.summary.trim().slice(0, 500) : null;
    return {
        is_addendum: r.is_addendum !== false,
        effective_date: date(r.effective_date),
        signed_date: date(r.signed_date),
        new_rent: money(r.new_rent),
        previous_rent: money(r.previous_rent),
        new_condominium: money(r.new_condominium),
        index: (LEASE_ADJUSTMENT as readonly string[]).includes(index ?? "") && index !== "NONE" ? (index as ExtractedAddendum["index"]) : null,
        percent: percent(r.percent),
        new_end_date: date(r.new_end_date),
        summary,
        confidence,
    };
}

/** Nothing an adjustment could be made of: not an addendum, or no new rent in it. */
export const isEmptyAddendum = (e: ExtractedAddendum): boolean => !e.is_addendum || e.new_rent === null;
