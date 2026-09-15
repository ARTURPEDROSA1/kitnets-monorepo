/**
 * Investment side of a property — pure helpers shared by the API, the UI
 * and the Excel template.
 *
 * property_investments  : purchase price / date / area + financing header
 * property_transactions : dated outflows, one kind each (all amounts ≥ 0)
 *
 *   invested (imóvel) = everything paid: ENTRADA + CUSTOS_AQUISICAO + PRESTACAO + AMORTIZACAO + QUITACAO + TARIFA
 *                       + REFORMA + UTILIDADES + OUTROS + ENERGIA_SOLAR (landlord taxes from Tributos do imóvel are added by the UI/engine)
 *   custos do imóvel  = UTILIDADES + OUTROS   (reported; part of invested)
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

export const TRANSACTION_KINDS: ReadonlyArray<{ kind: TransactionKind; label: string; group: TransactionGroup; hint: string; hidden?: boolean }> = [
    { kind: "ENTRADA", label: "Entrada", group: "AQUISICAO", hint: "Valor pago ao vendedor na compra (sinal + entrada)" },
    { kind: "CUSTOS_AQUISICAO", label: "Custos de aquisição", group: "AQUISICAO", hint: "ITBI, registro, escritura, corretagem, avaliação" },
    { kind: "PRESTACAO", label: "Prestação", group: "FINANCIAMENTO", hint: "Parcela mensal do financiamento (juros + amortização + seguros + tarifa)" },
    { kind: "AMORTIZACAO", label: "Amortização extra", group: "FINANCIAMENTO", hint: "Pagamento extraordinário que reduz o saldo devedor" },
    { kind: "QUITACAO", label: "Quitação", group: "FINANCIAMENTO", hint: "Pagamento final do saldo devedor" },
    { kind: "TARIFA", label: "Tarifa bancária", group: "FINANCIAMENTO", hint: "Tarifas da conta usada para pagar o financiamento (contam no total investido)" },
    // legacy: taxes live in Tributos do imóvel; kept so old rows still render and "Gerar IPTU dos lançamentos" can migrate them
    { kind: "IPTU", label: "IPTU (legado)", group: "CUSTOS", hint: "Registre o IPTU em Tributos do imóvel", hidden: true },
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
/** Kinds offered in the UI and templates (legacy kinds such as IPTU are hidden). */
export const ACTIVE_TRANSACTION_KINDS = TRANSACTION_KINDS.filter(k => !k.hidden);

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
    if (/iptu/.test(t)) return null;   // taxes are registered in Tributos do imóvel
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
    /** bank's transaction id (OFX FITID) for BANK rows; used to skip duplicates */
    bank_reference?: string | null;
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
        if (!kind) {
            errors.push(/iptu/i.test(kindText ?? "") ? `Linha ${r.line}: IPTU não entra aqui — registre em Tributos do imóvel` : `Linha ${r.line}: tipo desconhecido "${kindText ?? ""}"`);
            continue;
        }
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
    /** UTILIDADES + OUTROS (taxes are tracked in the taxes register) */
    runningCosts: number;
    /** TARIFA */
    bankFees: number;
    /** everything paid: ENTRADA + CUSTOS_AQUISICAO + bankPaid + bankFees + capex + runningCosts + solarInvested (taxes from the register are added by the caller) */
    invested: number;
    /** same as invested (kept for callers) */
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
        if ((t.kind === "PRESTACAO" || t.kind === "AMORTIZACAO" || t.kind === "QUITACAO") && (t.interest_part !== null || t.insurance_part !== null)) {
            hasParts = true;
            knownParts += (Number(t.interest_part) || 0) + (Number(t.insurance_part) || 0);
        }
        if (!first || t.occurred_on < first) first = t.occurred_on;
        if (!last || t.occurred_on > last) last = t.occurred_on;
    }
    const bankPaid = round2(byKind.PRESTACAO + byKind.AMORTIZACAO + byKind.QUITACAO);
    const capex = byKind.REFORMA;
    const runningCosts = round2(byKind.UTILIDADES + byKind.OUTROS);
    const bankFees = byKind.TARIFA;
    const invested = round2(byKind.ENTRADA + byKind.CUSTOS_AQUISICAO + bankPaid + bankFees + capex + runningCosts + byKind.ENERGIA_SOLAR);
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
        bankFees,
        invested,
        totalOutlay: invested,
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
 *   same-day instalment + amortisation: the order is chosen by which scheduled instalment matches the amount paid
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
    // Only the loan itself: bank fees (TARIFA) are investment but not part of the schedule.
    const rows = txs
        .filter(t => t.kind === "PRESTACAO" || t.kind === "AMORTIZACAO" || t.kind === "QUITACAO")
        .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    if (rows.length === 0) return empty("Nenhuma prestação, amortização ou quitação registrada.");
    const byId = new Map(rows.map(t => [t.id, t]));
    const payoffId = rows.find(t => t.kind === "QUITACAO")?.id ?? null;

    const principal0 = round2(Number(inv.principal));
    const monthlyRate = inv.annual_rate / 100 / 12;
    const dailyRate = inv.annual_rate / 100 / 360;
    const system = inv.financing_system ?? "SAC";
    const firstDue = inv.first_due_date ?? null;

    // Same-day groups: an instalment and an extra amortisation on the same date can go either way
    // (the instalment issued for that due date may have been computed before or after the prepayment);
    // the walk picks the order whose scheduled instalment is closer to the amount actually paid.
    const groups: PropertyTransaction[][] = [];
    for (const t of rows) {
        const g = groups[groups.length - 1];
        if (g && g[0].occurred_on === t.occurred_on) g.push(t); else groups.push([t]);
    }

    /**
     * One pass over the rows. Interest is contractual (balance × rate). Insurance (MIP + DFI + admin)
     * is modelled as proportional to the balance, `f × segRate × balance`, where segRate comes from
     * the first regular instalment (where the SAC/PRICE schedule is exact) and `f` is the calibration
     * factor. Amortisation is whatever is left of the payment.
     */
    const walk = (f: number) => {
        let balance = principal0;
        let remaining = inv.term_months!;
        let first = true;
        let segRate: number | null = null;
        let balanceBeforePayoff: number | null = null;
        const splits: FinancingSplit[] = [];
        const notes: string[] = [];
        const totals = { interest: 0, principal: 0, insurance: 0, paid: 0 };

        const scheduledFor = (bal: number, t: PropertyTransaction) => {
            const days = first && inv.contract_date ? daysBetween(inv.contract_date, t.occurred_on) : 0;
            const interest = round2(bal * (first && days > 0 ? dailyRate * days : monthlyRate));
            const amort = system === "PRICE" ? pricePayment(bal, monthlyRate, remaining) - interest : bal / Math.max(1, remaining);
            return { interest, amort };
        };

        for (const g of groups) {
            let items = g;
            const p = g.find(t => t.kind === "PRESTACAO");
            const amorts = g.filter(t => t.kind === "AMORTIZACAO");
            const pKept = p ? (p.interest_part !== null || p.principal_part !== null || p.insurance_part !== null) && !opts.overwrite : false;
            if (p && amorts.length > 0 && !pKept && balance > 0 && (!firstDue || p.occurred_on >= firstDue)) {
                const amount = round2(Number(p.amount) || 0);
                const prepay = amorts.reduce((a, t) => a + Math.min(Number(t.amount) || 0, balance), 0);
                const before = scheduledFor(balance, p), after = scheduledFor(Math.max(0, balance - prepay), p);
                const fitBefore = Math.abs(before.interest + before.amort - amount), fitAfter = Math.abs(after.interest + after.amort - amount);
                const others = g.filter(t => t !== p && t.kind !== "AMORTIZACAO");
                items = fitAfter < fitBefore ? [...amorts, p, ...others] : [p, ...amorts, ...others];
            }

            for (const t of items) {
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
                        const sch = scheduledFor(balance, t);
                        const proRata = first && Boolean(inv.contract_date) && daysBetween(inv.contract_date!, t.occurred_on) > 0;
                        interest = sch.interest;
                        if (amount < interest) {
                            interest = amount;
                            notes.push(`${formatDateBR(t.occurred_on)}: prestação (${amount.toFixed(2)}) menor que os juros estimados — confira o valor.`);
                        } else {
                            if (segRate === null && !proRata) {
                                // first full instalment: the schedule is exact, so the leftover is the real insurance
                                const seg0 = Math.max(0, amount - interest - round2(sch.amort));
                                segRate = balance > 0 ? seg0 / balance : 0;
                            }
                            // pro-rata first instalment (interest by days is approximate): keep the scheduled amortisation
                            insurance = segRate === null
                                ? round2(Math.max(0, amount - interest - round2(sch.amort)))
                                : round2(Math.min(amount - interest, f * segRate * balance));
                            principal = round2(Math.min(balance, Math.max(0, amount - interest - insurance)));
                            insurance = round2(amount - interest - principal);
                        }
                        remaining = Math.max(1, remaining - 1);
                        first = false;
                    }
                } else if (t.kind === "AMORTIZACAO") {
                    principal = round2(Math.min(amount, balance));
                    interest = round2(amount - principal);
                } else {
                    if (t.id === payoffId) balanceBeforePayoff = balance;
                    principal = round2(Math.min(amount, balance));
                    interest = round2(amount - principal);
                }

                balance = round2(Math.max(0, balance - principal));
                totals.interest = round2(totals.interest + interest);
                totals.principal = round2(totals.principal + principal);
                totals.insurance = round2(totals.insurance + insurance);
                totals.paid = round2(totals.paid + amount);
                splits.push({ id: t.id, occurred_on: t.occurred_on, kind: t.kind, amount, interest_part: interest, principal_part: principal, insurance_part: insurance, balance_after: balance, kept: keep });
            }
        }
        return { splits, totals, notes, balance, balanceBeforePayoff };
    };

    // ── Calibration (paid-off loans with a QUITACAO row) ─────────────────────
    // The payoff clears the balance, so the balance right before it must equal the payoff amount.
    // Interest is contractual; the free parameter is the insurance scale `f` (more insurance →
    // less amortisation → higher balance), solved by bisection. Without a payoff, f = 1.
    let f = 1;
    let r = walk(1);
    const notes: string[] = [];
    if (inv.financing_status === "PAID_OFF" && payoffId && r.balanceBeforePayoff !== null) {
        const payoff = round2(Number(byId.get(payoffId)!.amount) || 0);
        const residualAt = (x: number) => { const w = walk(x); return w.balanceBeforePayoff === null ? 0 : w.balanceBeforePayoff - payoff; };
        const r1 = residualAt(1);
        // A payoff larger than the balance already reads as interest/fees; only a leftover balance needs calibration.
        if (r1 > 1) {
            let lo = 0, hi = 1;
            const rLo = residualAt(lo), rHi = residualAt(hi);
            if (rLo > 0) {
                // Even with zero insurance the balance does not close: some principal was paid outside
                // the statement (FGTS, for instance). Keep the modelled insurance and say so.
                notes.push(`Sobra saldo de ${round2(rLo).toFixed(2)} na quitação mesmo sem seguros: provavelmente uma amortização não registrada (FGTS, por exemplo). Cadastre-a como “Amortização extra” e recalcule.`);
                f = 1;
            } else if (rHi <= 0) {
                f = 1;
            } else {
                for (let i = 0; i < 60; i++) {
                    const mid = (lo + hi) / 2;
                    if (residualAt(mid) > 0) hi = mid; else lo = mid;
                    if (hi - lo < 1e-6) break;
                }
                f = (lo + hi) / 2;
                if (Math.abs(f - 1) > 0.05) {
                    notes.push(`Seguros estimados ${f > 1 ? "aumentados" : "reduzidos"} em ${(Math.abs(f - 1) * 100).toFixed(1)}% em relação à 1ª prestação para que a amortização total feche com o valor financiado.`);
                }
            }
            r = walk(f);
        }
    }
    const splits = r.splits;
    const totals = r.totals;
    const balanceFinal = r.balance;
    for (const n of r.notes) if (!notes.includes(n)) notes.push(n);
    if (inv.financing_status === "PAID_OFF" && balanceFinal > 1) {
        notes.push(`Saldo estimado após a quitação: ${balanceFinal.toFixed(2)}. Ajuste a amortização nas linhas em que souber o valor exato.`);
    }

    const updates: TransactionInput[] = [];
    for (const sp of splits) {
        const t = byId.get(sp.id)!;
        if (sp.kept) continue;
        if (t.interest_part !== sp.interest_part || t.principal_part !== sp.principal_part || t.insurance_part !== sp.insurance_part) {
            updates.push({ id: t.id, occurred_on: t.occurred_on, kind: t.kind, amount: t.amount, interest_part: sp.interest_part, principal_part: sp.principal_part, insurance_part: sp.insurance_part, comment: t.comment, source: t.source });
        }
    }
    // Tarifas are not part of the schedule: any juros/amortização/seguro left on them by older runs is cleared.
    const staleFees = txs.filter(t => t.kind === "TARIFA" && (t.interest_part !== null || t.principal_part !== null || t.insurance_part !== null));
    for (const t of staleFees) {
        updates.push({ id: t.id, occurred_on: t.occurred_on, kind: t.kind, amount: t.amount, interest_part: null, principal_part: null, insurance_part: null, comment: t.comment, source: t.source });
    }
    if (staleFees.length > 0) notes.push(`${staleFees.length} tarifa(s) bancária(s) com juros/amortização/seguro preenchidos serão limpas (tarifas não fazem parte do cronograma).`);
    return { splits, updates, totals, endingBalance: balanceFinal, notes };
}

export function formatDateBR(iso: string | null | undefined): string {
    if (!iso) return "—";
    const [y, m, d] = iso.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
}
