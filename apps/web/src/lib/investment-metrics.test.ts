import { describe, expect, it } from "vitest";
import { computeInvestmentMetrics, registerIptuByMonth, xirr } from "./investment-metrics";
import type { PropertyIncomeRow } from "./property-income";
import type { PropertyInvestment, PropertyTransaction } from "./property-investment";
import type { PropertyTax } from "./property-taxes";

const tx = (occurred_on: string, kind: PropertyTransaction["kind"], amount: number): PropertyTransaction => ({
    id: `${occurred_on}-${kind}-${amount}`, property_id: "p", occurred_on, kind, amount,
    interest_part: null, principal_part: null, insurance_part: null, comment: null, source: "MANUAL", bank_reference: null,
});
const income = (m: string, over: Partial<PropertyIncomeRow> = {}): PropertyIncomeRow => ({
    id: m, property_id: "p", month: `${m}-01`, received_on: null, received_amount: 3950, energy_portion: 350,
    other_income: 100, other_expenses: 0, iptu_amount: 0, agency_fee_pct: 10, status: "CONFIRMED", source: "MANUAL", bank_reference: null, notes: null,
    ...over,
});
const tax = (year: number, amount: number, paid_by: PropertyTax["paid_by"], over: Partial<PropertyTax> = {}): PropertyTax => ({
    id: `t${year}`, property_id: "p", year, kind: "IPTU", amount, paid_by, paid_on: null, comment: null, installments: [],
    document_path: null, extracted_at: null, ...over,
} as PropertyTax);
const investment = (over: Partial<PropertyInvestment> = {}): PropertyInvestment => ({
    property_id: "p", purchase_price: 100000, acquired_on: "2024-01-10", built_area_m2: null, lender: null, contract_number: null,
    financing_system: null, principal: null, annual_rate: null, term_months: null, contract_date: null, first_due_date: null,
    financing_status: "NONE", paid_off_on: null, notes: null, ...over,
});

const months = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
    const [y, m] = from.split("-").map(Number);
    const d = new Date(y, m - 1 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
});

describe("xirr", () => {
    it("matches a one-year 10% flow", () => {
        expect(xirr([{ date: "2024-01-01", amount: -1000 }, { date: "2025-01-01", amount: 1100 }])).toBeCloseTo(0.1, 3);
    });
    it("handles monthly flows and returns null without a sign change", () => {
        const flows = [{ date: "2024-01-15", amount: -12000 }, ...months("2024-02", 12).map(m => ({ date: `${m}-15`, amount: 1100 }))];
        const r = xirr(flows)!;
        expect(r).toBeGreaterThan(0.15);
        expect(r).toBeLessThan(0.25);
        expect(xirr([{ date: "2024-01-01", amount: -1 }, { date: "2024-02-01", amount: -1 }])).toBeNull();
    });
});

describe("registerIptuByMonth", () => {
    it("uses landlord IPTU only for years missing from both ledgers", () => {
        const taxes = [
            tax(2024, 1200, "LANDLORD", { paid_on: "2024-03-10" }),
            tax(2025, 1300, "LANDLORD", { installments: [
                { seq: 1, amount: 650, paid_by: "LANDLORD", paid_on: "2025-02-05" },
                { seq: 2, amount: 650, paid_by: "TENANT", paid_on: "2025-03-05" },
            ] }),
            tax(2026, 1400, "TENANT"),
        ];
        const byMonth = registerIptuByMonth(taxes, [income("2024-03", { iptu_amount: 1200 })], []);
        expect(byMonth.get("2024-03")).toBeUndefined();   // ledger already has 2024
        expect(byMonth.get("2025-02")).toBe(650);         // only the landlord parcela
        expect(byMonth.get("2025-03")).toBeUndefined();
        expect([...byMonth.keys()].some(k => k.startsWith("2026"))).toBe(false);
    });
});

describe("computeInvestmentMetrics", () => {
    it("returns an empty result without data", () => {
        const m = computeInvestmentMetrics({ investment: null, transactions: [], incomeRows: [], asOf: "2026-09" });
        expect(m.cashInvested).toBe(0);
        expect(m.paybackForecastMonth).toBeNull();
        expect(m.series).toHaveLength(0);
    });

    it("tracks payback to date and forecasts the crossing month", () => {
        // 40k down + 10k closing in Jan 2024, 12 × 5k instalments Feb 2024–Jan 2025, then paid off.
        const txs = [tx("2024-01-10", "ENTRADA", 40000), tx("2024-01-10", "CUSTOS_AQUISICAO", 10000),
            ...months("2024-02", 12).map(m => tx(`${m}-05`, "PRESTACAO", 5000)), tx("2024-06-01", "TARIFA", 100)];
        // Rent every month from Feb 2024 to Sep 2026 (32 months): noi = 3950 − 100 energy cost = 3850 (no solar → energy net is the property's)
        const rows = months("2024-02", 32).map(m => income(m));
        const m = computeInvestmentMetrics({ investment: investment({ financing_status: "PAID_OFF" }), transactions: txs, incomeRows: rows, asOf: "2026-09" });
        expect(m.cashInvested).toBe(110000);
        expect(m.netIncomeToDate).toBe(32 * 3850 - 100);
        expect(m.paybackPct).toBeCloseTo(((32 * 3850 - 100) / 110000) * 100, 0);
        expect(m.monthsWithIncome12m).toBe(12);
        expect(m.monthlyNoiPace).toBe(3850);
        expect(m.noi12m).toBe(12 * 3850);
        expect(m.netYieldOnCost).toBeCloseTo((12 * 3850 / 110000) * 100, 0);
        expect(m.grossYieldOnPrice).toBeCloseTo((12 * 4000 / 100000) * 100, 1);
        expect(m.priceToRent).toBeCloseTo(100000 / 48000, 1);
        // remaining = 110000 − 123100 < 0 → already paid back
        expect(m.remaining).toBe(0);
        expect(m.monthsToPayback).toBe(0);
        expect(m.paybackReachedOn).toBe("2026-06");   // 110000 / 3850 ≈ 28.6 → 29th income month = Jun 2026
        expect(m.irrRealized).not.toBeNull();
        expect(m.irrRealized!).toBeGreaterThan(0);
        expect(m.series[0].month).toBe("2024-01");
        expect(m.series.at(-1)!.month).toBe("2026-09");
        expect(m.series.length).toBe(33);
    });

    it("projects forward while the loan is still running and excludes expected months by default", () => {
        const txs = [tx("2026-01-10", "ENTRADA", 50000), ...months("2026-02", 8).map(m => tx(`${m}-05`, "PRESTACAO", 2000))];
        const rows = [...months("2026-02", 8).map(m => income(m)), income("2026-10", { status: "EXPECTED" })];
        const inv = investment({ financing_status: "ACTIVE", term_months: 10, principal: 20000 });
        const m = computeInvestmentMetrics({ investment: inv, transactions: txs, incomeRows: rows, asOf: "2026-09" });
        expect(m.expectedMonthsExcluded).toBe(0);   // the expected month is after asOf
        expect(m.cashInvested).toBe(66000);
        expect(m.remainingInstallments).toBe(2);
        expect(m.monthlyDebtServicePace).toBe(2000);
        expect(m.monthlyNoiPace).toBe(3850);
        // gap 66000 − 8×3850 = 35200; two more instalments add 4000 → 39200 / 3850 = 10.2 → 11 months
        expect(m.monthsToPayback).toBe(11);
        expect(m.paybackForecastMonth).toBe("2027-08");
        expect(m.projection.at(-1)!.cumNoi).toBeGreaterThanOrEqual(m.projection.at(-1)!.cumInvested);
        expect(m.dscr).toBeCloseTo((8 * 3850) / 16000, 2);

        const withExpected = computeInvestmentMetrics({ investment: inv, transactions: txs, incomeRows: [...rows, income("2026-09", { status: "EXPECTED" })], asOf: "2026-09" });
        expect(withExpected.expectedMonthsExcluded).toBe(1);
        expect(computeInvestmentMetrics({ investment: inv, transactions: txs, incomeRows: [...rows, income("2026-09", { status: "EXPECTED" })], asOf: "2026-09", includeExpected: true }).incomeMonths).toBe(9);
    });

    it("sends net energy income to the solar system first, then to the property", () => {
        const txs = [tx("2026-01-10", "ENTRADA", 10000), tx("2026-01-10", "ENERGIA_SOLAR", 500)];
        // energy net = 350 − 100 = 250 per month → solar (500) recovered in 2 months, surplus from month 3
        const rows = months("2026-01", 4).map(m => income(m));
        const m = computeInvestmentMetrics({ investment: investment({ acquired_on: "2026-01-10" }), transactions: txs, incomeRows: rows, asOf: "2026-04" });
        expect(m.series.map(p => p.energySurplus)).toEqual([0, 0, 250, 250]);
        expect(m.series.map(p => p.noi)).toEqual([3600, 3600, 3850, 3850]);
        expect(m.cashInvested).toBe(10000);  // solar is not part of the property's cash basis
    });

    it("charges landlord IPTU from the register when the ledgers have none for that year", () => {
        const txs = [tx("2026-01-10", "ENTRADA", 10000)];
        const rows = months("2026-01", 3).map(m => income(m));
        const taxes = [tax(2026, 900, "LANDLORD", { paid_on: "2026-02-10" })];
        const inv = investment({ acquired_on: "2026-01-10" });
        const m = computeInvestmentMetrics({ investment: inv, transactions: txs, incomeRows: rows, taxes, asOf: "2026-03" });
        expect(m.registerIptuUsed).toBe(900);
        expect(m.series[1].runningCosts).toBe(900);
        expect(m.netIncomeToDate).toBe(3 * 3850 - 900);
        const covered = computeInvestmentMetrics({ investment: inv, transactions: [...txs, tx("2026-02-10", "IPTU", 900)], incomeRows: rows, taxes, asOf: "2026-03" });
        expect(covered.registerIptuUsed).toBe(0);
        expect(covered.netIncomeToDate).toBe(3 * 3850 - 900);
    });
});

describe("computeInvestmentMetrics — value, returns and real payback", () => {
    const txs = [tx("2024-01-10", "ENTRADA", 40000), tx("2024-01-10", "CUSTOS_AQUISICAO", 10000),
        ...months("2024-02", 12).map(m => tx(`${m}-05`, "PRESTACAO", 5000))];
    const rows = months("2024-02", 32).map(m => income(m));
    const inv = investment({ financing_status: "PAID_OFF" });

    it("derives appreciation, equity, multiple, total return and IRR with value from the latest valuation", () => {
        const base = computeInvestmentMetrics({ investment: inv, transactions: txs, incomeRows: rows, asOf: "2026-09" });
        const m = computeInvestmentMetrics({ investment: inv, transactions: txs, incomeRows: rows, asOf: "2026-09", marketValue: { amount: 130000, valuedOn: "2026-08-01", source: "MANUAL" } });
        expect(m.marketValue).toBe(130000);
        expect(m.appreciationPct).toBeCloseTo(30, 1);
        expect(m.appreciationGain).toBe(30000);
        expect(m.outstandingBalance).toBe(0);
        expect(m.equity).toBe(130000);
        expect(m.equityMultiple).toBeCloseTo((m.netIncomeToDate + 130000) / 110000, 2);
        expect(m.totalReturn).toBe(m.netIncomeToDate + 30000);
        expect(m.capRate).toBeCloseTo((3850 * 12 / 130000) * 100, 0);
        expect(m.grossYieldOnValue).toBeCloseTo((4000 * 12 / 130000) * 100, 0);
        expect(m.irrWithValue).not.toBeNull();
        expect(m.irrWithValue!).toBeGreaterThan(base.irrRealized!);
        expect(base.marketValue).toBeNull();
        expect(base.irrWithValue).toBeNull();
    });

    it("tracks the outstanding balance while the loan is active only when every payment is split", () => {
        const active = investment({ financing_status: "ACTIVE", principal: 60000, term_months: 120 });
        const unsplit = computeInvestmentMetrics({ investment: active, transactions: txs, incomeRows: rows, asOf: "2026-09", marketValue: { amount: 130000, valuedOn: "2026-08-01", source: "MANUAL" } });
        expect(unsplit.outstandingBalance).toBeNull();
        expect(unsplit.equity).toBeNull();
        const split = txs.map(t => (t.kind === "PRESTACAO" ? { ...t, principal_part: 1000, interest_part: 3900, insurance_part: 100 } : t));
        const m = computeInvestmentMetrics({ investment: active, transactions: split, incomeRows: rows, asOf: "2026-09", marketValue: { amount: 130000, valuedOn: "2026-08-01", source: "MANUAL" } });
        expect(m.outstandingBalance).toBe(48000);
        expect(m.equity).toBe(82000);
    });

    it("restates invested and NOI in today's money with an IPCA series", () => {
        // 1% every month: older flows are worth more in today's money
        const ipca = months("2024-01", 33).map(m => ({ month: m, value: 1 }));
        const m = computeInvestmentMetrics({ investment: inv, transactions: txs, incomeRows: rows, asOf: "2026-09", ipca });
        expect(m.ipcaAvailable).toBe(true);
        expect(m.cashInvestedReal!).toBeGreaterThan(m.cashInvested);
        expect(m.netIncomeToDateReal!).toBeGreaterThan(m.netIncomeToDate);
        // the investment came first, so inflation hurts the real payback
        expect(m.paybackPctReal!).toBeLessThan(m.paybackPct);
        expect(m.series[0].cumInvestedReal).toBeCloseTo(50000 * Math.pow(1.01, 32), 0);
        expect(m.series.at(-1)!.cumNoiReal).toBe(m.netIncomeToDateReal);
        const none = computeInvestmentMetrics({ investment: inv, transactions: txs, incomeRows: rows, asOf: "2026-09" });
        expect(none.ipcaAvailable).toBe(false);
        expect(none.paybackPctReal).toBeNull();
    });
});
