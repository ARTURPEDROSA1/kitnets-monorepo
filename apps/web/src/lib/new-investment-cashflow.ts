/**
 * Cash-flow simulator of a Novo Investimento: what leaves the pocket until the keys, and what
 * comes back after them.
 *
 * One row per month from the first movement to the end of the horizon:
 *
 *   outflowPaid      instalments already paid            (drawn below the axis)
 *   outflowForecast  instalments the contract still owes (drawn below the axis)
 *   outflowDelivery  what the handover itself costs — ITBI, escritura, registro, mobília —
 *                    one bar in the keys month                (drawn below the axis)
 *   rent             net rent expected from the keys on  (drawn above the axis)
 *   cumulative       running sum of the four — crosses zero at the break-even month
 *
 * The rent grows by `rentAdjustmentPct` every twelve months from the first rent month, which is
 * how a Brazilian lease behaves (one adjustment per year, not a monthly compounding).
 *
 * The TIR (IRR) is the annual rate that makes all these flows worth zero today: the number that
 * compares with the CDI, and the one that says whether anticipating an instalment beats leaving
 * the money invested.
 */
import {
    addMonthsToKey,
    expandSchedules,
    monthsBetween,
    paymentMonth,
    paymentTotal,
    pendingInstalments,
    type InvestmentPayment,
    type InvestmentSchedule,
    type NewInvestment,
} from "./new-investments";
import { rentStartMonth } from "./new-investment-metrics";
import { annualizePct, internalRateOfReturn } from "./irr";
import { round2 } from "./property-income";

export interface CashFlowAssumptions {
    /** Gross monthly rent expected once the unit is let. */
    monthlyRent: number;
    /** `YYYY-MM` of the first rent. */
    rentStart: string | null;
    /** % applied to the rent every 12 months. */
    rentAdjustmentPct: number;
    /** % of the year the unit is expected to stand empty. */
    vacancyPct: number;
    /** % of the rent that never reaches the owner (condomínio, IPTU, administração). */
    costsPct: number;
    /** How many months of rent to project past the last one. */
    horizonMonths: number;
    /** What the handover costs (ITBI 2–3%, escritura + registro ~1%) as % of the instalments, paid in the keys month. */
    deliveryCostsPct: number;
    /** "Worth X% more at delivery" — stored with the other premises; feeds the delivery value. */
    expectedAppreciationPct: number | null;
    /**
     * A project meant to be sold: the expected delivery value comes in as one inflow in the keys
     * month and there is no rent. Null (or 0) = the rent model. Not stored — derived per render.
     */
    saleAtDelivery?: number | null;
}

export interface CashFlowPoint {
    /** `YYYY-MM` */
    month: string;
    label: string;
    outflowPaid: number;
    outflowForecast: number;
    outflowDelivery: number;
    rent: number;
    /** The sale at delivery, in a project meant to be sold (drawn above the axis). */
    sale: number;
    /** Σ (rent + sale − outflows) up to and including this month. */
    cumulative: number;
    /** True for the month the keys are handed over. */
    keys: boolean;
}

export interface CashFlowResult {
    points: CashFlowPoint[];
    /** Instalments paid + forecast + the delivery costs. */
    totalOutflow: number;
    totalDelivery: number;
    totalRent: number;
    totalSale: number;
    /** `YYYY-MM` where `cumulative` first reaches zero, null when the horizon is too short. */
    breakEvenMonth: string | null;
    /** Months from the first rent to break-even. */
    breakEvenMonths: number | null;
    /** Annual internal rate of return of the whole flow over the horizon; null when it has no answer. */
    irrAnnualPct: number | null;
    keysMonth: string | null;
    rentStart: string | null;
}

const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatMonthLabel(key: string): string {
    const [y, m] = key.split("-");
    return `${MONTH_SHORT[Number(m) - 1] ?? m}/${y.slice(2)}`;
}

/** The assumptions stored on the investment, ready for the simulator's inputs. */
export function assumptionsOf(investment: NewInvestment, fallbackHorizonMonths = 120): CashFlowAssumptions {
    return {
        monthlyRent: investment.estimated_rent ?? 0,
        rentStart: rentStartMonth(investment),
        rentAdjustmentPct: investment.rent_adjustment_pct ?? 0,
        vacancyPct: investment.rent_vacancy_pct ?? 0,
        costsPct: investment.rent_costs_pct ?? 0,
        horizonMonths: investment.sim_horizon_months || fallbackHorizonMonths,
        deliveryCostsPct: investment.sim_delivery_costs_pct ?? 0,
        expectedAppreciationPct: investment.expected_appreciation_pct,
    };
}

/** Net rent of the n-th month of letting (0-based), after its yearly adjustments. */
export function rentAtMonth(a: CashFlowAssumptions, monthsSinceStart: number): number {
    if (monthsSinceStart < 0 || a.monthlyRent <= 0) return 0;
    const years = Math.floor(monthsSinceStart / 12);
    const gross = a.monthlyRent * Math.pow(1 + a.rentAdjustmentPct / 100, years);
    return round2(gross * (1 - a.vacancyPct / 100) * (1 - a.costsPct / 100));
}

export { internalRateOfReturn, annualizePct } from "./irr";

export function simulateCashFlow(
    investment: NewInvestment,
    schedules: InvestmentSchedule[],
    payments: InvestmentPayment[],
    assumptions: CashFlowAssumptions
): CashFlowResult {
    const paidByMonth = new Map<string, number>();
    const forecastByMonth = new Map<string, number>();

    for (const p of payments) {
        const month = paymentMonth(p);
        const target = p.status === "PAID" ? paidByMonth : forecastByMonth;
        target.set(month, round2((target.get(month) ?? 0) + paymentTotal(p)));
    }
    for (const inst of pendingInstalments(schedules, payments)) {
        const month = inst.dueOn.slice(0, 7);
        forecastByMonth.set(month, round2((forecastByMonth.get(month) ?? 0) + inst.amount));
    }

    const keysOn = investment.keys_delivered_on ?? investment.keys_expected_on;
    const keysMonth = keysOn ? keysOn.slice(0, 7) : null;
    const rentStart = assumptions.rentStart;
    // The handover costs are a % of what the unit costs in instalments (paid + still owed); they
    // land in the keys month, or without one, the month before the first rent.
    const instalmentsTotal = [...paidByMonth.values(), ...forecastByMonth.values()].reduce((s, v) => s + v, 0);
    const deliveryCosts = round2(instalmentsTotal * (assumptions.deliveryCostsPct / 100));
    const deliveryMonth = deliveryCosts > 0 ? (keysMonth ?? (rentStart ? addMonthsToKey(rentStart, -1) : null)) : null;

    // A project meant to be sold: the delivery value comes in once, in the keys month (or when
    // the rent would have started), and no rent is projected.
    const saleAmount = assumptions.saleAtDelivery && assumptions.saleAtDelivery > 0 ? round2(assumptions.saleAtDelivery) : 0;
    const saleMonth = saleAmount > 0 ? (keysMonth ?? rentStart) : null;
    const rentMode = saleMonth === null;

    // Range: from the first movement to whichever comes last — the last instalment, the keys, or
    // enough rent months to show the recovery.
    const cashMonths = [...paidByMonth.keys(), ...forecastByMonth.keys()];
    const scheduleMonths = expandSchedules(schedules).map(i => i.dueOn.slice(0, 7));
    const known = [...cashMonths, ...scheduleMonths, ...(deliveryMonth ? [deliveryMonth] : []), ...(saleMonth ? [saleMonth] : [])].sort();
    const start = known[0] ?? rentStart ?? keysMonth;
    if (!start) {
        return { points: [], totalOutflow: 0, totalDelivery: 0, totalRent: 0, totalSale: 0, breakEvenMonth: null, breakEvenMonths: null, irrAnnualPct: null, keysMonth, rentStart };
    }

    const lastCash = known[known.length - 1] ?? start;
    const rentEnd = rentMode && rentStart && assumptions.monthlyRent > 0 ? addMonthsToKey(rentStart, Math.max(0, assumptions.horizonMonths - 1)) : null;
    const end = [lastCash, keysMonth, rentEnd].filter(Boolean).sort().pop() as string;

    const points: CashFlowPoint[] = [];
    let cumulative = 0;
    let totalOutflow = 0;
    let totalDelivery = 0;
    let totalRent = 0;
    let totalSale = 0;
    let breakEvenMonth: string | null = null;

    const count = monthsBetween(start, end);
    for (let i = 0; i <= count; i++) {
        const month = addMonthsToKey(start, i);
        const outflowPaid = paidByMonth.get(month) ?? 0;
        const outflowForecast = forecastByMonth.get(month) ?? 0;
        const outflowDelivery = month === deliveryMonth ? deliveryCosts : 0;
        const rent = rentMode && rentStart && month >= rentStart ? rentAtMonth(assumptions, monthsBetween(rentStart, month)) : 0;
        const sale = month === saleMonth ? saleAmount : 0;

        cumulative = round2(cumulative + rent + sale - outflowPaid - outflowForecast - outflowDelivery);
        totalOutflow = round2(totalOutflow + outflowPaid + outflowForecast + outflowDelivery);
        totalDelivery = round2(totalDelivery + outflowDelivery);
        totalRent = round2(totalRent + rent);
        totalSale = round2(totalSale + sale);
        if (breakEvenMonth === null && cumulative >= 0 && totalOutflow > 0 && (rent > 0 || sale > 0)) breakEvenMonth = month;

        points.push({
            month,
            label: formatMonthLabel(month),
            outflowPaid: round2(outflowPaid),
            outflowForecast: round2(outflowForecast),
            outflowDelivery,
            rent,
            sale,
            cumulative,
            keys: month === keysMonth,
        });
    }

    const monthlyIrr = internalRateOfReturn(points.map(p => p.rent + p.sale - p.outflowPaid - p.outflowForecast - p.outflowDelivery));
    const recoveryStart = rentMode ? rentStart : saleMonth;

    return {
        points,
        totalOutflow,
        totalDelivery,
        totalRent,
        totalSale,
        breakEvenMonth,
        breakEvenMonths: breakEvenMonth && recoveryStart ? monthsBetween(recoveryStart, breakEvenMonth) : null,
        irrAnnualPct: monthlyIrr === null ? null : annualizePct(monthlyIrr),
        keysMonth,
        rentStart,
    };
}
