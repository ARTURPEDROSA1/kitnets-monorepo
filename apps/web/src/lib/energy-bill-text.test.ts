import { describe, expect, it } from "vitest";
import { parseBillText, parseBrNumber, sumCompensation } from "./energy-bill-text";
import { applyBillText, postProcessExtractedBill, type ExtractedEnergyBill } from "./energy-bill-extract";

// The lines of real CEMIG bills (UC 2.777.942.018-25, Rua Claudionor Idelf Braga), as their text layers read
const SET_2026 = [
    "SALDO ATUAL DE GERAÇÃO: 457,85 kWh. Tarifa vigente conforme Res Aneel nº 3.589, de 26/05/2026. Redução",
    "Energia kWh PRB212101622 4.149 5.361 1 1.212",
    "Energia Injetada PRB212101622 919 1.911 1 992",
    "Custo de Disponibilidade 1,17263918 117,25 3,94 117,25 18,00 21,10 0,92214000",
    "Energia SCEE ISENTA kWh 1.212 0,62352000 755,70 0,00 0,00 0,00 0,00 0,62352000",
    "Energia compensada GD I kWh 220 0,62352000 -137,17 0,00 0,00 0,00 0,00 0,62352000",
    "Energia compensada GD II kWh 992 0,46261740 -458,91 0,00 0,00 0,00 0,00 0,46261740",
    "Ajuste Custo Disponibilidade -92,21 0,00 0,00 0,00 0,00 0,92214000",
    "TOTAL 184,66 3,94 117,25 21,10",
].join("\n");

// May 2026 prints the regimes as "Compensação GD …" and the exempt energy as "Energia compensada ISENTA"
const MAI_2026 = [
    "SALDO ATUAL DE GERAÇÃO: 0,00 kWh. Tarifa vigente conforme Res Aneel nº 3.459, de 20/05/2025. Redução aliquota",
    "Energia kWh PRB212101622 1.741 2.417 1 676",
    "Energia Injetada PRB212101622 359 467 1 108",
    "Energia Elétrica kWh 337 1,14969419 387,80 22,25 387,80 18,00 69,80 0,87675679",
    "Energia compensada ISENTA kWh 339 0,58357000 197,63 0,00 0,00 0,00 0,00 0,58357000",
    "Compensação GD I kWh 231 0,58357000 -134,61 0,00 0,00 0,00 0,00 0,58357000",
    "Compensação GD II kWh 108 0,42924537 -46,35 0,00 0,00 0,00 0,00 0,42924537",
    "TOTAL 404,47 22,25 387,80 69,80",
].join("\n");

// A unit that only receives credits (Rua José Góis): one regime, no injected-energy row
const AGO_2026_GOIS = [
    "SALDO ATUAL DE GERAÇÃO: 1.586,61 kWh. Tarifa vigente conforme Res Aneel nº 3.589, de 26/05/2026. Redução",
    "Energia kWh AMM222130135 2.816 2.884 1 68",
    "Energia SCEE ISENTA kWh 38 0,62352000 23,69 0,00 0,00 0,00 0,00 0,62352000",
    "Energia compensada GD I kWh 38 0,62352000 -23,69 0,00 0,00 0,00 0,00 0,62352000",
    "TOTAL 32,93 1,36 35,39 6,37",
].join("\n");

describe("parseBillText", () => {
    it("reads every compensation line of a bill that compensates in two regimes", () => {
        const facts = parseBillText(SET_2026);
        expect(facts.compensation).toEqual([
            { regime: "GD I", kwh: 220, amount: -137.17 },
            { regime: "GD II", kwh: 992, amount: -458.91 },
        ]);
        expect(sumCompensation(facts.compensation)).toEqual({ kwh: 1212, amount: -596.08 });
        expect(facts.sceeExempt).toEqual({ kwh: 1212, amount: 755.7 });
        expect(facts.injected).toEqual({ meter: "PRB212101622", previous: 919, current: 1911, constant: 1, kwh: 992 });
        expect(facts.consumption).toEqual({ meter: "PRB212101622", previous: 4149, current: 5361, constant: 1, kwh: 1212 });
        expect(facts.generationBalanceKwh).toBe(457.85);
        expect(facts.totalAmount).toBe(184.66);
    });

    it("reads the months printed as “Compensação GD” with “Energia compensada ISENTA”", () => {
        const facts = parseBillText(MAI_2026);
        expect(sumCompensation(facts.compensation)).toEqual({ kwh: 339, amount: -180.96 });
        expect(facts.sceeExempt?.kwh).toBe(339);
        expect(facts.injected?.kwh).toBe(108);
        expect(facts.generationBalanceKwh).toBe(0);
    });

    it("reads a credit-receiving unit with no injected-energy row", () => {
        const facts = parseBillText(AGO_2026_GOIS);
        expect(facts.compensation).toEqual([{ regime: "GD I", kwh: 38, amount: -23.69 }]);
        expect(facts.injected).toBeNull();
        expect(facts.generationBalanceKwh).toBe(1586.61);
    });

    it("states nothing for a scanned bill", () => {
        expect(parseBillText("")).toEqual({ compensation: [], sceeExempt: null, consumption: null, injected: null, generationBalanceKwh: null, totalAmount: null });
    });

    it("parses Brazilian numbers", () => {
        expect(parseBrNumber("1.586,61")).toBe(1586.61);
        expect(parseBrNumber("1.212")).toBe(1212);
        expect(parseBrNumber("-137,17")).toBe(-137.17);
    });
});

const modelReading = (over: Partial<ExtractedEnergyBill> = {}): ExtractedEnergyBill => ({
    utilityCompany: "CEMIG", consumerUnit: "2.777.942.018-25", installationClass: null, tariffModality: null,
    installationAddress: null, installationCity: null, installationState: null, installationZip: null,
    referenceMonth: "2026-09", referenceMonthLabel: "SET/2026", readingDateCurrent: null, readingDatePrevious: null, readingDateNext: null,
    dueDate: "2026-10-19", billingDays: 31, meterNumber: null, gridReadingPrevious: null, gridReadingCurrent: null,
    gridConsumptionKwh: 1212, dailyAvgKwh: 39.09, monthlyAvgKwh: null,
    injectedReadingPrevious: null, injectedReadingCurrent: null, solarInjectedKwh: 0, solarCompensatedKwh: 220,
    generationBalanceKwh: 457.81, unitPrice: 1.18, availabilityCostKwh: 100, availabilityCostAmount: 117.25,
    energySceeExemptAmount: 755.7, energyCompensatedAmount: -137.17, availabilityAdjustmentAmount: -92.21, bonusDiscountsAmount: 0,
    flagType: "Amarela", flagAmount: 0.5, taxesIcms: 21.1, taxesPisCofins: 3.94, totalAmount: 184.66,
    historicalConsumption: [], confidence: 0.9,
    ...over,
});

describe("the bill as saved", () => {
    it("corrects the model with the text layer (the 2026-10-06 bill: GD I only, injected 0, saldo misread)", () => {
        const bill = applyBillText(modelReading(), parseBillText(SET_2026));
        expect(bill).toMatchObject({ solarCompensatedKwh: 1212, energyCompensatedAmount: -596.08, solarInjectedKwh: 992, generationBalanceKwh: 457.85 });
        expect(bill.compensationLines).toHaveLength(2);
        expect(bill.textChecked).toContain("solarCompensatedKwh");
    });

    it("adds up the model's own compensation lines when the bill has no text (a scan)", () => {
        const bill = postProcessExtractedBill(modelReading({
            compensationLines: [{ regime: "GD I", kwh: 220, amount: -137.17 }, { regime: "GD II", kwh: 992, amount: 458.91 }],
        }));
        expect(bill.solarCompensatedKwh).toBe(1212);
        expect(bill.energyCompensatedAmount).toBe(-596.08);
    });

    it("takes the injected energy from the injected meter when the model read 0", () => {
        const bill = postProcessExtractedBill(modelReading({ injectedReadingPrevious: 919, injectedReadingCurrent: 1911, solarInjectedKwh: 0 }));
        expect(bill.solarInjectedKwh).toBe(992);
    });

    it("keeps the model's reading where neither lines nor text say otherwise", () => {
        const bill = postProcessExtractedBill(modelReading());
        expect(bill.solarCompensatedKwh).toBe(220);
        expect(bill.compensationLines).toEqual([]);
    });
});
