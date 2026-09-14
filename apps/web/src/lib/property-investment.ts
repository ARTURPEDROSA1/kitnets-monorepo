/**
 * Investment side of a property — pure helpers shared by the API, the UI
 * and the Excel template.
 *
 * property_investments  : purchase price / date / area + financing header
 * property_transactions : dated outflows, one kind each (all amounts ≥ 0)
 *
 *   invested (imóvel) = ENTRADA + CUSTOS_AQUISICAO + PRESTACAO + AMORTIZACAO + QUITACAO + REFORMA
 *   custos do imóvel  = TARIFA + IPTU + UTILIDADES + OUTROS   (running costs, not investment)
 *   energia solar     = ENERGIA_SOLAR — its own cost centre, paid back by
 *                       net energy income (energy − energy cost) from the income ledger
 */
import {
    breakdown,
    parseDateCell,
    parseMoney,
    parseMonthCell,
    round2,
    type ParsedSheet,
    type PropertyIncomeRow,
} from "./property-income";

export type TransactionKind =
    | "ENTRADA"
    | "CUSTOS_AQUISICAO"
    | "PRESTACAO"
    | "AMORTIZACAO"
    | "QUITACAO"
    | "TARIFA"
    | "IPTU"
    | "UTILIDADES"
    | "REFORMA"
    | "ENERGIA_SOLAR"
    | "OUTROS";

export type TransactionGroup = "AQUISICAO" | "FINANCIAMENTO" | "CAPEX" | "CUSTOS" | "ENERGIA";

export const TRANSACTION_KINDS: ReadonlyArray<{ kind: TransactionKind; label: string; group: TransactionGroup; hint: string }> = [
    { kind: "ENTRADA", label: "Entrada", group: "AQUISICAO", hint: "Valor pago ao vendedor na compra (sinal + entrada)" },
    { kind: "CUSTOS_AQUISICAO", label: "Custos de aquisição", group: "AQUISICAO", hint: "ITBI, registro, escritura, corretagem, avaliação" },
    { kind: "PRESTACAO", label: "Prestação", group: "FINANCIAMENTO", hint: "Parcela mensal do financiamento (juros + amortização + seguros + tarifa)" },
    { kind: "AMORTIZACAO", label: "Amortização extra", group: "FINANCIAMENTO", hint: "Pagamento extraordinário que reduz o saldo devedor" },
    { kind: "QUITACAO", label: "Quitação", group: "FINANCIAMENTO", hint: "Pagamento final do saldo devedor" },
    { kind: "TARIFA", label: "Tarifa bancária", group: "CUSTOS", hint: "Tarifas da conta usada para pagar o financiamento" },
    { kind: "IPTU", label: "IPTU", group: "CUSTOS", hint: "IPTU pago pelo proprietário" },
    { kind: "UTILIDADES", label: "Utilidades", group: "CUSTOS", hint: "Água, luz, gás pagos pelo proprietário (vacância etc.)" },
    { kind: "REFORMA", label: "Reforma", group: "CAPEX", hint: "Obras, melhorias e equipamentos que ficam no imóvel" },
    { kind: "ENERGIA_SOLAR", label: "Energia solar", group: "ENERGIA", hint: "Investimento no sistema fotovoltaico (centro de energia)" },
    { kind: "OUTROS", label: "Outros", group: "CUSTOS", hint: "Outros custos do imóvel" },
];

export const KIND_LABELS: Record<TransactionKind, string> = Object.fromEntries(
    TRANSACTION_KINDS.map(k => [k.kind, k.label])
) as Record<TransactionKind, string>;

export const KIND_GROUP: Record<TransactionKind, TransactionGroup> = Object.fromEntries(
    TRANSACTION_KINDS.map(k => [k.kind, k.group])
) as Record<TransactionKind, TransactionGroup>;

export const TRANSACTION_KIND_VALUES = TRANSACTION_KINDS.map(k => k.kind) as TransactionKind[];

const strip = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Accepts the kind code, its label, or common spreadsheet spellings ("Parc Cred Imob", "Amortizacao", …). */
export function kindFromText(text: string | null | undefined): TransactionKind | null {
    if (!text) return null;
    const t = strip(String(text));
    if (!t) return null;
    for (const k of TRANSACTION_KINDS) {
        if (t === strip(k.kind) || t === strip(k.label)) return k.kind;
    }
    if (/^entrada|sinal|down ?payment/.test(t)) return "ENTRADA";
    if (/itbi|registro|escritura|corretag|custos? de aquisic|closing/.test(t)) return "CUSTOS_AQUISICAO";
    if (/quitac|payoff|liquidac/.test(t)) return "QUITACAO";
    if (/amortiz|ant par|prepay/.test(t)) return "AMORTIZACAO";
    if (/prestac|parc cred|prest fin|parcela|installment|fin imob/.test(t)) return "PRESTACAO";
    if (/tarifa|cesta|bank fee/.test(t)) return "TARIFA";
    if (/iptu/.test(t)) return "IPTU";
    if (/utilidade|agua|luz|gas|utilit/.test(t)) return "UTILIDADES";
    if (/reforma|obra|melhoria|equipamento|capex|renov/.test(t)) return "REFORMA";
    if (/solar|fotovolt|energia/.test(t)) return "ENERGIA_SOLAR";
    if (/outro|other/.test(t)) return "OUTROS";
    return null;
}

export type FinancingSystem = "SAC" | "PRICE" | "OTHER";
export type FinancingStatus = "NONE" | "ACTIVE" | "PAID_OFF";
export type TransactionSource = "MANUAL" | "IMPORT" | "BANK";

export interface PropertyInvestment {
    property_id: string;
    purchase_price: number;
    acquired_on: string | null;
    built_area_m2: number | null;
    lender: string | null;
    contract_number: string | null;
    financing_system: FinancingSystem | null;
    principal: number | null;
    annual_rate: number | null;
    term_months: number | null;
    contract_date: string | null;
    first_due_date: string | null;
    financing_status: FinancingStatus;
    paid_off_on: string | null;
    notes: string | null;
    created_at?: string;
    updated_at?: string;
}

export type PropertyInvestmentInput = Partial<Omit<PropertyInvestment, "property_id" | "created_at" | "updated_at">>;

export interface PropertyTransaction {
    id: string;
    property_id: string;
    /** `YYYY-MM-DD` */
    occurred_on: string;
    kind: TransactionKind;
    amount: number;
    interest_part: number | null;
    principal_part: number | null;
    insurance_part: number | null;
    comment: string | null;
    source: TransactionSource;
    bank_reference: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface TransactionInput {
    /** present → update that row; absent → insert */
    id?: string;
    occurred_on: string;
    kind: TransactionKind;
    amount: number;
    interest_part?: number | null;
    principal_part?: number | null;
    insurance_part?: number | null;
    comment?: string | null;
    source?: TransactionSource;
}

// ───────────────────────────────────────────────────────────────────────────
// Excel template
// ───────────────────────────────────────────────────────────────────────────

export const INVESTMENT_TEMPLATE_SHEET = "Investimento";

export const INVESTMENT_TEMPLATE_HEADERS = [
    "Data (dd/mm/aaaa)",
    "Tipo",
    "Valor (R$)",
    "Juros (R$)",
    "Amortização (R$)",
    "Seguro (R$)",
    "Comentários",
] as const;

const normHeader = (s: string) => strip(s);

export function isInvestmentTemplate(headers: string[]): boolean {
    return INVESTMENT_TEMPLATE_HEADERS.every((h, i) => normHeader(headers[i] ?? "") === normHeader(h));
}

export interface TransactionImportResult {
    rows: TransactionInput[];
    /** Lines that could not be imported and why (shown to the user; the rest still imports). */
    errors: string[];
}

/**
 * Turns a parsed template sheet (Data · Tipo · Valor · Juros · Amortização ·
 * Seguro · Comentários) into transaction rows. Lines without a date or an
 * amount are skipped silently; lines with an unknown Tipo are reported.
 */
export function buildTransactionImportRows(sheet: ParsedSheet): TransactionImportResult {
    const rows: TransactionInput[] = [];
    const errors: string[] = [];
    const col = (name: string) => {
        const target = normHeader(name);
        return sheet.headers.findIndex(h => normHeader(h).startsWith(target));
    };
    const cDate = sheet.dateColumn >= 0 ? sheet.dateColumn : col("Data");
    const cKind = col("Tipo");
    const cAmount = col("Valor");
    const cInterest = col("Juros");
    const cPrincipal = col("Amortiza");
    const cInsurance = col("Seguro");
    const cComment = col("Coment");
    if (cDate < 0 || cKind < 0 || cAmount < 0) {
        return { rows, errors: ["A planilha precisa das colunas Data, Tipo e Valor."] };
    }

    for (const r of sheet.rows) {
        const dateCell = r.cells[cDate];
        const iso = parseDateCell(dateCell) ?? (parseMonthCell(dateCell) ? `${parseMonthCell(dateCell)}-01` : null);
        const amount = parseMoney(r.cells[cAmount]);
        const kindText = r.cells[cKind];
        if (!iso && amount === null && !kindText) continue;          // blank line
        if (!iso) { errors.push(`Linha ${r.line}: data inválida "${dateCell ?? ""}"`); continue; }
        if (amount === null) continue;                                  // no amount → nothing to record
        const kind = kindFromText(kindText);
        if (!kind) { errors.push(`Linha ${r.line}: tipo desconhecido "${kindText ?? ""}"`); continue; }
        const part = (i: number) => (i >= 0 ? parseMoney(r.cells[i]) : null);
        const comment = cComment >= 0 ? (r.cells[cComment] ?? "").trim().slice(0, 500) : "";
        rows.push({
            occurred_on: iso,
            kind,
            amount: Math.abs(amount),
            interest_part: part(cInterest) !== null ? Math.abs(part(cInterest)!) : null,
            principal_part: part(cPrincipal) !== null ? Math.abs(part(cPrincipal)!) : null,
            insurance_part: part(cInsurance) !== null ? Math.abs(part(cInsurance)!) : null,
            comment: comment || null,
            source: "IMPORT",
        });
    }
    rows.sort((a, b) => (a.occurred_on < b.occurred_on ? -1 : 1));
    return { rows, errors };
}

// ───────────────────────────────────────────────────────────────────────────
// Summaries
// ───────────────────────────────────────────────────────────────────────────

export interface InvestmentSummary {
    byKind: Record<TransactionKind, number>;
    downPayment: number;
    closingCosts: number;
    /** PRESTACAO + AMORTIZACAO + QUITACAO */
    bankPaid: number;
    installments: number;
    /** Σ known interest + insurance parts, else bankPaid − principal when the loan is paid off, else null */
    interestAndInsurance: number | null;
    capex: number;
    /** TARIFA + IPTU + UTILIDADES + OUTROS */
    runningCosts: number;
    /** ENTRADA + CUSTOS_AQUISICAO + bankPaid + capex — the property's cost basis */
    invested: number;
    /** invested + runningCosts — everything the owner has paid out */
    totalOutlay: number;
    solarInvested: number;
    firstDate: string | null;
    lastDate: string | null;
    count: number;
}

export function summarizeInvestment(txs: PropertyTransaction[], inv: PropertyInvestment | null): InvestmentSummary {
    const byKind = Object.fromEntries(TRANSACTION_KIND_VALUES.map(k => [k, 0])) as Record<TransactionKind, number>;
    let installments = 0;
    let knownParts = 0;
    let hasParts = false;
    let first: string | null = null;
    let last: string | null = null;
    for (const t of txs) {
        const amt = Number(t.amount) || 0;
        byKind[t.kind] = round2(byKind[t.kind] + amt);
        if (t.kind === "PRESTACAO") installments++;
        if (KIND_GROUP[t.kind] === "FINANCIAMENTO" && (t.interest_part !== null || t.insurance_part !== null)) {
            hasParts = true;
            knownParts += (Number(t.interest_part) || 0) + (Number(t.insurance_part) || 0);
        }
        if (!first || t.occurred_on < first) first = t.occurred_on;
        if (!last || t.occurred_on > last) last = t.occurred_on;
    }
    const bankPaid = round2(byKind.PRESTACAO + byKind.AMORTIZACAO + byKind.QUITACAO);
    const capex = byKind.REFORMA;
    const runningCosts = round2(byKind.TARIFA + byKind.IPTU + byKind.UTILIDADES + byKind.OUTROS);
    const invested = round2(byKind.ENTRADA + byKind.CUSTOS_AQUISICAO + bankPaid + capex);
    let interestAndInsurance: number | null = null;
    if (hasParts) interestAndInsurance = round2(knownParts);
    else if (inv?.financing_status === "PAID_OFF" && inv.principal && bankPaid > 0) {
        interestAndInsurance = round2(bankPaid - Number(inv.principal));
    }
    return {
        byKind,
        downPayment: byKind.ENTRADA,
        closingCosts: byKind.CUSTOS_AQUISICAO,
        bankPaid,
        installments,
        interestAndInsurance,
        capex,
        runningCosts,
        invested,
        totalOutlay: round2(invested + runningCosts),
        solarInvested: byKind.ENERGIA_SOLAR,
        firstDate: first,
        lastDate: last,
        count: txs.length,
    };
}

export interface SolarPayback {
    invested: number;
    /** Σ (energy income − energy cost) over confirmed ledger months */
    recovered: number;
    pct: number;
    remaining: number;
    months: number;
}

/** The solar system is its own cost centre: paid back by net energy income from the rent ledger. */
export function solarPayback(solarInvested: number, incomeRows: PropertyIncomeRow[]): SolarPayback {
    const confirmed = incomeRows.filter(r => r.status === "CONFIRMED");
    const recovered = round2(confirmed.reduce((acc, r) => {
        const b = breakdown(r);
        return acc + b.energy - b.other;
    }, 0));
    const invested = round2(solarInvested);
    return {
        invested,
        recovered,
        pct: invested > 0 ? Math.round((recovered / invested) * 1000) / 10 : 0,
        remaining: round2(Math.max(0, invested - recovered)),
        months: confirmed.length,
    };
}

// ───────────────────────────────────────────────────────────────────────────
// Financing: estimate the interest / amortisation / insurance split of each
// payment from the contract terms and the actual payments, in date order.
// ───────────────────────────────────────────────────────────────────────────

export interface FinancingSplit {
    id: string;
    occurred_on: string;
    kind: TransactionKind;
    amount: number;
    interest_part: number;
    principal_part: number;
    insurance_part: number;
    /** outstanding balance after this payment */
    balance_after: number;
    /** true when the row already had a split and `overwrite` was false (kept as is) */
    kept: boolean;
}

export interface FinancingEstimate {
    splits: FinancingSplit[];
    /** rows whose parts change (inputs ready for PUT) */
    updates: TransactionInput[];
    totals: { interest: number; principal: number; insurance: number; paid: number };
    endingBalance: number;
    notes: string[];
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const pricePayment = (balance: number, r: number, n: number) => (r === 0 ? balance / n : (balance * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));

/**
 * Walks PRESTACAO / AMORTIZACAO / QUITACAO rows chronologically:
 *   interest     = balance × nominal rate / 12 (first instalment pro-rata by days from the contract date)
 *   amortisation = SAC: balance ÷ remaining months · PRICE: payment − interest (recomputed on the current balance),
 *                  times a calibration factor k (see below)
 *   insurance    = payment − interest − amortisation (MIP + DFI + fees), floored at 0
 *   charges dated before the first due date (month-zero fees/insurance) are fees only
 *   extra amortisations reduce the balance in full; the instalment is recomputed ("reduce instalment")
 *   the payoff clears the balance; any excess is interest/fees
 *
 * Calibration: when the loan is paid off and a QUITACAO row exists, the total principal is known
 * (it must equal the financed amount), so k is solved by bisection so that the balance right
 * before the payoff equals the payoff amount. Without a payoff, k = 1.
 *
 * Rows that already carry a split are kept unless `overwrite` is true (their principal still moves the balance).
 * The estimate is meant to be reviewed: every value stays editable in the table.
 */
export function estimateFinancingSplits(
    inv: PropertyInvestment | null,
    txs: PropertyTransaction[],
    opts: { overwrite?: boolean } = {}
): FinancingEstimate {
    const empty = (note: string): FinancingEstimate =>
        ({ splits: [], updates: [], totals: { interest: 0, principal: 0, insurance: 0, paid: 0 }, endingBalance: 0, notes: [note] });
    if (!inv || !inv.principal || !inv.annual_rate || !inv.term_months) {
        return empty("Preencha valor financiado, juros nominal e prazo em “Aquisição & financiamento”.");
    }
    const rows = txs
        .filter(t => KIND_GROUP[t.kind] === "FINANCIAMENTO")
        .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    if (rows.length === 0) return empty("Nenhuma prestação, amortização ou quitação registrada.");

    const principal0 = round2(Number(inv.principal));
    const monthlyRate = inv.annual_rate / 100 / 12;
    const dailyRate = inv.annual_rate / 100 / 360;
    const system = inv.financing_system ?? "SAC";
    const firstDue = inv.first_due_date ?? null;
    const payoffIdx = rows.findIndex(t => t.kind === "QUITACAO");

    const walk = (k: number) => {
        let balance = principal0;
        let remaining = inv.term_months!;
        let first = true;
        let balanceBeforePayoff: number | null = null;
        const splits: FinancingSplit[] = [];
        const notes: string[] = [];
        const totals = { interest: 0, principal: 0, insurance: 0, paid: 0 };

        rows.forEach((t, idx) => {
            const amount = round2(Number(t.amount) || 0);
            const hasParts = t.interest_part !== null || t.principal_part !== null || t.insurance_part !== null;
            const keep = hasParts && !opts.overwrite;
            let interest = 0, principal = 0, insurance = 0;

            if (keep) {
                interest = Number(t.interest_part) || 0;
                insurance = Number(t.insurance_part) || 0;
                principal = t.principal_part !== null ? Number(t.principal_part) || 0 : Math.max(0, amount - interest - insurance);
                if (t.kind === "PRESTACAO") { remaining = Math.max(1, remaining - 1); first = false; }
            } else if (t.kind === "PRESTACAO") {
                if (firstDue && t.occurred_on < firstDue) {
                    // Month-zero charges (TAC, first insurance) before the first instalment: no interest, no amortisation.
                    insurance = amount;
                    notes.push(`${formatDateBR(t.occurred_on)}: cobrança anterior à 1ª prestação — tratada como tarifas/seguro.`);
                } else if (balance <= 0) {
                    interest = amount;
                    notes.push(`${formatDateBR(t.occurred_on)}: prestação após o saldo zerar — tratada como juros/encargos.`);
                } else {
                    const days = first && inv.contract_date ? daysBetween(inv.contract_date, t.occurred_on) : 0;
                    interest = round2(balance * (first && days > 0 ? dailyRate * days : monthlyRate));
                    let scheduled = system === "PRICE" ? pricePayment(balance, monthlyRate, remaining) - interest : balance / Math.max(1, remaining);
                    scheduled = round2(Math.min(Math.max(scheduled * k, 0), balance, Math.max(0, amount - interest)));
                    insurance = round2(amount - interest - scheduled);
                    if (amount < interest) {
                        interest = amount;
                        insurance = 0;
                        notes.push(`${formatDateBR(t.occurred_on)}: prestação (${amount.toFixed(2)}) menor que os juros estimados — confira o valor.`);
                    }
                    principal = scheduled;
                    remaining = Math.max(1, remaining - 1);
                    first = false;
                }
            } else if (t.kind === "AMORTIZACAO") {
                principal = round2(Math.min(amount, balance));
                interest = round2(amount - principal);
            } else {
                if (idx === payoffIdx) balanceBeforePayoff = balance;
                principal = round2(Math.min(amount, balance));
                interest = round2(amount - principal);
            }

            balance = round2(Math.max(0, balance - principal));
            totals.interest = round2(totals.interest + interest);
            totals.principal = round2(totals.principal + principal);
            totals.insurance = round2(totals.insurance + insurance);
            totals.paid = round2(totals.paid + amount);
            splits.push({ id: t.id, occurred_on: t.occurred_on, kind: t.kind, amount, interest_part: interest, principal_part: principal, insurance_part: insurance, balance_after: balance, kept: keep });
        });
        return { splits, totals, notes, balance, balanceBeforePayoff };
    };

    // ── Calibration (paid-off loans with a QUITACAO row) ─────────────────────
    // Total principal must equal the financed amount, so juros + seguros over the
    // whole loan = paid − financed. Scale every instalment's interest and insurance
    // by the same factor and move the difference into amortisation, then replay the
    // balance so the payoff clears it exactly.
    const r = walk(1);
    let splits = r.splits;
    const notes = [...new Set(r.notes)];
    let balanceFinal = r.balance;
    let totals = r.totals;
    if (inv.financing_status === "PAID_OFF" && payoffIdx >= 0 && r.balanceBeforePayoff !== null) {
        const payoff = round2(Number(rows[payoffIdx].amount) || 0);
        const residual = round2(r.balanceBeforePayoff - payoff);
        // Only instalments after the first extra amortisation are uncertain (the SAC/PRICE schedule
        // reproduces the bank exactly until then); month-zero charges are fees and stay untouched.
        const firstPrepayIdx = rows.findIndex(t => t.kind === "AMORTIZACAO");
        const adjustable = splits.filter((sp, i) =>
            sp.kind === "PRESTACAO" && !sp.kept && i < payoffIdx
            && (firstPrepayIdx < 0 || i > firstPrepayIdx)
            && (!firstDue || sp.occurred_on >= firstDue)
        );
        const pool = adjustable.reduce((a, sp) => a + sp.interest_part + sp.insurance_part, 0);
        if (residual > 1 && pool > 0) {
            const f = Math.max(0, 1 - residual / pool);
            if (f === 0) {
                notes.push(`Mesmo zerando juros e seguros das prestações, sobra saldo de ${round2(residual - pool).toFixed(2)} na quitação — confira valor financiado, amortizações e quitação.`);
            } else {
                notes.unshift(`Juros e seguros estimados das prestações reduzidos em ${((1 - f) * 100).toFixed(1)}% para que a amortização total feche com o valor financiado (juros + seguros reais = pago − financiado).`);
            }
            const adjusted = new Set(adjustable.map(sp => sp.id));
            let balance = principal0;
            totals = { interest: 0, principal: 0, insurance: 0, paid: 0 };
            splits = splits.map((sp, i) => {
                let { interest_part: interest, principal_part: principal, insurance_part: insurance } = sp;
                if (adjusted.has(sp.id)) {
                    interest = round2(interest * f);
                    insurance = round2(insurance * f);
                    principal = round2(Math.min(balance, Math.max(0, sp.amount - interest - insurance)));
                    insurance = round2(sp.amount - interest - principal);
                } else if (sp.kind === "AMORTIZACAO" && !sp.kept) {
                    principal = round2(Math.min(sp.amount, balance));
                    interest = round2(sp.amount - principal);
                } else if (i === payoffIdx && !sp.kept) {
                    principal = round2(Math.min(sp.amount, balance));
                    interest = round2(sp.amount - principal);
                }
                balance = round2(Math.max(0, balance - principal));
                totals.interest = round2(totals.interest + interest);
                totals.principal = round2(totals.principal + principal);
                totals.insurance = round2(totals.insurance + insurance);
                totals.paid = round2(totals.paid + sp.amount);
                return { ...sp, interest_part: interest, principal_part: principal, insurance_part: insurance, balance_after: balance };
            });
            balanceFinal = balance;
        }
    }
    if (inv.financing_status === "PAID_OFF" && balanceFinal > 1) {
        notes.push(`Saldo estimado após a quitação: ${balanceFinal.toFixed(2)}. Ajuste a amortização nas linhas em que souber o valor exato.`);
    }

    const updates: TransactionInput[] = [];
    splits.forEach((sp, i) => {
        const t = rows[i];
        if (sp.kept) return;
        if (t.interest_part !== sp.interest_part || t.principal_part !== sp.principal_part || t.insurance_part !== sp.insurance_part) {
            updates.push({ id: t.id, occurred_on: t.occurred_on, kind: t.kind, amount: t.amount, interest_part: sp.interest_part, principal_part: sp.principal_part, insurance_part: sp.insurance_part, comment: t.comment, source: t.source });
        }
    });
    return { splits, updates, totals, endingBalance: balanceFinal, notes };
}

export function formatDateBR(iso: string | null | undefined): string {
    if (!iso) return "—";
    const [y, m, d] = iso.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
}
