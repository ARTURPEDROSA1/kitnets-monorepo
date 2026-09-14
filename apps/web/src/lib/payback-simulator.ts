/**
 * Public "Calculadora de Payback de Imóvel" — pure simulator that reuses the
 * mortgage schedule and the XIRR of the investment engine.
 *
 * Cash basis: down payment + closing costs at month 0, every instalment while
 * the loan runs; net income = rent × (1 − fee) × (1 − vacancy) − monthly costs,
 * growing yearly. Optional sale at the horizon at the appreciated value.
 */
import { calculateMortgage } from "./mortgage";
import { xirr } from "./investment-metrics";

export interface PaybackSimInput {
    propertyValue: number;
    /** % of the value paid up front */
    downPaymentPct: number;
    /** ITBI + registry + broker, % of the value */
    closingCostsPct: number;
    financed: boolean;
    system: "SAC" | "PRICE";
    annualRatePct: number;
    termMonths: number;
    monthlyRent: number;
    /** agency / management fee, % of rent */
    feePct: number;
    /** % of the year without a tenant */
    vacancyPct: number;
    /** IPTU, condo, maintenance paid by the owner, per month */
    monthlyCosts: number;
    /** annual rent growth, % */
    rentGrowthPctYear: number;
    /** annual appreciation, % */
    appreciationPctYear: number;
    /** simulation length in years (sale at the end when sellAtEnd) */
    horizonYears: number;
    sellAtEnd: boolean;
    /** broker + taxes on the sale, % */
    sellingCostPct: number;
}

export interface PaybackSimPoint {
    month: number;
    cumInvested: number;
    cumNoi: number;
    noi: number;
    debtService: number;
    balance: number;
}

export interface PaybackSimResult {
    downPayment: number;
    closingCosts: number;
    financedAmount: number;
    firstInstalment: number | null;
    totalInterest: number;
    totalInstalments: number;
    /** month 0 cash */
    initialCash: number;
    /** cash invested over the horizon (initial + instalments) */
    cashInvested: number;
    monthsToPayback: number | null;
    /** payback counted only against the initial cash (entrada + custos) */
    monthsToPaybackInitial: number | null;
    noiFirstMonth: number;
    noiYear1: number;
    grossYieldPct: number;
    netYieldPct: number;
    /** year-1 cash flow after instalments ÷ initial cash, % */
    cashOnCashPct: number | null;
    /** first-year NOI ÷ first-year debt service (financed only) */
    dscr: number | null;
    valueAtEnd: number;
    saleProceeds: number | null;
    totalNoi: number;
    /** annual IRR over the horizon (with sale when sellAtEnd), % */
    irrPct: number | null;
    /** total cash returned ÷ cash invested */
    multiple: number | null;
    series: PaybackSimPoint[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function simulatePayback(input: PaybackSimInput): PaybackSimResult {
    const value = Math.max(0, input.propertyValue);
    const downPayment = r2(value * Math.min(100, Math.max(0, input.downPaymentPct)) / 100);
    const closingCosts = r2(value * Math.max(0, input.closingCostsPct) / 100);
    const financed = input.financed && value - downPayment > 0.01;
    const financedAmount = financed ? r2(value - downPayment) : 0;
    const initialCash = r2((financed ? downPayment : value) + closingCosts);
    const horizon = Math.max(12, Math.min(600, Math.round(input.horizonYears * 12)));

    const schedule = financed
        ? calculateMortgage({ propertyValue: value, downPayment, system: input.system, termMonths: Math.max(1, Math.round(input.termMonths)), annualInterestRate: Math.max(0, input.annualRatePct), mipRate: 0, dfiRate: 0, extraPayments: [] }).schedule
        : [];
    const fee = Math.min(0.99, Math.max(0, input.feePct / 100));
    const vac = Math.min(0.9, Math.max(0, input.vacancyPct / 100));
    const g = Math.max(-0.5, input.rentGrowthPctYear / 100);
    const a = Math.max(-0.5, input.appreciationPctYear / 100);
    const sellCost = Math.min(0.5, Math.max(0, input.sellingCostPct / 100));

    const series: PaybackSimPoint[] = [{ month: 0, cumInvested: initialCash, cumNoi: 0, noi: 0, debtService: 0, balance: financedAmount }];
    const flows = [{ date: dateAt(0), amount: -initialCash }];
    let cumInvested = initialCash, cumNoi = 0, totalNoi = 0, totalInterest = 0, totalInstalments = 0;
    let monthsToPayback: number | null = null, monthsToPaybackInitial: number | null = null;
    let noiYear1 = 0, debtYear1 = 0;
    for (let m = 1; m <= horizon; m++) {
        const yearIdx = Math.floor((m - 1) / 12);
        const rent = input.monthlyRent * Math.pow(1 + g, yearIdx);
        const noi = r2(rent * (1 - fee) * (1 - vac) - input.monthlyCosts);
        const s = schedule[m - 1];
        const debt = s ? r2(s.payment) : 0;
        if (s) { totalInterest += s.interest; totalInstalments += s.payment; }
        cumInvested = r2(cumInvested + debt);
        cumNoi = r2(cumNoi + noi);
        totalNoi = r2(totalNoi + noi);
        if (m <= 12) { noiYear1 += noi; debtYear1 += debt; }
        if (monthsToPayback === null && cumNoi >= cumInvested) monthsToPayback = m;
        if (monthsToPaybackInitial === null && cumNoi >= initialCash) monthsToPaybackInitial = m;
        series.push({ month: m, cumInvested, cumNoi, noi, debtService: debt, balance: s ? r2(s.balance) : 0 });
        flows.push({ date: dateAt(m), amount: r2(noi - debt) });
    }
    const valueAtEnd = r2(value * Math.pow(1 + a, horizon / 12));
    const balanceAtEnd = series[series.length - 1].balance;
    let saleProceeds: number | null = null;
    if (input.sellAtEnd) {
        saleProceeds = r2(valueAtEnd * (1 - sellCost) - balanceAtEnd);
        flows[flows.length - 1].amount = r2(flows[flows.length - 1].amount + saleProceeds);
    }
    const irr = xirr(flows);
    const noiFirstMonth = series[1]?.noi ?? 0;
    const grossYieldPct = value > 0 ? Math.round(((input.monthlyRent * 12) / value) * 1000) / 10 : 0;
    const netYieldPct = initialCash > 0 ? Math.round(((noiYear1) / cashBasis(initialCash, financed ? totalInstalmentsOf(schedule) : 0)) * 1000) / 10 : 0;
    const returned = totalNoi + (saleProceeds ?? 0);
    return {
        downPayment, closingCosts, financedAmount,
        firstInstalment: schedule[0] ? r2(schedule[0].payment) : null,
        totalInterest: r2(totalInterest), totalInstalments: r2(totalInstalments),
        initialCash, cashInvested: cumInvested,
        monthsToPayback, monthsToPaybackInitial,
        noiFirstMonth, noiYear1: r2(noiYear1),
        grossYieldPct, netYieldPct,
        cashOnCashPct: initialCash > 0 ? Math.round(((noiYear1 - debtYear1) / initialCash) * 1000) / 10 : null,
        dscr: financed && debtYear1 > 0 ? Math.round((noiYear1 / debtYear1) * 100) / 100 : null,
        valueAtEnd, saleProceeds, totalNoi,
        irrPct: irr === null ? null : Math.round(irr * 1000) / 10,
        multiple: cumInvested > 0 ? Math.round((returned / cumInvested) * 100) / 100 : null,
        series,
    };
}

/** net yield base: what the owner puts in over the whole loan (initial cash + all instalments) — the property's total cost */
function cashBasis(initial: number, instalments: number) { return initial + instalments; }
function totalInstalmentsOf(schedule: ReturnType<typeof calculateMortgage>["schedule"]) { return schedule.reduce((a, s) => a + s.payment, 0); }
function dateAt(month: number): string {
    const d = new Date(2026, 0, 15);
    d.setMonth(d.getMonth() + month);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-15`;
}
