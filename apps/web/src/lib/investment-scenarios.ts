/**
 * What-if scenarios on top of `computeInvestmentMetrics` — pure.
 *
 * Starting from the metrics as of today, walks forward month by month:
 *   NOI_m   = NOI pace × (1 + rent growth)^(years) × (1 − vacancy)
 *   debt_m  = remaining financing schedule (SAC/PRICE from the outstanding
 *             balance, with an optional extra amortisation today), or the
 *             engine's instalment pace when the contract is not fully known
 *   value_m = market value (or purchase price) × (1 + appreciation)^(years)
 *
 * Reports the projected payback month, and — when a sale year is given — the
 * sale value, proceeds after selling costs and loan balance, and the IRR of
 * the realised flows + projected flows + sale.
 */
import { calculateMortgage } from "./mortgage";
import { round2 } from "./property-income";
import { shiftMonthKey } from "./period-filter";
import { xirr, type InvestmentMetrics } from "./investment-metrics";
import type { PropertyInvestment } from "./property-investment";

export interface ScenarioInput {
    metrics: InvestmentMetrics;
    investment: PropertyInvestment | null;
    /** annual rent growth, % (e.g. IPCA) */
    rentGrowthPctYear: number;
    /** share of months lost to vacancy, % */
    vacancyPct: number;
    /** extra amortisation paid today (only while the loan is active) */
    prepayNow: number;
    /** annual market value growth, % */
    appreciationPctYear: number;
    /** sell N years from now; null = keep */
    saleYear: number | null;
    /** broker + taxes on the sale price, % */
    sellingCostPct: number;
    /** projection cap in months (default 360) */
    horizonMonths?: number;
}

export interface ScenarioPoint {
    month: string;
    cumInvested: number;
    cumNoi: number;
    noi: number;
    debtService: number;
    balance: number;
}

export interface ScenarioResult {
    monthsToPayback: number | null;
    paybackMonth: string | null;
    projection: ScenarioPoint[];
    /** financing under the scenario */
    remainingInstalments: number;
    remainingInterest: number | null;
    /** vs. the same schedule without the prepayment */
    interestSaved: number | null;
    instalmentsSaved: number | null;
    /** sale (null when saleYear is null) */
    saleMonth: string | null;
    saleValue: number | null;
    saleProceeds: number | null;
    balanceAtSale: number | null;
    noiUntilSale: number | null;
    /** total cash returned (NOI to date + projected NOI + proceeds) ÷ cash invested (to date + projected instalments) */
    multipleAtSale: number | null;
    /** annual IRR including the sale, % */
    irrAtSale: number | null;
    /** baseline value used for appreciation */
    valueBase: number;
    valueBaseSource: "VALUATION" | "PURCHASE" | "NONE";
}

const MAX_MONTHS = 360;

interface DebtPlan { payments: number[]; balances: number[]; totalInterest: number | null }

/** Remaining financing schedule from today; falls back to the engine's pace when the contract is unknown. */
function debtPlan(m: InvestmentMetrics, inv: PropertyInvestment | null, prepay: number): DebtPlan {
    const active = inv?.financing_status === "ACTIVE";
    if (!active) return { payments: [], balances: [], totalInterest: 0 };
    const balance = m.outstandingBalance;
    const rate = Number(inv?.annual_rate) || 0;
    const system = inv?.financing_system === "PRICE" ? "PRICE" : inv?.financing_system === "SAC" ? "SAC" : null;
    const term = m.remainingInstallments;
    if (balance !== null && balance > 0 && rate > 0 && system && term > 0) {
        const r = calculateMortgage({
            propertyValue: balance, downPayment: 0, system, termMonths: term, annualInterestRate: rate, mipRate: 0, dfiRate: 0,
            extraPayments: prepay > 0 ? [{ month: 1, amount: prepay, effect: "reduce_term" }] : [],
        });
        // the prepayment itself is paid today, not inside month 1's instalment
        const payments = r.schedule.map((s, i) => round2(s.payment - (i === 0 ? s.extraAmortization : 0)));
        return { payments, balances: r.schedule.map(s => round2(s.balance)), totalInterest: round2(r.summary.totalInterest) };
    }
    // unknown contract: repeat the observed instalment pace
    const payments = Array.from({ length: term }, () => m.monthlyDebtServicePace);
    const balances = payments.map((_, i) => (balance !== null ? round2(Math.max(0, balance - (i + 1) * (balance / Math.max(1, term)))) : 0));
    return { payments, balances, totalInterest: null };
}

export function projectScenario(input: ScenarioInput): ScenarioResult {
    const { metrics: m, investment: inv } = input;
    const horizon = Math.min(MAX_MONTHS, Math.max(12, input.horizonMonths ?? MAX_MONTHS));
    const g = Math.max(-0.5, input.rentGrowthPctYear / 100);
    const vac = Math.min(0.9, Math.max(0, input.vacancyPct / 100));
    const a = Math.max(-0.5, input.appreciationPctYear / 100);
    const cost = Math.min(0.5, Math.max(0, input.sellingCostPct / 100));
    const active = inv?.financing_status === "ACTIVE";
    const prepay = active && input.prepayNow > 0 ? round2(input.prepayNow) : 0;

    const plan = debtPlan(m, inv, prepay);
    const base = prepay > 0 ? debtPlan(m, inv, 0) : plan;

    const valueBase = m.marketValue ?? (inv?.purchase_price ? Number(inv.purchase_price) : 0);
    const valueBaseSource: ScenarioResult["valueBaseSource"] = m.marketValue !== null ? "VALUATION" : valueBase > 0 ? "PURCHASE" : "NONE";

    const saleMonths = input.saleYear !== null && input.saleYear > 0 ? Math.min(horizon, Math.round(input.saleYear * 12)) : null;
    const last = saleMonths ?? horizon;

    let cumInvested = round2(m.cashInvested + prepay);
    let cumNoi = m.netIncomeToDate;
    let balance = (m.outstandingBalance ?? 0) - prepay;
    if (balance < 0) balance = 0;
    const projection: ScenarioPoint[] = [{ month: m.asOf, cumInvested, cumNoi, noi: 0, debtService: prepay, balance: round2(balance) }];
    const flows = m.series.map(p => ({ date: `${p.month}-15`, amount: round2(p.noi - p.invested) }));
    if (prepay > 0) flows.push({ date: `${m.asOf}-15`, amount: -prepay });

    let monthsToPayback: number | null = cumInvested > 0 && cumNoi >= cumInvested ? 0 : null;
    let noiUntilSale = 0;
    for (let i = 1; i <= last; i++) {
        const month = shiftMonthKey(m.asOf, i);
        const years = i / 12;
        const noi = round2(m.monthlyNoiPace * Math.pow(1 + g, years) * (1 - vac));
        const debt = plan.payments[i - 1] ?? 0;
        balance = plan.balances[i - 1] ?? (plan.payments.length ? 0 : balance);
        cumInvested = round2(cumInvested + debt);
        cumNoi = round2(cumNoi + noi);
        noiUntilSale = round2(noiUntilSale + noi);
        if (monthsToPayback === null && cumInvested > 0 && cumNoi >= cumInvested) monthsToPayback = i;
        projection.push({ month, cumInvested, cumNoi, noi, debtService: round2(debt), balance: round2(balance) });
        flows.push({ date: `${month}-15`, amount: round2(noi - debt) });
        // stop early when there is nothing left to learn: paid back, loan over, no sale planned
        if (saleMonths === null && monthsToPayback !== null && i >= plan.payments.length && i >= 12) break;
    }

    let saleValue: number | null = null, saleProceeds: number | null = null, balanceAtSale: number | null = null, irrAtSale: number | null = null, multipleAtSale: number | null = null;
    if (saleMonths !== null && valueBase > 0) {
        saleValue = round2(valueBase * Math.pow(1 + a, saleMonths / 12));
        balanceAtSale = round2(projection[projection.length - 1].balance);
        saleProceeds = round2(saleValue * (1 - cost) - balanceAtSale);
        const lastFlow = flows[flows.length - 1];
        lastFlow.amount = round2(lastFlow.amount + saleProceeds);
        const r = xirr(flows);
        irrAtSale = r === null ? null : Math.round(r * 1000) / 10;
        const invested = projection[projection.length - 1].cumInvested;
        multipleAtSale = invested > 0 ? Math.round(((m.netIncomeToDate + noiUntilSale + saleProceeds) / invested) * 100) / 100 : null;
    }

    return {
        monthsToPayback,
        paybackMonth: monthsToPayback === null ? null : monthsToPayback === 0 ? (m.paybackReachedOn ?? m.asOf) : shiftMonthKey(m.asOf, monthsToPayback),
        projection,
        remainingInstalments: plan.payments.length,
        remainingInterest: plan.totalInterest,
        interestSaved: prepay > 0 && plan.totalInterest !== null && base.totalInterest !== null ? round2(base.totalInterest - plan.totalInterest) : null,
        instalmentsSaved: prepay > 0 ? base.payments.length - plan.payments.length : null,
        saleMonth: saleMonths !== null ? shiftMonthKey(m.asOf, saleMonths) : null,
        saleValue,
        saleProceeds,
        balanceAtSale,
        noiUntilSale: saleMonths !== null ? noiUntilSale : null,
        multipleAtSale,
        irrAtSale,
        valueBase,
        valueBaseSource,
    };
}
