import { describe, expect, it } from "vitest";
import type { PropertyTransaction } from "./property-investment";
import {
    checkIptuTotals,
    effectiveTax,
    iptuByMonth,
    iptuFromExtraction,
    iptuSeries,
    iptuYearsFromTransactions,
    landlordIptuByMonth,
    landlordIptuForMonth,
    landlordTaxesByMonth,
    landlordTaxTotals,
    normalizeInstallments,
    parseReferencia,
    splitInstallments,
    summarizeTaxes,
    taxInPeriod,
    taxMonths,
    type ExtractedIptu,
    type PropertyTax,
    type TaxInstallment,
} from "./property-taxes";

const blankAssessment = {
    municipio: null, inscricao: null, referencia: null, vencimento: null, area_terreno: null, area_construida: null,
    valor_venal_terreno: null, valor_venal_predial: null, valor_venal_imovel: null, aliquota_pct: null,
    valor_imposto: null, coleta_lixo: null, tsa: null, desconto: null, document_path: null, extracted_at: null,
};
const tax = (year: number, kind: PropertyTax["kind"], amount: number, paid_by: PropertyTax["paid_by"] = "TENANT", installments: TaxInstallment[] = []): PropertyTax =>
    ({ id: `${kind}-${year}-${amount}`, property_id: "p", year, kind, amount, paid_by, paid_on: null, comment: null, installments, ...blankAssessment });

describe("IPTU document extraction helpers", () => {
    // The Nova Lima DAM from the owner's screenshot
    const dam: ExtractedIptu = {
        municipio: "NOVA LIMA", contribuinte: null, inscricao: "01/07/029/0055-001", exercicio: 2026, referencia: "Única", vencimento: "2026-06-10",
        areaTerreno: 360, areaConstruida: 112.42, valorVenalTerreno: 41658.62, valorVenalPredial: 93606.47, valorVenalImovel: 135265.09,
        aliquotaPct: 0.5, valorImposto: 676.33, coletaLixo: 270.53, tsa: 0, desconto: 33.82, total: 913.04, confidence: 0.95,
    };
    it("checks the DAM arithmetic", () => {
        expect(checkIptuTotals(dam)).toEqual({ computed: 913.04, matches: true });
        expect(checkIptuTotals({ ...dam, total: 900 })).toEqual({ computed: 913.04, matches: false });
        expect(checkIptuTotals({ ...dam, valorImposto: null })).toEqual({ computed: null, matches: null });
    });
    it("parses the parcela reference", () => {
        expect(parseReferencia("Única")).toBeNull();
        expect(parseReferencia("1/6")).toEqual({ numero: 1, de: 6 });
        expect(parseReferencia("3 / 6")).toEqual({ numero: 3, de: 6 });
        expect(parseReferencia(null)).toBeNull();
    });
    it("maps the extraction onto a tax row", () => {
        const row = iptuFromExtraction(dam, "TENANT");
        expect(row).toMatchObject({ year: 2026, kind: "IPTU", amount: 913.04, paid_by: "TENANT", valor_venal_imovel: 135265.09, aliquota_pct: 0.5, valor_imposto: 676.33, coleta_lixo: 270.53, desconto: 33.82, area_construida: 112.42, inscricao: "01/07/029/0055-001", vencimento: "2026-06-10" });
        expect(iptuFromExtraction({ ...dam, total: null }, "LANDLORD").amount).toBe(913.04);   // computed from the parts
        expect(iptuFromExtraction({ ...dam, exercicio: null }, "TENANT", 2030).year).toBe(2030);
    });
});

describe("splitInstallments", () => {
    it("splits equally and puts the rounding on the last parcela", () => {
        const parts = splitInstallments(913.04, 6, "TENANT");
        expect(parts).toHaveLength(6);
        expect(parts.map(p => p.amount)).toEqual([152.17, 152.17, 152.17, 152.17, 152.17, 152.19]);
        expect(parts.reduce((a, p) => a + p.amount, 0)).toBeCloseTo(913.04, 2);
        expect(parts.every(p => p.paid_by === "TENANT" && p.paid_on === null)).toBe(true);
    });
    it("keeps payer and date of existing parcelas when re-spreading", () => {
        const existing: TaxInstallment[] = [{ seq: 1, amount: 100, paid_by: "LANDLORD", paid_on: "2026-02-10" }, { seq: 2, amount: 100, paid_by: "TENANT", paid_on: null }];
        const parts = splitInstallments(300, 2, "TENANT", existing);
        expect(parts[0]).toEqual({ seq: 1, amount: 150, paid_by: "LANDLORD", paid_on: "2026-02-10" });
        expect(parts[1]).toEqual({ seq: 2, amount: 150, paid_by: "TENANT", paid_on: null });
    });
    it("caps at six", () => {
        expect(splitInstallments(600, 12, "TENANT")).toHaveLength(6);
    });
});

describe("effectiveTax", () => {
    it("uses the row when there are no parcelas", () => {
        expect(effectiveTax(tax(2026, "IPTU", 913.04, "LANDLORD"))).toEqual({ amount: 913.04, byTenant: 0, byLandlord: 913.04, payer: "LANDLORD", installments: 0 });
    });
    it("sums parcelas and reports a mixed payer", () => {
        const parts: TaxInstallment[] = [
            { seq: 1, amount: 152.17, paid_by: "TENANT", paid_on: null },
            { seq: 2, amount: 152.17, paid_by: "LANDLORD", paid_on: null },   // vacancy month
            { seq: 3, amount: 152.17, paid_by: "TENANT", paid_on: null },
        ];
        const e = effectiveTax(tax(2026, "IPTU", 0, "TENANT", parts));
        expect(e.amount).toBeCloseTo(456.51, 2);
        expect(e.byTenant).toBeCloseTo(304.34, 2);
        expect(e.byLandlord).toBe(152.17);
        expect(e.payer).toBe("MIXED");
        expect(e.installments).toBe(3);
    });
});

describe("normalizeInstallments", () => {
    it("renumbers, clamps and sanitises", () => {
        const out = normalizeInstallments([
            { seq: 5, amount: -3, paid_by: "LANDLORD", paid_on: "bad" },
            { seq: 9, amount: "12.5" as unknown as number, paid_by: "x" as unknown as "TENANT", paid_on: "2026-03-01" },
        ]);
        expect(out).toEqual([
            { seq: 1, amount: 0, paid_by: "LANDLORD", paid_on: null },
            { seq: 2, amount: 12.5, paid_by: "TENANT", paid_on: "2026-03-01" },
        ]);
        expect(normalizeInstallments(undefined)).toEqual([]);
    });
});

describe("iptuSeries / summarizeTaxes", () => {
    const rows = [
        tax(2019, "IPTU", 661.63), tax(2020, "IPTU", 706.41), tax(2021, "IPTU", 744.93), tax(2022, "IPTU", 805.31),
        tax(2023, "IPTU", 808.76), tax(2024, "IPTU", 835.58), tax(2025, "IPTU", 878.77),
        tax(2026, "IPTU", 0, "TENANT", splitInstallments(913.04, 6, "TENANT").map(p => (p.seq === 4 ? { ...p, paid_by: "LANDLORD" as const } : p))),
        tax(2018, "ITBI", 7540), tax(2018, "OUTRO", 200),
    ];
    it("builds the yearly series with growth", () => {
        const s = iptuSeries(rows);
        expect(s.map(p => p.year)).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
        expect(s[0].growthPct).toBeNull();
        expect(s[1].growthPct).toBeCloseTo(6.8, 1);
        expect(s[7].amount).toBeCloseTo(913.04, 2);
        expect(s[7].byLandlord).toBe(152.17);
        expect(s[7].growthPct).toBeCloseTo(3.9, 1);
    });
    it("totals by payer across parcelas and computes growth figures", () => {
        const s = summarizeTaxes(rows);
        expect(s.iptuYears).toBe(8);
        expect(s.iptuTotal).toBeCloseTo(6354.43, 2);
        expect(s.iptuByLandlord).toBe(152.17);
        expect(s.iptuByTenant).toBeCloseTo(6354.43 - 152.17, 2);
        expect(s.iptuLatest).toEqual({ year: 2026, amount: 913.04 });
        expect(s.iptuGrowthPct).toBeCloseTo(3.9, 1);
        expect(s.iptuCagrPct).toBeCloseTo(4.7, 1);
        expect(s.itbi).toBe(7540);
        expect(s.other).toBe(200);
        expect(s.total).toBeCloseTo(6354.43 + 7740, 2);
    });
    it("handles an empty register", () => {
        const s = summarizeTaxes([]);
        expect(s.iptuLatest).toBeNull();
        expect(s.iptuGrowthPct).toBeNull();
        expect(s.iptuCagrPct).toBeNull();
        expect(s.total).toBe(0);
    });
});

describe("iptuYearsFromTransactions", () => {
    const tx = (occurred_on: string, kind: PropertyTransaction["kind"], amount: number): PropertyTransaction =>
        ({ id: occurred_on + kind, property_id: "p", occurred_on, kind, amount, interest_part: null, principal_part: null, insurance_part: null, comment: null, source: "IMPORT", bank_reference: null });
    it("groups monthly IPTU rows into one row per year", () => {
        const seeds = iptuYearsFromTransactions([
            tx("2023-06-24", "IPTU", 139.78), tx("2023-07-24", "IPTU", 139.78), tx("2022-10-24", "IPTU", 131.96),
            tx("2023-07-24", "TARIFA", 33.63),
        ]);
        expect(seeds).toHaveLength(2);
        expect(seeds[0]).toMatchObject({ year: 2022, kind: "IPTU", amount: 131.96, paid_by: "TENANT", paid_on: "2022-10-24", installments: [] });
        expect(seeds[1]).toMatchObject({ year: 2023, amount: 279.56, paid_on: "2023-07-24" });
    });
});

describe("landlordIptuByMonth", () => {
    it("puts landlord payments in the month they were paid and ignores tenant ones", () => {
        const rows = [
            { ...tax(2024, "IPTU", 1200, "LANDLORD"), paid_on: "2024-03-10" },
            tax(2025, "IPTU", 0, "TENANT", [
                { seq: 1, amount: 650, paid_by: "LANDLORD", paid_on: "2025-02-05" },
                { seq: 2, amount: 650, paid_by: "TENANT", paid_on: "2025-03-05" },
            ]),
            tax(2026, "IPTU", 900, "LANDLORD"),
            { ...tax(2023, "ITBI", 5000, "LANDLORD"), paid_on: "2023-01-10" },
        ];
        const m = landlordIptuByMonth(rows);
        expect(m.get("2024-03")).toBe(1200);
        expect(m.get("2025-02")).toBe(650);
        expect(m.get("2025-03")).toBeUndefined();
        expect(m.get("2026-01")).toBe(900);          // no date → January
        expect([...m.keys()].some(k => k.startsWith("2023"))).toBe(false);   // ITBI is not IPTU
        expect(landlordTaxesByMonth(rows).get("2023-01")).toBe(5000);        // but it is a landlord tax
        expect(landlordTaxTotals(rows)).toEqual({ iptu: 2750, itbi: 5000, other: 0, total: 7750 });
        expect(landlordIptuForMonth(rows, "2024-03")).toBe(1200);
        expect(landlordIptuForMonth(rows, "2024-04")).toBe(0);
    });
});

describe("taxMonths / taxInPeriod", () => {
    const parts: TaxInstallment[] = [
        { seq: 1, amount: 100, paid_by: "TENANT", paid_on: "2025-02-10" },
        { seq: 2, amount: 100, paid_by: "LANDLORD", paid_on: "2025-03-10" },
        { seq: 3, amount: 100, paid_by: "LANDLORD", paid_on: null },
    ];
    it("uses the parcela payment months, else the row date, else the whole exercício", () => {
        expect(taxMonths(tax(2025, "IPTU", 300, "TENANT", parts))).toEqual(["2025-02", "2025-03"]);
        expect(taxMonths({ ...tax(2024, "ITBI", 5000, "LANDLORD"), paid_on: "2024-08-20" })).toEqual(["2024-08"]);
        expect(taxMonths(tax(2023, "IPTU", 900))).toHaveLength(12);
        expect(taxMonths(tax(2023, "IPTU", 900))[11]).toBe("2023-12");
    });
    it("a row is in the period when any of its months is", () => {
        const row = tax(2025, "IPTU", 300, "TENANT", parts);
        expect(taxInPeriod(row, { start: "2025-03", end: "2025-12" })).toBe(true);
        expect(taxInPeriod(row, { start: "2025-04", end: null })).toBe(false);
        expect(taxInPeriod(tax(2023, "IPTU", 900), { start: "2023-11", end: "2024-02" })).toBe(true);
        expect(taxInPeriod(tax(2023, "IPTU", 900), { start: "2024-01", end: null })).toBe(false);
    });
});

describe("iptuByMonth", () => {
    it("puts each parcela in its payment month, split by payer, and skips other taxes", () => {
        const rows = [
            tax(2025, "IPTU", 300, "TENANT", [
                { seq: 1, amount: 100, paid_by: "TENANT", paid_on: "2025-02-10" },
                { seq: 2, amount: 100, paid_by: "LANDLORD", paid_on: "2025-02-25" },
                { seq: 3, amount: 100, paid_by: "LANDLORD", paid_on: null },      // undated 3rd parcela → March
            ]),
            tax(2024, "IPTU", 500, "LANDLORD"),                                    // undated single amount → January
            tax(2024, "ITBI", 9000, "LANDLORD"),
        ];
        expect(iptuByMonth(rows)).toEqual([
            { key: "2024-01", month: "jan/2024", inquilino: 0, proprietario: 500, total: 500 },
            { key: "2025-02", month: "fev/2025", inquilino: 100, proprietario: 100, total: 200 },
            { key: "2025-03", month: "mar/2025", inquilino: 0, proprietario: 100, total: 100 },
        ]);
    });
});
