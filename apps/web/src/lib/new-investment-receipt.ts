/**
 * Reading a payment receipt (Novos Investimentos → the "anexar" on a payment row).
 *
 * Pure pieces shared by POST /api/investments/[id]/receipts/extract and its tests: the prompt, the
 * lenient normaliser, and the allocation of a payment between the person and the company from the
 * receipts that settled it. Nothing here touches the database.
 *
 * What is being read is a bank transfer or a boleto payment slip — PIX, TED, "comprovante de
 * pagamento" — and the one fact that decides the allocation is the payer's document: a CPF is the
 * person, a CNPJ is the company. Everything else (amount, date) confirms what the row already says.
 */
import { parseCurrencyBR } from "@/lib/currency";
import { round2 } from "@/lib/property-income";
import type { Payer } from "@/lib/new-investments";

export const RECEIPT_EXTRACTION_PROMPT = `Você é um especialista em comprovantes bancários brasileiros (PIX, TED, DOC, pagamento de boleto).
Analise o comprovante e extraia os dados do pagamento.

ATENÇÃO:
- O PAGADOR é quem enviou o dinheiro (conta de origem, "pagador", "remetente", "debitado de"). O BENEFICIÁRIO é quem recebeu (construtora, incorporadora, "favorecido").
- O documento do pagador é o que importa: CPF (11 dígitos) ou CNPJ (14 dígitos). Copie exatamente como está, com pontuação, ou null se não aparecer. Um CPF/CNPJ parcialmente mascarado (***.456.789-**) também serve: copie como está.
- Valores sempre como número decimal (1234.56), sem "R$" e sem separador de milhar. Datas sempre em YYYY-MM-DD.
- Se houver mais de um valor, "amount" é o VALOR PAGO/TRANSFERIDO, não o valor do boleto nem juros isolados.

Retorne SOMENTE um JSON válido (sem markdown, sem explicações) com esta estrutura:
{
    "amount": "valor pago, ex: 6129.67, ou null",
    "paid_on": "data do pagamento (YYYY-MM-DD) ou null",
    "payer_name": "nome do pagador ou null",
    "payer_document": "CPF ou CNPJ do pagador, como aparece, ou null",
    "payee_name": "nome do beneficiário ou null",
    "description": "descrição/identificação do pagamento no comprovante (até 200 caracteres) ou null"
}`;

export interface ExtractedReceipt {
    amount: number | null;
    paid_on: string | null;
    payer_name: string | null;
    payer_document: string | null;
    /** From the payer's document: PF for a CPF, PJ for a CNPJ, null when it could not be told. */
    payer_type: "PF" | "PJ" | null;
    payee_name: string | null;
    description: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})/;
const NULLISH = new Set(["null", "undefined", "n/a", "na", "não consta", "nao consta", "não informado", "nao informado", "-"]);

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
    const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : t.slice(0, 10);
    if (!ISO_DATE.test(iso)) return null;
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

function money(v: unknown): number | null {
    if (v == null || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) && v > 0 ? round2(v) : null;
    if (typeof v !== "string") return null;
    const n = parseCurrencyBR(v);
    return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

/**
 * PF or PJ from a CPF or CNPJ, however the receipt wrote it.
 *
 * Banks mask part of the number ("***.456.789-**", "12.345.678/****-**"), so the digits are not
 * enough on their own: a masked CPF has fewer than 11 of them. What survives masking is the
 * punctuation pattern — a slash is only ever in a CNPJ — and the total length of the masked
 * string, 14 characters for a CPF and 18 for a CNPJ. Digits alone decide only when unmasked.
 */
export function payerTypeFromDocument(document: string | null | undefined): "PF" | "PJ" | null {
    if (!document) return null;
    const raw = document.trim();
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11 && !raw.includes("/")) return "PF";
    if (digits.length === 14) return "PJ";
    if (raw.includes("/")) return "PJ";
    const masked = raw.replace(/\s/g, "");
    if (/^[\d*]{3}\.[\d*]{3}\.[\d*]{3}-[\d*]{2}$/.test(masked)) return "PF";
    if (/^[\d*]{2}\.[\d*]{3}\.[\d*]{3}\/[\d*]{4}-[\d*]{2}$/.test(masked)) return "PJ";
    return null;
}

export function normalizeReceiptExtraction(raw: unknown): ExtractedReceipt {
    const r = (raw ?? {}) as Record<string, unknown>;
    const payerDocument = text(r.payer_document, 40);
    return {
        amount: money(r.amount),
        paid_on: isoDate(r.paid_on),
        payer_name: text(r.payer_name, 120),
        payer_document: payerDocument,
        payer_type: payerTypeFromDocument(payerDocument),
        payee_name: text(r.payee_name, 120),
        description: text(r.description, 200),
    };
}

/** True when the model read nothing a row could use. */
export function isEmptyReceipt(r: ExtractedReceipt): boolean {
    return r.amount === null && r.paid_on === null && r.payer_document === null && r.payer_name === null;
}

export interface ReceiptAllocation {
    /** Σ amounts of every receipt that carried one. */
    total: number;
    pf: number;
    pj: number;
    /** PF, PJ or SPLIT when every receipt with an amount could be attributed; null otherwise. */
    payer: Payer | null;
    /** The latest payment date among the receipts — the day the instalment was settled. */
    paid_on: string | null;
    /** Receipts whose payer could not be told; their amount is in `total` but in neither share. */
    unattributed: number;
}

/**
 * The split a set of receipts implies for one instalment.
 *
 * Each receipt's amount goes to the side its payer's document says. A receipt the reader could not
 * attribute keeps the total honest but leaves the payer undecided — better a row that says "não
 * informado" than one that quietly puts the company's money on the person.
 */
export function allocateFromReceipts(receipts: ExtractedReceipt[]): ReceiptAllocation {
    let pf = 0, pj = 0, unattributed = 0, total = 0;
    let paidOn: string | null = null;
    for (const r of receipts) {
        if (r.paid_on && (!paidOn || r.paid_on > paidOn)) paidOn = r.paid_on;
        if (r.amount === null) continue;
        total = round2(total + r.amount);
        if (r.payer_type === "PF") pf = round2(pf + r.amount);
        else if (r.payer_type === "PJ") pj = round2(pj + r.amount);
        else unattributed = round2(unattributed + r.amount);
    }
    const payer: Payer | null =
        unattributed > 0 || total === 0 ? null : pf > 0 && pj > 0 ? "SPLIT" : pj > 0 ? "PJ" : "PF";
    return { total, pf, pj, payer, paid_on: paidOn, unattributed };
}
