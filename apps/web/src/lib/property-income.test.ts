import { describe, expect, it } from "vitest";
import {
    aggregateIncomeByMonth,
    breakdown,
    buildImportRows,
    incomeRowKey,
    isIncomeTemplate,
    INCOME_TEMPLATE_HEADERS,
    parseMoney,
    parseSheet,
    parseYesNo,
    receivedFromGross,
    rentHistory,
    suggestMapping,
    summarize,
    type PropertyIncomeRow,
} from "./property-income";

describe("parseMoney", () => {
    it("reads Brazilian and US formats", () => {
        expect(parseMoney("R$ 3,950.00")).toBe(3950);
        expect(parseMoney("3.950,00")).toBe(3950);
        expect(parseMoney("-R$ 199,479.26")).toBe(-199479.26);
        expect(parseMoney("(1.234,56)")).toBe(-1234.56);
        expect(parseMoney("10%")).toBe(10);
        expect(parseMoney(" R$  -   ")).toBeNull();
        expect(parseMoney("")).toBeNull();
    });
});

describe("breakdown", () => {
    it("applies the money model", () => {
        const b = breakdown({ received_amount: 3950, energy_portion: 350, other_income: 109.8, other_expenses: 50, agency_fee_pct: 10 });
        expect(b.netRent).toBe(3600);
        expect(b.grossRent).toBe(4000);
        expect(b.feeAmount).toBe(400);
        expect(b.revenue).toBe(4350);
        expect(b.opex).toBe(559.8);
        expect(b.noi).toBe(3790.2);
        expect(receivedFromGross(4000, 10, 350)).toBe(3950);
        // the legacy iptu_amount column is ignored: IPTU comes from the taxes register
        const withIptu = breakdown({ received_amount: 3950, energy_portion: 350, other_income: 109.8, other_expenses: 50, iptu_amount: 140, agency_fee_pct: 10 } as Parameters<typeof breakdown>[0]);
        expect(withIptu.grossRent).toBe(4000);
        expect(withIptu.opex).toBe(559.8);
        expect(withIptu.noi).toBe(3790.2);
    });
});

describe("template import", () => {
    it("detects the template and maps every column", () => {
        const tsv = [INCOME_TEMPLATE_HEADERS.join("\t"), "01/09/2026\tKitnet 2\t4000\t10\t3950\t350\t109,80\t50\t280,50\tSim\tok"].join("\n");
        const sheet = parseSheet(tsv);
        expect(isIncomeTemplate(sheet.headers)).toBe(true);
        const mapping = suggestMapping(sheet.headers, sheet.dateColumn);
        expect(mapping).toEqual(["ignore", "unit", "gross", "fee_pct", "received", "energy", "other", "other_expenses", "condo", "fee_on_condo", "notes"]);
        const rows = buildImportRows(sheet, mapping, { agencyFeePct: 10, todayMonth: "2026-09" });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ month: "2026-09", gross_rent: 4000, received_amount: 3950, energy_portion: 350, other_income: 109.8, other_expenses: 50, agency_fee_pct: 10, fee_on_condo: true, status: "CONFIRMED", notes: "ok" });
    });

    it("carries the unit name, the condominium and whether the fee applies to it", () => {
        const line = (flag: string) => [INCOME_TEMPLATE_HEADERS.join("\t"), `01/09/2026\tKitnet 2\t1300\t10\t\t\t\t\t280,50\t${flag}\t`].join("\n");
        const build = (flag: string, feeOnCondo?: boolean) => {
            const sheet = parseSheet(line(flag));
            return buildImportRows(sheet, suggestMapping(sheet.headers, sheet.dateColumn), { agencyFeePct: 10, todayMonth: "2026-09", feeOnCondo })[0];
        };
        expect(build("Não")).toMatchObject({ month: "2026-09", unit_name: "Kitnet 2", gross_rent: 1300, condo_amount: 280.5, fee_on_condo: false });
        expect(build("sim").fee_on_condo).toBe(true);
        expect(build("").fee_on_condo).toBeUndefined();          // blank cell: the server keeps what the row has (false for a new row)
        expect(build("", true).fee_on_condo).toBe(true);         // sheet without the column: the dialog's default
        expect(parseYesNo("NÃO")).toBe(false);
        expect(parseYesNo("x")).toBe(true);
        expect(parseYesNo("talvez")).toBeNull();
    });

    it("keeps one row per month and unit, and merges duplicates of the same unit", () => {
        const tsv = [
            INCOME_TEMPLATE_HEADERS.join("\t"),
            "01/09/2026\tKitnet 1\t1000\t10\t\t\t\t\t\t\t",
            "01/09/2026\tKitnet 2\t1100\t10\t\t\t\t\t\t\t",
            "01/09/2026\tkitnet 2\t1100\t10\t990\t\t\t\t\t\t",   // same unit, more cells filled → wins
            "01/08/2026\tKitnet 10\t900\t10\t\t\t\t\t\t\t",
            "01/08/2026\tKitnet 9\t900\t10\t\t\t\t\t\t\t",
        ].join("\n");
        const sheet = parseSheet(tsv);
        const rows = buildImportRows(sheet, suggestMapping(sheet.headers, sheet.dateColumn), { agencyFeePct: 10, todayMonth: "2026-09" });
        expect(rows.map(r => `${r.month} ${r.unit_name}`)).toEqual(["2026-08 Kitnet 9", "2026-08 Kitnet 10", "2026-09 Kitnet 1", "2026-09 kitnet 2"]);
        expect(rows[3].received_amount).toBe(990);
    });

    it("still recognises templates exported before the unit and condominium columns existed", () => {
        const legacy = ["Mês (dd/mm/aaaa)", "Aluguel bruto (R$)", "Taxa imobiliária (%)", "Valor recebido (R$)", "Energia (R$)", "Custo de energia (R$)", "Outras despesas (R$)", "Comentários"];
        expect(isIncomeTemplate(legacy)).toBe(true);
        const withIptu = [...legacy.slice(0, 7), "IPTU (R$)", "Comentários"];
        expect(isIncomeTemplate(withIptu)).toBe(true);
        expect(isIncomeTemplate(["Data", "Valor", "Descrição"])).toBe(false);
        const sheet = parseSheet([legacy.join("\t"), "01/09/2026\t4000\t10\t3950\t350\t109,80\t50\tok"].join("\n"));
        const rows = buildImportRows(sheet, suggestMapping(sheet.headers, sheet.dateColumn), { agencyFeePct: 10, todayMonth: "2026-09" });
        expect(rows[0]).toMatchObject({ gross_rent: 4000, other_expenses: 50 });
        expect(rows[0].unit_name).toBeUndefined();
    });

    it("marks future months as expected and ignores derived columns", () => {
        const sheet = parseSheet("DATA\tRenda Aluguel\tAluguel líquido\tComentarios\n24/12/2026\t3950\t3600\t\n24/09/2026\t3950\t3600\tx");
        const mapping = suggestMapping(sheet.headers, sheet.dateColumn);
        expect(mapping).toEqual(["ignore", "received", "ignore", "notes"]);
        const rows = buildImportRows(sheet, mapping, { agencyFeePct: 10, todayMonth: "2026-09" });
        expect(rows.map(r => r.status)).toEqual(["CONFIRMED", "EXPECTED"]);
    });
});

describe("summarize", () => {
    const row = (m: string): PropertyIncomeRow => ({
        id: m, property_id: "p", month: `${m}-01`, received_on: null, received_amount: 3950, energy_portion: 350,
        other_income: 100, other_expenses: 0, iptu_amount: 0, agency_fee_pct: 10, status: "CONFIRMED", source: "MANUAL", bank_reference: null, notes: null,
    });
    it("totals confirmed months", () => {
        const s = summarize([row("2026-08"), row("2026-09")]);
        expect(s.totalGross).toBe(8000);
        expect(s.totalFee).toBe(800);
        expect(s.totalRevenue).toBe(8700);
        expect(s.totalNoi).toBe(7700);
        expect(s.confirmedMonths).toBe(2);
    });
});

describe("rentHistory", () => {
    const row = (m: string, received: number, over: Partial<PropertyIncomeRow> = {}): PropertyIncomeRow => ({
        id: m, property_id: "p", month: `${m}-01`, received_on: null, received_amount: received, energy_portion: 0,
        other_income: 0, other_expenses: 0, iptu_amount: 0, agency_fee_pct: 10, status: "CONFIRMED", source: "MANUAL", bank_reference: null, notes: null,
        ...over,
    });
    // gross = received ÷ 0.9 → 900 → 1000, 945 → 1050
    const rows = [
        row("2024-11", 900), row("2024-12", 900),
        row("2025-01", 900), row("2025-02", 0), row("2025-03", 945), row("2025-12", 945),
        row("2026-01", 945, { status: "EXPECTED" }),
    ];
    it("keeps confirmed months with rent, oldest first", () => {
        const h = rentHistory(rows);
        expect(h.points.map(p => p.key)).toEqual(["2024-11", "2024-12", "2025-01", "2025-03", "2025-12"]);
        expect(h.points[0]).toMatchObject({ month: "nov/2024", bruto: 1000, liquido: 900 });
    });
    it("lists each change of the rent, skipping the vacancy month", () => {
        expect(rentHistory(rows).adjustments).toEqual([{ month: "2025-03", from: 1000, to: 1050, pct: 5 }]);
    });
    it("summarises by year with growth on the end-of-year rent", () => {
        expect(rentHistory(rows).years).toEqual([
            { year: 2024, months: 2, avgGross: 1000, lastGross: 1000, growthPct: null },
            { year: 2025, months: 3, avgGross: 1033.33, lastGross: 1050, growthPct: 5 },
        ]);
    });
    it("handles an empty ledger", () => {
        expect(rentHistory([])).toEqual({ points: [], adjustments: [], years: [] });
    });
});

describe("condominium and per-unit rows", () => {
    const row = (m: string, unit: string | null, received: number, over: Partial<PropertyIncomeRow> = {}): PropertyIncomeRow => ({
        id: `${m}-${unit ?? "all"}`, property_id: "p", month: `${m}-01`, received_on: null, received_amount: received, energy_portion: 0,
        other_income: 0, other_expenses: 0, condo_amount: 0, unit_id: unit, unit_name: unit, iptu_amount: 0, agency_fee_pct: 10,
        status: "CONFIRMED", source: "MANUAL", bank_reference: null, notes: null, ...over,
    });

    // rent 4.000, fee 10 %, energy 350, energy cost 109,80, other 50, condominium 250
    const base = { energy_portion: 350, other_income: 109.8, other_expenses: 50, condo_amount: 250, agency_fee_pct: 10 };

    it("fee on the rent only: the tenant's condominium comes in full inside the deposit and pays the expense", () => {
        expect(receivedFromGross(4000, 10, 350, 250, false)).toBe(4200);
        const b = breakdown({ ...base, received_amount: 4200, fee_on_condo: false });
        expect(b).toMatchObject({ netRent: 3600, grossRent: 4000, rentFee: 400, condoFee: 0, feeAmount: 400, condo: 250, condoIn: 250, condoPaid: 250 });
        expect(b.revenue).toBe(4600);     // 4000 + 350 + 250
        expect(b.opex).toBe(809.8);       // 400 + 109,80 + 50 + 250
        expect(b.noi).toBe(3790.2);       // the same as without a condominium: it comes in and goes out
    });

    it("fee on rent + condominium: the agency keeps its % of the condominium too, and the property bears it", () => {
        expect(receivedFromGross(4000, 10, 350, 250, true)).toBe(4175);
        const b = breakdown({ ...base, received_amount: 4175, fee_on_condo: true });
        expect(b).toMatchObject({ netRent: 3600, grossRent: 4000, rentFee: 400, condoFee: 25, feeAmount: 425, condo: 250, condoIn: 225, condoPaid: 250 });
        expect(b.revenue).toBe(4600);
        expect(b.opex).toBe(834.8);       // 425 + 109,80 + 50 + 250
        expect(b.noi).toBe(3765.2);       // 4175 − 109,80 − 50 − 250
        expect(b.noi).toBe(Math.round((b.revenue - b.opex) * 100) / 100);
    });

    it("a vacant unit still owes the condominium: nothing comes in, NOI is negative", () => {
        expect(receivedFromGross(0, 10, 0, 250, false)).toBe(0);   // no rent, no tenant paying the condominium
        const b = breakdown({ received_amount: 0, energy_portion: 0, other_income: 0, condo_amount: 250, agency_fee_pct: 10, fee_on_condo: true });
        expect(b).toMatchObject({ netRent: 0, grossRent: 0, feeAmount: 0, condoIn: 0, condoPaid: 0, revenue: 0, opex: 250, noi: -250 });
        expect(breakdown({ received_amount: 3950, energy_portion: 350, other_income: 0, agency_fee_pct: 10 }).condo).toBe(0);
    });

    it("identifies a row by month and unit", () => {
        expect(incomeRowKey({ month: "2026-09-01", unit_id: "u1" })).toBe("2026-09|u1");
        expect(incomeRowKey({ month: "2026-09", unit_id: null })).toBe("2026-09|");
        expect(incomeRowKey({ month: "2026-09" })).toBe("2026-09|");
    });

    it("adds a month's unit rows into one row whose breakdown matches the sums", () => {
        const rows = [
            row("2026-09", "u1", 990, { agency_fee_pct: 10, condo_amount: 100, fee_on_condo: true }),   // (1000 + 100) × 0,9: gross 1000, fee 100 + 10
            row("2026-09", "u2", 1200, { agency_fee_pct: 0, energy_portion: 200 }),                      // net 1000, gross 1000, fee 0
            row("2026-09", "u3", 0, { agency_fee_pct: 10, condo_amount: 100 }),                           // vacant: only the condominium
            row("2026-08", "u1", 900, { agency_fee_pct: 10 }),
        ];
        const monthly = aggregateIncomeByMonth(rows);
        expect(monthly.map(r => r.month)).toEqual(["2026-09-01", "2026-08-01"]);
        expect(monthly[1]).toBe(rows[3]);                                            // a single row passes through
        const b = breakdown(monthly[0]);
        expect(b).toMatchObject({ received: 2190, energy: 200, netRent: 1900, grossRent: 2000, rentFee: 100, condoFee: 10, feeAmount: 110, condo: 200, condoIn: 90, condoPaid: 100 });
        expect(b.revenue).toBe(2300);     // 2000 + 200 + 100
        expect(b.noi).toBe(1990);         // 2190 − 200
        const parts = rows.slice(0, 3).map(r => breakdown(r));
        expect(b.noi).toBe(parts.reduce((a, p) => a + p.noi, 0));
        expect(b.opex).toBe(parts.reduce((a, p) => a + p.opex, 0));
        expect(monthly[0].unit_id).toBeNull();
        expect(aggregateIncomeByMonth(monthly)).toEqual(monthly);                    // idempotent
    });

    it("in a month with confirmed rows, a unit still expected does not count yet", () => {
        const mixed = aggregateIncomeByMonth([row("2026-09", "u1", 900), row("2026-09", "u2", 900, { status: "EXPECTED" })]);
        expect(mixed[0]).toMatchObject({ status: "CONFIRMED", received_amount: 900 });
        const allExpected = aggregateIncomeByMonth([row("2026-10", "u1", 900, { status: "EXPECTED" }), row("2026-10", "u2", 900, { status: "EXPECTED" })]);
        expect(allExpected[0]).toMatchObject({ status: "EXPECTED", received_amount: 1800 });
    });

    it("summarize counts months, not unit rows, and totals the condominium", () => {
        const s = summarize([
            row("2026-08", "u1", 950, { condo_amount: 50 }), row("2026-08", "u2", 900),
            row("2026-09", "u1", 950, { condo_amount: 50 }), row("2026-09", "u2", 900),
        ]);
        expect(s.confirmedMonths).toBe(2);
        expect(s.totalReceived).toBe(3700);
        expect(s.totalGross).toBe(4000);
        expect(s.totalCondo).toBe(100);
        expect(s.totalCondoIn).toBe(100);
        expect(s.totalNoi).toBe(3600);    // the tenants paid the condominium: 3700 − 100
        expect(s.latest?.received).toBe(1850);
    });

    it("rent history follows the property's total rent per month", () => {
        const h = rentHistory([row("2026-08", "u1", 900), row("2026-08", "u2", 900), row("2026-09", "u1", 900), row("2026-09", "u2", 990)]);
        expect(h.points.map(p => p.bruto)).toEqual([2000, 2100]);
        expect(h.adjustments).toEqual([{ month: "2026-09", from: 2000, to: 2100, pct: 5 }]);
    });
});
