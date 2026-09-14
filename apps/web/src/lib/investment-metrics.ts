/**
 * Investment metrics engine — pure, side-effect free.
 *
 * Inputs are the three ledgers the property already has:
 *   • investment header + dated transactions (`property-investment.ts`)
 *   • monthly income ledger (`property-income.ts`)
 *   • taxes register (`property-taxes.ts`) — landlord-paid IPTU is charged
 *     only for years where neither ledger already carries IPTU (no double count)
 *
 * Money model (per calendar month):
 *   invested_m    = ENTRADA + CUSTOS_AQUISICAO + PRESTACAO + AMORTIZACAO + QUITACAO + REFORMA
 *   debtService_m = PRESTACAO + AMORTIZACAO + QUITACAO
 *   running_m     = TARIFA + IPTU + UTILIDADES + OUTROS (+ landlord IPTU from the register, see above)
 *   netRent_m     = received − energy portion            (rent after the agency fee)
 *   propertyOpex  = other expenses + IPTU column
 *   energyNet_m   = energy portion − energy cost         → pays the solar system back first;
 *                   the surplus (or all of it when there is no solar) belongs to the property
 *   noi_m         = netRent − propertyOpex − running + energy surplus
 *   cashFlow_m    = noi − debtService
 *
 *   payback %      = Σ noi ÷ Σ invested          (cash basis, to date)
 *   payback date   = walk forward at the trailing-12 NOI pace (and the remaining
 *                    instalments while the loan is active) until the gap closes
 *   IRR realizada  = XIRR of (noi_m − invested_m) monthly flows, no sale
 */
import { breakdown, currentMonthKey, monthKey, round2, type PropertyIncomeRow } from "./property-income";
import { monthsBetween, shiftMonthKey } from "./period-filter";
import { KIND_GROUP, type PropertyInvestment, type PropertyTransaction } from "./property-investment";
import type { PropertyTax } from "./property-taxes";

export interface MetricsInput {
    investment: PropertyInvestment | null;
    transactions: PropertyTransaction[];
    incomeRows: PropertyIncomeRow[];
    taxes?: PropertyTax[];
    /** `YYYY-MM`; defaults to the current month */
    asOf?: string;
    /** count EXPECTED income months as if confirmed (default false) */
    includeExpected?: boolean;
}

export interface MonthPoint {
    month: string;
    invested: number;
    debtService: number;
    runningCosts: number;
    netRent: number;
    grossRent: number;
    energySurplus: number;
    noi: number;
    cashFlow: number;
    cumInvested: number;
    cumNoi: number;
    /** cumInvested − cumNoi (≥ 0 until payback) */
    remaining: number;
    /** month had an income row counted */
    hasIncome: boolean;
    /** AMORTIZACAO / QUITACAO in this month */
    event: "AMORTIZACAO" | "QUITACAO" | null;
}

export interface ProjectionPoint {
    month: string;
    cumInvested: number;
    cumNoi: number;
}

export interface InvestmentMetrics {
    asOf: string;
    firstMonth: string | null;
    monthsTracked: number;
    incomeMonths: number;
    expectedMonthsExcluded: number;
    cashInvested: number;
    netIncomeToDate: number;
    paybackPct: number;
    remaining: number;
    /** month the cumulative NOI first covered the cumulative investment (past), or null */
    paybackReachedOn: string | null;
    /** months from asOf until payback at the current pace, or null when not computable */
    monthsToPayback: number | null;
    paybackForecastMonth: string | null;
    /** monthly NOI pace used for the forecast (trailing 12 months) */
    monthlyNoiPace: number;
    /** monthly debt service still assumed for the forecast while the loan is active */
    monthlyDebtServicePace: number;
    remainingInstallments: number;
    noi12m: number;
    cashFlow12m: number;
    debtService12m: number;
    monthsWithIncome12m: number;
    /** latest counted month's gross rent (contract value) */
    currentGrossRent: number | null;
    currentNetRent: number | null;
    /** 12 × current gross rent ÷ purchase price */
    grossYieldOnPrice: number | null;
    /** trailing-12 NOI ÷ cash invested */
    netYieldOnCost: number | null;
    /** trailing-12 cash flow ÷ cash invested */
    cashOnCash: number | null;
    /** purchase price ÷ (12 × current gross rent) */
    priceToRent: number | null;
    /** trailing-12 NOI ÷ trailing-12 debt service, only while financed */
    dscr: number | null;
    /** annual IRR of the realised flows (no sale); null when not computable */
    irrRealized: number | null;
    series: MonthPoint[];
    projection: ProjectionPoint[];
    /** landlord IPTU pulled from the register (years missing from both ledgers) */
    registerIptuUsed: number;
}

const INVEST_KINDS = new Set(["ENTRADA", "CUSTOS_AQUISICAO", "PRESTACAO", "AMORTIZACAO", "QUITACAO", "REFORMA"]);
const DEBT_KINDS = new Set(["PRESTACAO", "AMORTIZACAO", "QUITACAO"]);
const MAX_FORECAST_MONTHS = 600;

/**
 * Landlord-paid IPTU from the taxes register, by month, for years where neither
 * the income ledger (IPTU column) nor the investment ledger (IPTU kind) has any IPTU.
 */
export function registerIptuByMonth(taxes: PropertyTax[], incomeRows: PropertyIncomeRow[], txs: PropertyTransaction[]): Map<string, number> {
    const out = new Map<string, number>();
    const coveredYears = new Set<string>();
    for (const r of incomeRows) if ((Number(r.iptu_amount) || 0) > 0) coveredYears.add(monthKey(r.month).slice(0, 4));
    for (const t of txs) if (t.kind === "IPTU") coveredYears.add(t.occurred_on.slice(0, 4));
    for (const tax of taxes) {
        if (tax.kind !== "IPTU") continue;
        const year = String(tax.year);
        if (coveredYears.has(year)) continue;
        const parts = Array.isArray(tax.installments) ? tax.installments : [];
        const add = (m: string, amt: number) => { if (amt > 0) out.set(m, round2((out.get(m) ?? 0) + amt)); };
        if (parts.length === 0) {
            if (tax.paid_by === "LANDLORD") add(tax.paid_on ? monthKey(tax.paid_on) : `${year}-01`, Number(tax.amount) || 0);
        } else {
            parts.forEach((p, i) => {
                if (p.paid_by !== "LANDLORD") return;
                const m = p.paid_on ? monthKey(p.paid_on) : `${year}-${String(Math.min(12, i + 1)).padStart(2, "0")}`;
                add(m, Number(p.amount) || 0);
            });
        }
    }
    return out;
}

/** Annualised internal rate of return of dated flows (Newton, bisection fallback). Null when no sign change. */
export function xirr(flows: Array<{ date: string; amount: number }>): number | null {
    const fs = flows.filter(f => Number.isFinite(f.amount) && f.amount !== 0).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (fs.length < 2) return null;
    if (!fs.some(f => f.amount > 0) || !fs.some(f => f.amount < 0)) return null;
    const t0 = Date.parse(fs[0].date + "T00:00:00Z");
    const years = fs.map(f => (Date.parse(f.date + "T00:00:00Z") - t0) / (365.25 * 86400000));
    const npv = (r: number) => fs.reduce((acc, f, i) => acc + f.amount / Math.pow(1 + r, years[i]), 0);
    const dnpv = (r: number) => fs.reduce((acc, f, i) => acc - (years[i] * f.amount) / Math.pow(1 + r, years[i] + 1), 0);
    // Newton from a modest guess
    let r = 0.05;
    for (let i = 0; i < 60; i++) {
        const v = npv(r), d = dnpv(r);
        if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) break;
        const next = r - v / d;
        if (next <= -0.9999 || !Number.isFinite(next)) break;
        if (Math.abs(next - r) < 1e-9) return round4(next);
        r = next;
    }
    // Bisection on [-0.99, 10]
    let lo = -0.99, hi = 10;
    let flo = npv(lo), fhi = npv(hi);
    if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        const fm = npv(mid);
        if (Math.abs(fm) < 1e-7 || hi - lo < 1e-9) return round4(mid);
        if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    return round4((lo + hi) / 2);
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const pct1 = (n: number) => Math.round(n * 1000) / 10;

export function computeInvestmentMetrics(input: MetricsInput): InvestmentMetrics {
    const asOf = input.asOf ?? currentMonthKey();
    const txs = input.transactions.filter(t => monthKey(t.occurred_on) <= asOf);
    const incomeAll = input.incomeRows.filter(r => monthKey(r.month) <= asOf);
    const counted = incomeAll.filter(r => r.status === "CONFIRMED" || input.includeExpected);
    const expectedExcluded = incomeAll.length - counted.length;
    const registerIptu = registerIptuByMonth(input.taxes ?? [], incomeAll, txs);

    // ── month buckets ───────────────────────────────────────────────────
    const months = new Set<string>();
    for (const t of txs) months.add(monthKey(t.occurred_on));
    for (const r of counted) months.add(monthKey(r.month));
    for (const m of registerIptu.keys()) if (m <= asOf) months.add(m);
    if (input.investment?.acquired_on && monthKey(input.investment.acquired_on) <= asOf) months.add(monthKey(input.investment.acquired_on));
    const firstMonth = months.size ? [...months].sort()[0] : null;

    const empty = (): InvestmentMetrics => ({
        asOf, firstMonth: null, monthsTracked: 0, incomeMonths: 0, expectedMonthsExcluded: expectedExcluded,
        cashInvested: 0, netIncomeToDate: 0, paybackPct: 0, remaining: 0, paybackReachedOn: null,
        monthsToPayback: null, paybackForecastMonth: null, monthlyNoiPace: 0, monthlyDebtServicePace: 0, remainingInstallments: 0,
        noi12m: 0, cashFlow12m: 0, debtService12m: 0, monthsWithIncome12m: 0, currentGrossRent: null, currentNetRent: null,
        grossYieldOnPrice: null, netYieldOnCost: null, cashOnCash: null, priceToRent: null, dscr: null, irrRealized: null,
        series: [], projection: [], registerIptuUsed: 0,
    });
    if (!firstMonth) return empty();

    const txByMonth = new Map<string, PropertyTransaction[]>();
    for (const t of txs) {
        const k = monthKey(t.occurred_on);
        txByMonth.set(k, [...(txByMonth.get(k) ?? []), t]);
    }
    const incomeByMonth = new Map<string, PropertyIncomeRow>();
    for (const r of counted) incomeByMonth.set(monthKey(r.month), r);

    // ── walk every calendar month from the first to asOf ────────────────
    const series: MonthPoint[] = [];
    let cumInvested = 0, cumNoi = 0;
    let solarInvestedCum = 0, solarRecovered = 0;
    let paybackReachedOn: string | null = null;
    let registerIptuUsed = 0;
    let lastGross: number | null = null, lastNet: number | null = null;
    const total = monthsBetween(firstMonth, asOf);
    for (let i = 0; i <= total; i++) {
        const m = shiftMonthKey(firstMonth, i);
        let invested = 0, debt = 0, running = 0, event: MonthPoint["event"] = null;
        for (const t of txByMonth.get(m) ?? []) {
            const a = Number(t.amount) || 0;
            if (INVEST_KINDS.has(t.kind)) invested += a;
            if (DEBT_KINDS.has(t.kind)) debt += a;
            if (KIND_GROUP[t.kind] === "CUSTOS") running += a;
            if (t.kind === "ENERGIA_SOLAR") solarInvestedCum += a;
            if (t.kind === "QUITACAO") event = "QUITACAO";
            else if (t.kind === "AMORTIZACAO" && event !== "QUITACAO") event = "AMORTIZACAO";
        }
        const reg = registerIptu.get(m) ?? 0;
        running += reg;
        registerIptuUsed += reg;

        const row = incomeByMonth.get(m);
        let netRent = 0, gross = 0, propertyOpex = 0, energyNet = 0;
        if (row) {
            const b = breakdown(row);
            netRent = b.netRent;
            gross = b.grossRent;
            propertyOpex = b.otherExpenses + b.iptu;
            energyNet = b.energy - b.other;
            lastGross = b.grossRent;
            lastNet = b.netRent;
        }
        // energy: the solar system is paid back first; the surplus is the property's
        let energySurplus = 0;
        if (solarInvestedCum > 0) {
            if (energyNet < 0) solarRecovered += energyNet;
            else {
                const toSolar = Math.min(energyNet, Math.max(0, solarInvestedCum - solarRecovered));
                solarRecovered += toSolar;
                energySurplus = energyNet - toSolar;
            }
        } else energySurplus = energyNet;

        const noi = round2(netRent - propertyOpex - running + energySurplus);
        cumInvested = round2(cumInvested + invested);
        cumNoi = round2(cumNoi + noi);
        const remaining = round2(cumInvested - cumNoi);
        if (!paybackReachedOn && cumInvested > 0 && cumNoi >= cumInvested) paybackReachedOn = m;
        series.push({
            month: m, invested: round2(invested), debtService: round2(debt), runningCosts: round2(running),
            netRent, grossRent: gross, energySurplus: round2(energySurplus), noi, cashFlow: round2(noi - debt),
            cumInvested, cumNoi, remaining, hasIncome: Boolean(row), event,
        });
    }

    // ── trailing 12 calendar months ─────────────────────────────────────
    const last12 = series.slice(-12);
    const noi12m = round2(last12.reduce((a, p) => a + p.noi, 0));
    const debt12m = round2(last12.reduce((a, p) => a + p.debtService, 0));
    const cashFlow12m = round2(noi12m - debt12m);
    const monthsWithIncome12m = last12.filter(p => p.hasIncome).length;
    // pace: average over the months that actually have income data (a brand-new ledger is not diluted by empty months)
    const noiPace = monthsWithIncome12m > 0 ? round2(last12.filter(p => p.hasIncome).reduce((a, p) => a + p.noi, 0) / monthsWithIncome12m) : 0;

    // ── financing still running? ────────────────────────────────────────
    const inv = input.investment;
    const financed = inv?.financing_status === "ACTIVE";
    const paidInstallments = txs.filter(t => t.kind === "PRESTACAO").length;
    const remainingInstallments = financed && inv?.term_months ? Math.max(0, inv.term_months - paidInstallments) : 0;
    const debtPace = financed && remainingInstallments > 0
        ? round2(last12.filter(p => p.debtService > 0).length ? debt12m / last12.filter(p => p.debtService > 0).length : 0)
        : 0;

    // ── forecast ────────────────────────────────────────────────────────
    const remaining = round2(cumInvested - cumNoi);
    const projection: ProjectionPoint[] = [];
    let monthsToPayback: number | null = null;
    if (remaining <= 0 && cumInvested > 0) monthsToPayback = 0;
    else if (noiPace > 0 && cumInvested > 0) {
        let gap = remaining, pi = 0, pInv = cumInvested, pNoi = cumNoi;
        projection.push({ month: asOf, cumInvested: pInv, cumNoi: pNoi });
        while (gap > 0 && pi < MAX_FORECAST_MONTHS) {
            pi++;
            const debtThisMonth = pi <= remainingInstallments ? debtPace : 0;
            pInv = round2(pInv + debtThisMonth);
            pNoi = round2(pNoi + noiPace);
            gap = round2(pInv - pNoi);
            projection.push({ month: shiftMonthKey(asOf, pi), cumInvested: pInv, cumNoi: pNoi });
        }
        if (gap <= 0) monthsToPayback = pi;
        else projection.length = 0;
    }
    const paybackForecastMonth = monthsToPayback === null ? null : monthsToPayback === 0 ? (paybackReachedOn ?? asOf) : shiftMonthKey(asOf, monthsToPayback);

    // ── yields ──────────────────────────────────────────────────────────
    const price = inv?.purchase_price ? Number(inv.purchase_price) : 0;
    const grossYieldOnPrice = price > 0 && lastGross !== null && lastGross > 0 ? pct1((12 * lastGross) / price) : null;
    const netYieldOnCost = cumInvested > 0 && monthsWithIncome12m > 0 ? pct1((noiPace * 12) / cumInvested) : null;
    const cashOnCash = cumInvested > 0 && monthsWithIncome12m > 0 ? pct1(cashFlow12m / cumInvested) : null;
    const priceToRent = price > 0 && lastGross ? Math.round((price / (12 * lastGross)) * 10) / 10 : null;
    const dscr = financed && debt12m > 0 ? Math.round((noi12m / debt12m) * 100) / 100 : null;

    // ── realised IRR (no sale): monthly net flows dated mid-month ────────
    const irr = xirr(series.map(p => ({ date: `${p.month}-15`, amount: round2(p.noi - p.invested) })));

    return {
        asOf,
        firstMonth,
        monthsTracked: series.length,
        incomeMonths: counted.length,
        expectedMonthsExcluded: expectedExcluded,
        cashInvested: cumInvested,
        netIncomeToDate: cumNoi,
        paybackPct: cumInvested > 0 ? pct1(cumNoi / cumInvested) : 0,
        remaining: round2(Math.max(0, remaining)),
        paybackReachedOn,
        monthsToPayback,
        paybackForecastMonth,
        monthlyNoiPace: noiPace,
        monthlyDebtServicePace: debtPace,
        remainingInstallments,
        noi12m,
        cashFlow12m,
        debtService12m: debt12m,
        monthsWithIncome12m,
        currentGrossRent: lastGross,
        currentNetRent: lastNet,
        grossYieldOnPrice,
        netYieldOnCost,
        cashOnCash,
        priceToRent,
        dscr,
        irrRealized: irr === null ? null : pct1(irr),
        series,
        projection,
        registerIptuUsed: round2(registerIptuUsed),
    };
}
