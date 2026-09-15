import { describe, expect, it } from "vitest";
import {
    breakdown,
    buildImportRows,
    isIncomeTemplate,
    INCOME_TEMPLATE_HEADERS,
    parseMoney,
    parseSheet,
    receivedFromGross,
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
        const tsv = [INCOME_TEMPLATE_HEADERS.join("\t"), "01/09/2026\t4000\t10\t3950\t350\t109,80\t50\tok"].join("\n");
        const sheet = parseSheet(tsv);
        expect(isIncomeTemplate(sheet.headers)).toBe(true);
        const mapping = suggestMapping(sheet.headers, sheet.dateColumn);
        expect(mapping).toEqual(["ignore", "gross", "fee_pct", "received", "energy", "other", "other_expenses", "notes"]);
        const rows = buildImportRows(sheet, mapping, { agencyFeePct: 10, todayMonth: "2026-09" });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ month: "2026-09", gross_rent: 4000, received_amount: 3950, energy_portion: 350, other_income: 109.8, other_expenses: 50, agency_fee_pct: 10, status: "CONFIRMED", notes: "ok" });
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
