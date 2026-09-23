/**
 * Off-plan purchase contract import (Novos Investimentos → "Importar contrato com IA").
 *
 * Pure pieces shared by POST /api/investments/extract and its tests: the prompt and a lenient
 * normaliser for whatever JSON the model returns. Nothing here touches the database — the route
 * reports what it read, the user confirms it before the investment is created.
 *
 * What we are reading is almost always a "QUADRO RESUMO" table (preço total, entrada, N parcelas
 * de X a partir de DD/MM/AAAA, índice de correção) or the "DO VALOR E DA FORMA DE PAGAMENTO"
 * clause that says the same thing in prose, sometimes in CUBs instead of reais.
 */
import { parseCurrencyBR } from "@/lib/currency";
import { parseCEP } from "@/lib/validators";
import type { IndexCode, InvestmentKind, PaymentKind, Periodicity } from "@/lib/new-investments";

export const INVESTMENT_EXTRACTION_PROMPT = `Você é um especialista em contratos brasileiros de compra de imóvel na planta (promessa de compra e venda com construtora/incorporadora).
Analise o documento e extraia o quadro resumo e a forma de pagamento.

ATENÇÃO:
- O COMPRADOR/PROMITENTE COMPRADOR é o investidor. A CONSTRUTORA/INCORPORADORA/VENDEDORA vai em "developer".
- "schedules" é o plano de pagamento: cada bloco é um conjunto de parcelas iguais ("2 parcelas de R$ 7.095,00 a partir de 31/08/2026", "36 parcelas de R$ 3.547,50", "11 parcelas anuais de R$ 5.995,45").
- Crie um bloco SEPARADO para cada linha do quadro resumo e para cada alínea (a, b, c, d, e) da cláusula de pagamento. NÃO some blocos diferentes.
- Valores em CUB: converta para reais usando o valor em reais que o próprio contrato informa ao lado; se só houver CUB, use null em "amount" e escreva o texto original em "notes".
- Uma vaga de garagem vendida à parte é um investimento próprio: se o documento tratar só da vaga, use "kind": "PARKING".
- Datas sempre em YYYY-MM-DD. Valores sempre como número decimal (1234.56), sem "R$" e sem separador de milhar.

Retorne SOMENTE um JSON válido (sem markdown, sem explicações) com esta estrutura:
{
    "investment": {
        "name": "nome do empreendimento (ex: Sun Place, Infinity Paradise Residencial) ou null",
        "unit_label": "identificação da unidade (ex: Studio 204, Vaga 12, Apartamento 1203) ou null",
        "kind": "APARTMENT | STUDIO | HOUSE | PARKING | LOT | COMMERCIAL | OTHER",
        "developer": "construtora/incorporadora/vendedora ou null",
        "description": "resumo curto do que está sendo comprado (até 300 caracteres) ou null",
        "street": "logradouro do imóvel ou null",
        "street_number": "número ou null",
        "neighborhood": "bairro ou null",
        "city": "cidade ou null",
        "state": "UF (2 letras) ou null",
        "postal_code": "CEP ou null",
        "total_price": "preço total do imóvel, ex: 141900.00, ou null",
        "down_payment": "valor de entrada/sinal, ex: 14190.00, ou null",
        "financed_amount": "valor a parcelar, ex: 127710.00, ou null",
        "contract_date": "data do contrato (YYYY-MM-DD) ou null",
        "keys_expected_on": "data prevista de entrega das chaves/habite-se (YYYY-MM-DD) ou null",
        "index_before_keys": "índice que corrige as parcelas ATÉ as chaves: INCC | IGPM | IPCA | CUB | NONE | OTHER",
        "index_after_keys": "índice que corrige as parcelas APÓS as chaves: INCC | IGPM | IPCA | CUB | NONE | OTHER"
    },
    "schedules": [
        {
            "label": "descrição curta do bloco (ex: Entrada, Parcelas mensais, Parcelas anuais, Sinal, Início de obras)",
            "kind": "SINAL | ENTRADA | PARCELA | PARCELA_ANUAL | INTERCALADA | INICIO_OBRAS (pago no início das obras) | CHAVES (pago na entrega das chaves) | TAXAS | OUTROS",
            "installments": "quantidade de parcelas (número inteiro, use 1 quando for pagamento único)",
            "amount": "valor de CADA parcela, ex: 3547.50, ou null",
            "first_due_on": "primeiro vencimento (YYYY-MM-DD)",
            "last_due_on": "último vencimento (YYYY-MM-DD) ou null",
            "periodicity": "SINGLE | MONTHLY | QUARTERLY | SEMIANNUAL | ANNUAL",
            "index_code": "INCC | IGPM | IPCA | CUB | NONE | OTHER",
            "notes": "observação curta (ex: 'no início de obras', '79,2484 CUBs') ou null"
        }
    ]
}`;

export interface ExtractedSchedule {
    label: string;
    kind: PaymentKind;
    installments: number;
    amount: number | null;
    first_due_on: string | null;
    periodicity: Periodicity;
    index_code: IndexCode;
    notes: string | null;
}

export interface ExtractedInvestment {
    investment: {
        name: string | null;
        unit_label: string | null;
        kind: InvestmentKind;
        developer: string | null;
        description: string | null;
        street: string | null;
        street_number: string | null;
        neighborhood: string | null;
        city: string | null;
        state: string | null;
        postal_code: string | null;
        total_price: number | null;
        down_payment: number | null;
        financed_amount: number | null;
        contract_date: string | null;
        keys_expected_on: string | null;
        index_before_keys: IndexCode;
        index_after_keys: IndexCode;
    };
    schedules: ExtractedSchedule[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const BR_MONTH = /^(\d{2})\/(\d{4})$/;

const NULLISH = new Set(["null", "undefined", "n/a", "na", "não consta", "nao consta", "não informado", "nao informado", "-", "sem correção", "sem correcao"]);

function text(v: unknown, max = 300): string | null {
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v !== "string") return null;
    const t = v.replace(/\s+/g, " ").trim();
    if (!t || NULLISH.has(t.toLowerCase())) return null;
    return t.slice(0, max);
}

function isoDate(v: unknown): string | null {
    const t = text(v, 30);
    if (!t) return null;
    const br = BR_DATE.exec(t);
    // "10/2026" (a quadro resumo sometimes gives only the month) → the first of it
    const month = BR_MONTH.exec(t);
    const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : month ? `${month[2]}-${month[1]}-01` : t.slice(0, 10);
    if (!ISO_DATE.test(iso)) return null;
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

function money(v: unknown): number | null {
    if (v == null || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
    if (typeof v !== "string") return null;
    const n = parseCurrencyBR(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function int(v: unknown, min: number, max: number): number | null {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? Math.trunc(v) : parseInt(String(v).replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Models write the index the way the contract does: "INCC-M", "índice do INCC", "IGP-M/FGV". */
export function indexCode(v: unknown): IndexCode {
    const key = text(v, 60)?.toUpperCase().replace(/[^A-Z]/g, "");
    if (!key) return "NONE";
    if (key.includes("INCC")) return "INCC";
    if (key.includes("IGPM") || key.includes("IGP")) return "IGPM";
    if (key.includes("IPCA")) return "IPCA";
    if (key.includes("CUB")) return "CUB";
    if (key === "NONE" || key.startsWith("NENHUM") || key.startsWith("SEM")) return "NONE";
    return "OTHER";
}

const KIND_VALUES: InvestmentKind[] = ["APARTMENT", "STUDIO", "HOUSE", "PARKING", "LOT", "COMMERCIAL", "OTHER"];

export function investmentKind(v: unknown): InvestmentKind {
    const t = text(v, 40)?.toUpperCase().replace(/[\s-]+/g, "_");
    if (t && KIND_VALUES.includes(t as InvestmentKind)) return t as InvestmentKind;
    const raw = text(v, 60)?.toLowerCase() ?? "";
    if (/vaga|garagem|estacionamento/.test(raw)) return "PARKING";
    if (/studio|st[úu]dio|loft/.test(raw)) return "STUDIO";
    if (/lote|terreno/.test(raw)) return "LOT";
    if (/sala|comercial|loja/.test(raw)) return "COMMERCIAL";
    if (/casa|sobrado/.test(raw)) return "HOUSE";
    return "APARTMENT";
}

const PAYMENT_KIND_VALUES: PaymentKind[] = [
    "SINAL", "ENTRADA", "PARCELA", "PARCELA_ANUAL", "INTERCALADA", "INICIO_OBRAS",
    "CHAVES", "AMORTIZACAO", "CORRECAO", "TAXAS", "OUTROS",
];

function paymentKind(v: unknown, periodicity: Periodicity): PaymentKind {
    const t = text(v, 40)?.toUpperCase().replace(/[\s-]+/g, "_");
    if (t && PAYMENT_KIND_VALUES.includes(t as PaymentKind)) return t as PaymentKind;
    const raw = text(v, 60)?.toLowerCase() ?? "";
    if (/sinal|reserva/.test(raw)) return "SINAL";
    if (/entrada/.test(raw)) return "ENTRADA";
    // before "chave": a contract can carry both, and only this one says "obra"
    if (/obra/.test(raw)) return "INICIO_OBRAS";
    if (/chave|habite/.test(raw)) return "CHAVES";
    if (/itbi|registro|escritura|taxa/.test(raw)) return "TAXAS";
    if (/intercalad|refor[çc]o|bal[ãa]o/.test(raw)) return "INTERCALADA";
    return periodicity === "ANNUAL" ? "PARCELA_ANUAL" : "PARCELA";
}

const PERIODICITY_VALUES: Periodicity[] = ["SINGLE", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"];

function periodicity(v: unknown, installments: number): Periodicity {
    const t = text(v, 40)?.toUpperCase().replace(/[\s-]+/g, "_");
    if (t && PERIODICITY_VALUES.includes(t as Periodicity)) return t as Periodicity;
    const raw = text(v, 60)?.toLowerCase() ?? "";
    if (/anual|ano/.test(raw)) return "ANNUAL";
    if (/semestr/.test(raw)) return "SEMIANNUAL";
    if (/trimestr/.test(raw)) return "QUARTERLY";
    if (/[úu]nic/.test(raw)) return "SINGLE";
    return installments > 1 ? "MONTHLY" : "SINGLE";
}

/**
 * The periodicity the two dates of a quadro resumo imply.
 *
 * "2 parcelas · primeiro 31/08/2026 · último 30/09/2026" is monthly; "11 parcelas · 15/03/2027 →
 * 15/03/2037" is annual. Trust the span over the word when they disagree, because a block labelled
 * "mensal" with a ten-year span is a mislabel and the dates are copied straight from the table.
 */
export function periodicityFromSpan(installments: number, firstDue: string | null, lastDue: string | null): Periodicity | null {
    if (!firstDue || !lastDue || installments < 2) return null;
    const [fy, fm] = firstDue.slice(0, 7).split("-").map(Number);
    const [ly, lm] = lastDue.slice(0, 7).split("-").map(Number);
    const span = (ly - fy) * 12 + (lm - fm);
    if (span <= 0) return null;
    const step = Math.round(span / (installments - 1));
    if (step >= 11) return "ANNUAL";
    if (step >= 5) return "SEMIANNUAL";
    if (step >= 2) return "QUARTERLY";
    return "MONTHLY";
}

export function normalizeInvestmentExtraction(raw: unknown): ExtractedInvestment {
    const root = (raw ?? {}) as Record<string, unknown>;
    // Models sometimes answer with the investment object at the top level.
    const inv = ((root.investment ?? root) || {}) as Record<string, unknown>;
    const rawSchedules = Array.isArray(root.schedules)
        ? root.schedules
        : Array.isArray((inv as Record<string, unknown>).schedules)
          ? ((inv as Record<string, unknown>).schedules as unknown[])
          : [];

    const schedules: ExtractedSchedule[] = [];
    for (const item of rawSchedules.slice(0, 40)) {
        const s = (item ?? {}) as Record<string, unknown>;
        const firstDue = isoDate(s.first_due_on);
        const installments = int(s.installments, 1, 600) ?? 1;
        const lastDue = isoDate(s.last_due_on);
        const period = periodicityFromSpan(installments, firstDue, lastDue) ?? periodicity(s.periodicity, installments);
        const amount = money(s.amount);
        const label = text(s.label, 80);
        if (!firstDue && amount === null) continue;
        schedules.push({
            label: label ?? "Parcelas",
            kind: paymentKind(s.kind ?? label, period),
            installments: period === "SINGLE" ? 1 : installments,
            amount,
            first_due_on: firstDue,
            periodicity: period,
            index_code: indexCode(s.index_code),
            notes: text(s.notes, 200),
        });
    }

    const postal = text(inv.postal_code, 12);
    const digits = postal ? parseCEP(postal) : "";
    const state = text(inv.state, 20)?.toUpperCase().slice(0, 2) ?? null;

    return {
        investment: {
            name: text(inv.name, 120),
            unit_label: text(inv.unit_label, 80),
            kind: investmentKind(inv.kind),
            developer: text(inv.developer, 120),
            description: text(inv.description, 300),
            street: text(inv.street, 200),
            street_number: text(inv.street_number, 20),
            neighborhood: text(inv.neighborhood, 100),
            city: text(inv.city, 100),
            state: state && /^[A-Z]{2}$/.test(state) ? state : null,
            postal_code: digits.length === 8 ? digits : null,
            total_price: money(inv.total_price),
            down_payment: money(inv.down_payment),
            financed_amount: money(inv.financed_amount),
            contract_date: isoDate(inv.contract_date),
            keys_expected_on: isoDate(inv.keys_expected_on),
            index_before_keys: indexCode(inv.index_before_keys),
            index_after_keys: indexCode(inv.index_after_keys),
        },
        schedules,
    };
}

/** True when the model found nothing worth showing: not a purchase contract, or unreadable. */
export function isEmptyInvestmentExtraction(data: ExtractedInvestment): boolean {
    const i = data.investment;
    return (
        data.schedules.length === 0 &&
        i.total_price === null &&
        i.down_payment === null &&
        i.financed_amount === null &&
        !i.name &&
        !i.developer
    );
}

/**
 * The price the quadro resumo implies when the contract does not spell one out:
 * entrada + Σ (parcelas × valor). Used only to pre-fill the form.
 */
export function inferTotalPrice(data: ExtractedInvestment): number | null {
    if (data.investment.total_price !== null) return data.investment.total_price;
    const sum = data.schedules.reduce(
        (total, s) => total + (s.amount ?? 0) * (s.periodicity === "SINGLE" ? 1 : s.installments),
        0
    );
    return sum > 0 ? Math.round(sum * 100) / 100 : null;
}
