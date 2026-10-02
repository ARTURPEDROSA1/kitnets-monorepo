/**
 * What goes to Banco Inter to issue a charge ("boleto com Pix") for an invoice, and what comes back —
 * the pure half of the issuing (lib/billing/charges-server.ts does the talking).
 *
 * API Cobrança v3 (developers.inter.co → API Cobrança (Boleto com Pix)):
 *   POST /cobranca/v3/cobrancas      seuNumero (≤ 15), valorNominal (≥ 2,50), dataVencimento, numDiasAgenda (0–60),
 *                                    pagador, multa, mora, mensagem → { codigoSolicitacao }; the charge is made
 *                                    asynchronously (EM_PROCESSAMENTO for a moment)
 *   GET  /cobranca/v3/cobrancas/{id} cobranca { situacao, dataSituacao, valorTotalRecebido, origemRecebimento… },
 *                                    boleto { nossoNumero, codigoBarras, linhaDigitavel }, pix { txid, pixCopiaECola }
 * A charge with today's due date can only be issued until 19h59; the bank also refuses a second charge
 * with the same seuNumero + amount + due date + payer within 30 minutes (its own idempotency).
 */
import type { PayerAddress } from "@/lib/invoice-payer";

/** The bank's own states of a charge. */
export type InterSituacao = "EM_PROCESSAMENTO" | "A_RECEBER" | "ATRASADO" | "RECEBIDO" | "MARCADO_RECEBIDO" | "CANCELADO" | "EXPIRADO" | "FALHA_EMISSAO" | "PROTESTO";

export type ChargeStatus = "REQUESTED" | "OPEN" | "PAID" | "CANCELLED" | "EXPIRED" | "FAILED";

/** The module's reading of the bank's state. */
export function chargeStatusOf(situacao: string | null | undefined): ChargeStatus {
    switch ((situacao ?? "").toUpperCase()) {
        case "EM_PROCESSAMENTO": return "REQUESTED";
        case "A_RECEBER":
        case "ATRASADO":
        case "PROTESTO": return "OPEN";
        case "RECEBIDO":
        case "MARCADO_RECEBIDO": return "PAID";
        case "CANCELADO": return "CANCELLED";
        case "EXPIRADO": return "EXPIRED";
        case "FALHA_EMISSAO": return "FAILED";
        default: return "REQUESTED";
    }
}

export const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
    REQUESTED: "Em processamento no banco",
    OPEN: "Boleto e PIX ativos",
    PAID: "Pago",
    CANCELLED: "Cancelado no banco",
    EXPIRED: "Expirado",
    FAILED: "Falha na emissão",
};

/** Our reference on the bank's side, ≤ 15 characters: the invoice's number, with a suffix when a charge is issued again. */
export function seuNumeroFor(invoiceNumber: number, attempt = 1): string {
    const base = `F${invoiceNumber}`;
    return attempt > 1 ? `${base}-${attempt}`.slice(0, 15) : base.slice(0, 15);
}

export interface ChargeInvoice {
    number: number;
    amount: number;
    due_date: string;
    reference_month: string;
    payer_name: string | null;
    payer_cpf: string | null;
    payer_email: string | null;
    payer_address: PayerAddress | null;
    fine_pct: number | null;
    interest_pct_month: number | null;
    days_payable_after_due: number | null;
    items: Array<{ description: string; amount: number }>;
    unit_name?: string | null;
    property_name?: string | null;
}

export type IssueBlocker = "NO_CPF" | "NO_ADDRESS" | "AMOUNT_TOO_LOW" | "DUE_DATE_PASSED" | "TERMS_UNDECIDED";

export const ISSUE_BLOCKER_LABELS: Record<IssueBlocker, string> = {
    NO_CPF: "o pagador não tem CPF válido",
    NO_ADDRESS: "o endereço do pagador está incompleto (rua, cidade, UF e CEP)",
    AMOUNT_TOO_LOW: "o banco não emite cobrança abaixo de R$ 2,50",
    DUE_DATE_PASSED: "o vencimento já passou: informe uma nova data",
    TERMS_UNDECIDED: "defina multa, juros e prazo de pagamento em Configuração",
};

/** What keeps the invoice from being issued at the bank on `today`. */
export function issueBlockers(invoice: ChargeInvoice, today: string): IssueBlocker[] {
    const out: IssueBlocker[] = [];
    if (!invoice.payer_cpf || !/^\d{11}$|^\d{14}$/.test(invoice.payer_cpf)) out.push("NO_CPF");
    const a = invoice.payer_address;
    if (!a || !a.street || !a.city || a.state.length !== 2 || a.cep.length !== 8) out.push("NO_ADDRESS");
    if (invoice.amount < 2.5) out.push("AMOUNT_TOO_LOW");
    if (invoice.due_date < today) out.push("DUE_DATE_PASSED");
    if (invoice.fine_pct === null || invoice.interest_pct_month === null || invoice.days_payable_after_due === null) out.push("TERMS_UNDECIDED");
    return out;
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthLabel = (iso: string) => { const [y, m] = iso.split("-").map(Number); return `${MONTHS[m - 1]}/${y}`; };
const ascii = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const line = (s: string, max = 78) => ascii(s).replace(/\s+/g, " ").trim().slice(0, max);
const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

export interface InterChargePayload {
    seuNumero: string;
    valorNominal: number;
    dataVencimento: string;
    numDiasAgenda: number;
    pagador: Record<string, string>;
    multa?: { codigo: "PERCENTUAL"; taxa: number };
    mora?: { codigo: "TAXAMENSAL"; taxa: number };
    mensagem: Record<string, string>;
    formasRecebimento: ["BOLETO", "PIX"];
}

/** The body of POST /cobranca/v3/cobrancas for an invoice. Call `issueBlockers` first. */
export function buildChargePayload(invoice: ChargeInvoice, seuNumero: string, dueDate = invoice.due_date): InterChargePayload {
    const a = invoice.payer_address!;
    const cpf = invoice.payer_cpf ?? "";
    const pagador: Record<string, string> = {
        cpfCnpj: cpf,
        tipoPessoa: cpf.length === 14 ? "JURIDICA" : "FISICA",
        nome: line(invoice.payer_name ?? "", 100),
        endereco: line(a.street, 100),
        cidade: line(a.city, 60),
        uf: a.state.toUpperCase(),
        cep: a.cep,
    };
    if (a.number) pagador.numero = line(a.number, 10);
    if (a.complement) pagador.complemento = line(a.complement, 30);
    if (a.neighborhood) pagador.bairro = line(a.neighborhood, 60);
    if (invoice.payer_email) pagador.email = invoice.payer_email.trim().slice(0, 50);

    const place = [invoice.property_name, invoice.unit_name].filter(Boolean).join(" - ");
    const lines = [
        `Fatura n. ${invoice.number} - referencia ${monthLabel(invoice.reference_month)}`,
        ...invoice.items.slice(0, 3).map(i => `${i.description}: ${brl(i.amount)}`),
        place ? `Imovel: ${place}` : "",
    ].filter(Boolean).slice(0, 5);
    const mensagem: Record<string, string> = {};
    lines.forEach((text, i) => { mensagem[`linha${i + 1}`] = line(text); });

    const payload: InterChargePayload = {
        seuNumero,
        valorNominal: Math.round(invoice.amount * 100) / 100,
        dataVencimento: dueDate,
        numDiasAgenda: Math.min(60, Math.max(0, Math.round(invoice.days_payable_after_due ?? 0))),
        pagador,
        mensagem,
        formasRecebimento: ["BOLETO", "PIX"],
    };
    if ((invoice.fine_pct ?? 0) > 0) payload.multa = { codigo: "PERCENTUAL", taxa: invoice.fine_pct as number };
    if ((invoice.interest_pct_month ?? 0) > 0) payload.mora = { codigo: "TAXAMENSAL", taxa: invoice.interest_pct_month as number };
    return payload;
}

export interface InterChargeState {
    situacao: string;
    status: ChargeStatus;
    /** `YYYY-MM-DD` of the bank's last state change (the payment date when paid) */
    stateDate: string | null;
    receivedAmount: number | null;
    /** BOLETO or PIX when paid */
    receivedVia: "BOLETO" | "PIX" | null;
    nossoNumero: string | null;
    barcode: string | null;
    digitableLine: string | null;
    pixTxid: string | null;
    pixCopyPaste: string | null;
}

const text = (v: unknown, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** The bank's answer to GET /cobranca/v3/cobrancas/{id}, read into the module's terms. */
export function parseChargeState(json: Record<string, unknown>): InterChargeState {
    const cobranca = (json.cobranca ?? {}) as Record<string, unknown>;
    const boleto = (json.boleto ?? {}) as Record<string, unknown>;
    const pix = (json.pix ?? {}) as Record<string, unknown>;
    const situacao = text(cobranca.situacao, 40) ?? "";
    const received = cobranca.valorTotalRecebido == null || cobranca.valorTotalRecebido === "" ? null : Number(cobranca.valorTotalRecebido);
    const via = text(cobranca.origemRecebimento, 20)?.toUpperCase();
    return {
        situacao,
        status: chargeStatusOf(situacao),
        stateDate: text(cobranca.dataSituacao, 30)?.slice(0, 10) ?? null,
        receivedAmount: received !== null && Number.isFinite(received) ? Math.round(received * 100) / 100 : null,
        receivedVia: via === "BOLETO" || via === "PIX" ? via : null,
        nossoNumero: text(boleto.nossoNumero, 40),
        barcode: text(boleto.codigoBarras, 60),
        digitableLine: text(boleto.linhaDigitavel, 60),
        pixTxid: text(pix.txid, 60),
        pixCopyPaste: text(pix.pixCopiaECola, 1000),
    };
}

/** One entry of the webhook's array, as far as the module trusts it: which charge, and that something changed. */
export function parseCallbackEntry(raw: unknown): { codigoSolicitacao: string; situacao: string; at: string | null } | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const codigo = text(o.codigoSolicitacao, 80);
    if (!codigo) return null;
    return { codigoSolicitacao: codigo, situacao: text(o.situacao, 40) ?? "", at: text(o.dataHoraSituacao, 40) };
}
