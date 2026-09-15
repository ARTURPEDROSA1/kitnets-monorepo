/**
 * Investment metrics engine — pure, side-effect free.
 *
 * Inputs are the three ledgers the property already has:
 *   • investment header + dated transactions (`property-investment.ts`)
 *   • monthly income ledger (`property-income.ts`)
 *   • taxes register (`property-taxes.ts`) — the only source of IPTU: landlord-paid
 *     amounts are charged in the month they were paid
 *
 * Money model (per calendar month) — "tudo o que você pagou" vs "tudo o que entrou":
 *   invested_m    = every outflow: ENTRADA + CUSTOS_AQUISICAO + PRESTACAO + AMORTIZACAO + QUITACAO + TARIFA
 *                   + REFORMA + UTILIDADES + OUTROS + ENERGIA_SOLAR + landlord taxes from the register
 *                   (the legacy IPTU kind is ignored)
 *   debtService_m = PRESTACAO + AMORTIZACAO + QUITACAO
 *   running_m     = UTILIDADES + OUTROS + landlord taxes (reported; already inside invested)
 *   netRent_m     = received − energy portion            (rent after the agency fee)
 *   propertyOpex  = other expenses from the income ledger (paid out of the rent)
 *   energyNet_m   = energy portion − energy cost         (the solar system is part of the investment)
 *   noi_m         = netRent − propertyOpex + energyNet
 *   cashFlow_m    = noi − debtService
 *
 *   payback %      = Σ noi ÷ Σ invested          (cash basis, to date)
 *   payback date   = walk forward at the trailing-12 NOI pace (and the remaining
 *                    instalments while the loan is active) until the gap closes
 *   IRR realizada  = XIRR of (noi_m − invested_m) monthly flows, no sale
 *
 * With a market value (latest valuation): appreciation, equity (value − outstanding
 * loan), equity multiple, total return, IRR with the unrealised value as a terminal
 * flow, cap rate. With an IPCA series: every month's invested and NOI restated in
 * today's money for a real (inflation-adjusted) payback.
 */
import { breakdown, currentMonthKey, monthKey, round2, type PropertyIncomeRow } from "./property-income";
import { monthsBetween, shiftMonthKey } from "./period-filter";
import { KIND_GROUP, type PropertyInvestment, type PropertyTransaction } from "./property-investment";
import { landlordTaxesByMonth, type PropertyTax } from "./property-taxes";
import { priceLevelFactors, type MonthlyIndexPoint } from "./property-valuations";

export interface MetricsInput {
    investment: PropertyInvestment | null;
    transactions: PropertyTransaction[];
    incomeRows: PropertyIncomeRow[];
    taxes?: PropertyTax[];
    /** `YYYY-MM`; defaults to the current month */
    asOf?: string;
    /** count EXPECTED income months as if confirmed (default false) */
    includeExpected?: boolean;
    /** latest valuation (market value) when known */
    marketValue?: { amount: number; valuedOn: string; source: string } | null;
    /** IPCA monthly variations (%), any range; enables the real (today's money) payback */
    ipca?: MonthlyIndexPoint[];
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
    /** cumulative figures restated in asOf money by IPCA (null without a series) */
    cumInvestedReal: number | null;
    cumNoiReal: number | null;
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
    /** landlord taxes (IPTU, ITBI, outros) from the register, counted as investment */
    registerIptuUsed: number;

    // ── value and returns (need a valuation) ────────────────────────────
    marketValue: number | null;
    marketValueOn: string | null;
    marketValueSource: string | null;
    /** market value ÷ purchase price − 1, in % */
    appreciationPct: number | null;
    appreciationGain: number | null;
    /** principal − Σ known principal parts while ACTIVE; 0 when paid off / not financed; null when unknown */
    outstandingBalance: number | null;
    /** market value − outstanding balance */
    equity: number | null;
    /** (net income to date + equity) ÷ cash invested */
    equityMultiple: number | null;
    /** net income to date + appreciation gain */
    totalReturn: number | null;
    totalReturnPct: number | null;
    /** annual IRR with the equity as a terminal inflow at asOf, in % */
    irrWithValue: number | null;
    /** annualised trailing NOI ÷ market value, in % */
    capRate: number | null;
    /** 12 × current gross rent ÷ market value, in % */
    grossYieldOnValue: number | null;

    // ── real (IPCA, today's money) ──────────────────────────────────────
    ipcaAvailable: boolean;
    cashInvestedReal: number | null;
    netIncomeToDateReal: number | null;
    paybackPctReal: number | null;
    remainingReal: number | null;
}

const INVEST_KINDS = new Set(["ENTRADA", "CUSTOS_AQUISICAO", "PRESTACAO", "AMORTIZACAO", "QUITACAO", "TARIFA", "REFORMA", "UTILIDADES", "OUTROS", "ENERGIA_SOLAR"]);
const DEBT_KINDS = new Set(["PRESTACAO", "AMORTIZACAO", "QUITACAO"]);
const MAX_FORECAST_MONTHS = 600;

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
    const registerIptu = landlordTaxesByMonth(input.taxes ?? []);

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
        marketValue: null, marketValueOn: null, marketValueSource: null, appreciationPct: null, appreciationGain: null,
        outstandingBalance: null, equity: null, equityMultiple: null, totalReturn: null, totalReturnPct: null, irrWithValue: null,
        capRate: null, grossYieldOnValue: null, ipcaAvailable: false, cashInvestedReal: null, netIncomeToDateReal: null, paybackPctReal: null, remainingReal: null,
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
            if (KIND_GROUP[t.kind] === "CUSTOS" && t.kind !== "IPTU") running += a;   // reported as custos; already counted in invested
            if (t.kind === "QUITACAO") event = "QUITACAO";
            else if (t.kind === "AMORTIZACAO" && event !== "QUITACAO") event = "AMORTIZACAO";
        }
        const reg = registerIptu.get(m) ?? 0;   // landlord taxes: part of what was paid
        running += reg;
        invested += reg;
        registerIptuUsed += reg;

        const row = incomeByMonth.get(m);
        let netRent = 0, gross = 0, propertyOpex = 0, energyNet = 0;
        if (row) {
            const b = breakdown(row);
            netRent = b.netRent;
            gross = b.grossRent;
            propertyOpex = b.otherExpenses;
            energyNet = b.energy - b.other;
            lastGross = b.grossRent;
            lastNet = b.netRent;
        }
        // energy income is income of the property (the solar system is inside the investment)
        const energySurplus = energyNet;

        const noi = round2(netRent - propertyOpex + energySurplus);
        cumInvested = round2(cumInvested + invested);
        cumNoi = round2(cumNoi + noi);
        const remaining = round2(cumInvested - cumNoi);
        if (!paybackReachedOn && cumInvested > 0 && cumNoi >= cumInvested) paybackReachedOn = m;
        series.push({
            month: m, invested: round2(invested), debtService: round2(debt), runningCosts: round2(running),
            netRent, grossRent: gross, energySurplus: round2(energySurplus), noi, cashFlow: round2(noi - debt),
            cumInvested, cumNoi, remaining, hasIncome: Boolean(row), event, cumInvestedReal: null, cumNoiReal: null,
        });
    }

    // ── real (today's money): restate each month's flows by the IPCA level ──
    const ipca = (input.ipca ?? []).filter(p => p && typeof p.month === "string" && Number.isFinite(p.value));
    const ipcaAvailable = ipca.length > 0;
    let cashInvestedReal: number | null = null, netIncomeToDateReal: number | null = null;
    if (ipcaAvailable) {
        const level = priceLevelFactors(ipca, firstMonth, asOf, asOf);   // level(asOf) = 1, earlier months < 1
        let ci = 0, cn = 0;
        for (const p of series) {
            const f = level.get(p.month) ?? 1;
            ci = round2(ci + p.invested / f);
            cn = round2(cn + p.noi / f);
            p.cumInvestedReal = ci;
            p.cumNoiReal = cn;
        }
        cashInvestedReal = ci;
        netIncomeToDateReal = cn;
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
    const flows = series.map(p => ({ date: `${p.month}-15`, amount: round2(p.noi - p.invested) }));
    const irr = xirr(flows);

    // ── value and returns ───────────────────────────────────────────────
    const mv = input.marketValue && input.marketValue.amount > 0 ? input.marketValue : null;
    let outstandingBalance: number | null = null;
    if (!inv || inv.financing_status === "NONE" || inv.financing_status === "PAID_OFF") outstandingBalance = 0;
    else if (inv.principal) {
        const fin = txs.filter(t => DEBT_KINDS.has(t.kind));
        const known = fin.filter(t => t.principal_part !== null && t.principal_part !== undefined);
        if (fin.length === 0 || known.length === fin.length) {
            outstandingBalance = round2(Math.max(0, Number(inv.principal) - known.reduce((a, t) => a + (Number(t.principal_part) || 0), 0)));
        }
    }
    const equity = mv && outstandingBalance !== null ? round2(mv.amount - outstandingBalance) : null;
    const appreciationGain = mv && price > 0 ? round2(mv.amount - price) : null;
    const totalReturn = appreciationGain !== null ? round2(cumNoi + appreciationGain) : null;
    const irrWithValue = equity !== null && equity > 0
        ? xirr([...flows.slice(0, -1), { date: `${asOf}-15`, amount: round2((flows.at(-1)?.amount ?? 0) + equity) }])
        : null;

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
        marketValue: mv?.amount ?? null,
        marketValueOn: mv?.valuedOn ?? null,
        marketValueSource: mv?.source ?? null,
        appreciationPct: mv && price > 0 ? pct1(mv.amount / price - 1) : null,
        appreciationGain,
        outstandingBalance,
        equity,
        equityMultiple: equity !== null && cumInvested > 0 ? Math.round(((cumNoi + equity) / cumInvested) * 100) / 100 : null,
        totalReturn,
        totalReturnPct: totalReturn !== null && cumInvested > 0 ? pct1(totalReturn / cumInvested) : null,
        irrWithValue: irrWithValue === null ? null : pct1(irrWithValue),
        capRate: mv && monthsWithIncome12m > 0 ? pct1((noiPace * 12) / mv.amount) : null,
        grossYieldOnValue: mv && lastGross ? pct1((12 * lastGross) / mv.amount) : null,
        ipcaAvailable,
        cashInvestedReal,
        netIncomeToDateReal,
        paybackPctReal: cashInvestedReal !== null && netIncomeToDateReal !== null && cashInvestedReal > 0 ? pct1(netIncomeToDateReal / cashInvestedReal) : null,
        remainingReal: cashInvestedReal !== null && netIncomeToDateReal !== null ? round2(Math.max(0, cashInvestedReal - netIncomeToDateReal)) : null,
    };
}
