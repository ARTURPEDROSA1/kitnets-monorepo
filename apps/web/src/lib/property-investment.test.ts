import { describe, expect, it } from "vitest";
import { parseSheet } from "./property-income";
import type { PropertyIncomeRow } from "./property-income";
import {
    buildTransactionImportRows,
    kindFromText,
    solarPayback,
    summarizeInvestment,
    type PropertyInvestment,
    type PropertyTransaction,
} from "./property-investment";

const tx = (occurred_on: string, kind: PropertyTransaction["kind"], amount: number, extra: Partial<PropertyTransaction> = {}): PropertyTransaction => ({
    id: `${occurred_on}-${kind}-${amount}`,
    property_id: "p",
    occurred_on,
    kind,
    amount,
    interest_part: null,
    principal_part: null,
    insurance_part: null,
    comment: null,
    source: "MANUAL",
    bank_reference: null,
    ...extra,
});

describe("kindFromText", () => {
    it("accepts codes, labels and statement wording", () => {
        expect(kindFromText("PRESTACAO")).toBe("PRESTACAO");
        expect(kindFromText("Prestação")).toBe("PRESTACAO");
        expect(kindFromText("Parc Cred Imob")).toBe("PRESTACAO");
        expect(kindFromText("Ant Par Financ")).toBe("AMORTIZACAO");
        expect(kindFromText("Quitacao Finan")).toBe("QUITACAO");
        expect(kindFromText("Custos de aquisição")).toBe("CUSTOS_AQUISICAO");
        expect(kindFromText("ITBI")).toBe("CUSTOS_AQUISICAO");
        expect(kindFromText("Energia solar")).toBe("ENERGIA_SOLAR");
        expect(kindFromText("Reforma")).toBe("REFORMA");
        expect(kindFromText("banana")).toBeNull();
    });
});

describe("buildTransactionImportRows", () => {
    it("parses the template layout and reports unknown kinds", () => {
        const tsv = [
            "Data (dd/mm/aaaa)\tTipo\tValor (R$)\tJuros (R$)\tAmortização (R$)\tSeguro (R$)\tComentários",
            "05/06/2018\tPrestação\tR$ 3.850,04\t2.935,21\t793,51\t96,32\tprimeira",
            "05/04/2018\tEntrada\t79.334,84\t\t\t\t",
            "05/04/2018\tCustos de aquisição\t10.000,00\t\t\t\tITBI + registro",
            "01/01/2020\tXablau\t10\t\t\t\t",
            "\t\t\t\t\t\t",
        ].join("\n");
        const { rows, errors } = buildTransactionImportRows(parseSheet(tsv));
        expect(rows).toHaveLength(3);
        expect(rows[0]).toMatchObject({ occurred_on: "2018-04-05", kind: "ENTRADA", amount: 79334.84 });
        expect(rows[2]).toMatchObject({ occurred_on: "2018-06-05", kind: "PRESTACAO", amount: 3850.04, interest_part: 2935.21, principal_part: 793.51, insurance_part: 96.32, comment: "primeira" });
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain("Xablau");
    });
});

describe("summarizeInvestment", () => {
    const inv: PropertyInvestment = {
        property_id: "p", purchase_price: 377000, acquired_on: "2018-04-24", built_area_m2: 112.42,
        lender: "Bradesco", contract_number: "906687", financing_system: "SAC", principal: 285665.16, annual_rate: 9.06,
        term_months: 360, contract_date: "2018-04-24", first_due_date: "2018-06-05", financing_status: "PAID_OFF", paid_off_on: "2021-08-25", notes: null,
    };
    const rows = [
        tx("2018-04-05", "ENTRADA", 79334.84),
        tx("2018-04-05", "CUSTOS_AQUISICAO", 10000),
        tx("2018-06-05", "PRESTACAO", 3850.04),
        tx("2018-07-05", "PRESTACAO", 3065.44),
        tx("2019-03-05", "AMORTIZACAO", 9050),
        tx("2021-08-01", "QUITACAO", 14243.23),
        tx("2021-08-01", "TARIFA", 33.63),
        tx("2023-11-24", "IPTU", 139.78),
        tx("2024-01-24", "REFORMA", 1050, { comment: "motor do portão" }),
        tx("2021-10-25", "ENERGIA_SOLAR", 20442.76),
    ];

    it("splits the outlay into invested, running costs and solar", () => {
        const s = summarizeInvestment(rows, inv);
        expect(s.downPayment).toBe(79334.84);
        expect(s.closingCosts).toBe(10000);
        expect(s.bankPaid).toBeCloseTo(3850.04 + 3065.44 + 9050 + 14243.23, 2);
        expect(s.installments).toBe(2);
        expect(s.capex).toBe(1050);
        expect(s.runningCosts).toBeCloseTo(33.63 + 139.78, 2);
        expect(s.invested).toBeCloseTo(79334.84 + 10000 + s.bankPaid + 1050, 2);
        expect(s.totalOutlay).toBeCloseTo(s.invested + s.runningCosts, 2);
        expect(s.solarInvested).toBe(20442.76);
        expect(s.invested + s.runningCosts + s.solarInvested).toBeCloseTo(rows.reduce((a, r) => a + r.amount, 0), 2); // solar excluded from invested
        expect(s.firstDate).toBe("2018-04-05");
        expect(s.lastDate).toBe("2024-01-24");
    });

    it("derives interest + insurance from the paid-off principal when parts are unknown", () => {
        const s = summarizeInvestment(rows, inv);
        expect(s.interestAndInsurance).toBeCloseTo(s.bankPaid - 285665.16, 2);
        const noInv = summarizeInvestment(rows, null);
        expect(noInv.interestAndInsurance).toBeNull();
    });

    it("prefers known parts over the payoff derivation", () => {
        const withParts = rows.map(r => (r.kind === "PRESTACAO" ? { ...r, interest_part: 100, insurance_part: 10 } : r));
        expect(summarizeInvestment(withParts, inv).interestAndInsurance).toBe(220);
    });
});

describe("solarPayback", () => {
    const month = (m: string, energy: number, cost: number, status: "CONFIRMED" | "EXPECTED" = "CONFIRMED"): PropertyIncomeRow => ({
        id: m, property_id: "p", month: `${m}-01`, received_on: null, received_amount: 3950, energy_portion: energy,
        other_income: cost, other_expenses: 0, iptu_amount: 0, agency_fee_pct: 10, status, source: "MANUAL", bank_reference: null, notes: null,
    });
    it("recovers the investment with net energy income from confirmed months only", () => {
        const s = solarPayback(1000, [month("2026-07", 350, 100), month("2026-08", 350, 110), month("2026-09", 350, 90, "EXPECTED")]);
        expect(s.recovered).toBe(490);
        expect(s.pct).toBe(49);
        expect(s.remaining).toBe(510);
        expect(s.months).toBe(2);
    });
    it("handles no investment", () => {
        expect(solarPayback(0, []).pct).toBe(0);
    });
});
