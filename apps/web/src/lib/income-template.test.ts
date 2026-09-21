import { describe, expect, it } from "vitest";
import { buildIncomeTemplate, xlsxToTsv } from "./income-template";
import { buildImportRows, isIncomeTemplate, parseSheet, suggestMapping, type PropertyIncomeRow } from "./property-income";

const row = (m: string, unit: string | null, received: number, over: Partial<PropertyIncomeRow> = {}): PropertyIncomeRow => ({
    id: `${m}-${unit ?? "all"}`, property_id: "p", month: `${m}-01`, received_on: null, received_amount: received, energy_portion: 0,
    other_income: 0, other_expenses: 0, condo_amount: 0, unit_id: unit ? `id-${unit}` : null, unit_name: unit, iptu_amount: 0, agency_fee_pct: 10,
    status: "CONFIRMED", source: "MANUAL", bank_reference: null, notes: null, ...over,
});
const roundTrip = async (buffer: Buffer) => {
    const sheet = parseSheet(await xlsxToTsv(buffer));
    return { sheet, rows: buildImportRows(sheet, suggestMapping(sheet.headers, sheet.dateColumn), { agencyFeePct: 10, todayMonth: "2026-09" }) };
};

describe("income Excel template", () => {
    it("exports the ledger with unit and condominium and imports it back unchanged", async () => {
        const ledger = [
            row("2026-09", "Kitnet 1", 900, { condo_amount: 120.5, notes: "reajuste" }),
            row("2026-09", "Kitnet 2", 1250, { energy_portion: 200, other_income: 80, other_expenses: 35 }),
            row("2026-08", null, 3950, { energy_portion: 350 }),
        ];
        const { sheet, rows } = await roundTrip(await buildIncomeTemplate({ propertyName: "Santo Antônio", feePct: 10, rows: ledger, units: ["Kitnet 1", "Kitnet 2"], now: new Date(2026, 8, 20) }));
        expect(isIncomeTemplate(sheet.headers)).toBe(true);
        expect(rows).toHaveLength(3);
        expect(rows[0]).toMatchObject({ month: "2026-08", received_amount: 3950, energy_portion: 350 });
        expect(rows[0].unit_name).toBeUndefined();
        expect(rows[1]).toMatchObject({ month: "2026-09", unit_name: "Kitnet 1", gross_rent: 1000, received_amount: 900, condo_amount: 120.5, notes: "reajuste" });
        expect(rows[2]).toMatchObject({ month: "2026-09", unit_name: "Kitnet 2", received_amount: 1250, energy_portion: 200, other_income: 80, other_expenses: 35 });
    });

    it("the empty template of a multi-unit property has one row per month and unit, and imports nothing until it is filled", async () => {
        const buffer = await buildIncomeTemplate({ propertyName: "Kitnets", feePct: 10, months: 2, units: ["Kitnet 1", "Kitnet 2", "Kitnet 3"], now: new Date(2026, 8, 20) });
        const tsv = await xlsxToTsv(buffer);
        const lines = tsv.split("\n");
        expect(lines[0].split("\t").slice(0, 3)).toEqual(["Mês (dd/mm/aaaa)", "Unidade", "Aluguel bruto (R$)"]);
        expect(lines.slice(1).map(l => l.split("\t")[1])).toEqual(["Kitnet 1", "Kitnet 2", "Kitnet 3", "Kitnet 1", "Kitnet 2", "Kitnet 3"]);
        expect((await roundTrip(buffer)).rows).toEqual([]);
    });

    it("a single-unit property keeps one row per month with the unit column blank", async () => {
        const tsv = await xlsxToTsv(await buildIncomeTemplate({ propertyName: "Casa", feePct: 10, months: 3, now: new Date(2026, 8, 20) }));
        const lines = tsv.split("\n").slice(1);
        expect(lines).toHaveLength(3);
        expect(lines.every(l => l.split("\t")[1] === "")).toBe(true);
    });
});
