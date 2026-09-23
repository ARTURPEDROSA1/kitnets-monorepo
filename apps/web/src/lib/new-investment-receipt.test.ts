import { describe, expect, it } from "vitest";
import {
    allocateFromReceipts,
    isEmptyReceipt,
    normalizeReceiptExtraction,
    payerTypeFromDocument,
    type ExtractedReceipt,
} from "./new-investment-receipt";

const receipt = (over: Partial<ExtractedReceipt>): ExtractedReceipt => ({
    amount: null, paid_on: null, payer_name: null, payer_document: null, payer_type: null, payee_name: null, description: null, ...over,
});

describe("payerTypeFromDocument", () => {
    it("tells a CPF from a CNPJ by their digits", () => {
        expect(payerTypeFromDocument("123.456.789-09")).toBe("PF");
        expect(payerTypeFromDocument("12345678909")).toBe("PF");
        expect(payerTypeFromDocument("12.345.678/0001-90")).toBe("PJ");
        expect(payerTypeFromDocument("12345678000190")).toBe("PJ");
    });

    it("still tells them apart when the bank masks part of the number", () => {
        expect(payerTypeFromDocument("***.456.789-**")).toBe("PF");
        expect(payerTypeFromDocument("12.345.678/****-**")).toBe("PJ");
        expect(payerTypeFromDocument("**.***.***/0001-**")).toBe("PJ");
    });

    it("gives up rather than guess", () => {
        expect(payerTypeFromDocument(null)).toBeNull();
        expect(payerTypeFromDocument("")).toBeNull();
        expect(payerTypeFromDocument("1234")).toBeNull();
        expect(payerTypeFromDocument("conta 12345-6")).toBeNull();
    });
});

describe("normalizeReceiptExtraction", () => {
    it("reads a PIX receipt the way a model returns it", () => {
        const r = normalizeReceiptExtraction({
            amount: "R$ 6.129,67",
            paid_on: "09/06/2026",
            payer_name: "AP DIGITAL LTDA",
            payer_document: "12.345.678/0001-90",
            payee_name: "ROFRAN CONSTRUTORA",
            description: "Parcela anual 03/2035",
        });
        expect(r).toMatchObject({ amount: 6129.67, paid_on: "2026-06-09", payer_type: "PJ", payee_name: "ROFRAN CONSTRUTORA" });
    });

    it("derives the payer type from the document, not from the name", () => {
        const r = normalizeReceiptExtraction({ payer_name: "ARTUR PEDROSA", payer_document: "***.456.789-**" });
        expect(r.payer_type).toBe("PF");
    });

    it("survives an empty answer", () => {
        const r = normalizeReceiptExtraction({});
        expect(isEmptyReceipt(r)).toBe(true);
    });
});

describe("allocateFromReceipts", () => {
    it("puts one receipt's whole amount on its payer", () => {
        const a = allocateFromReceipts([receipt({ amount: 6129.67, payer_type: "PF", paid_on: "2026-06-09" })]);
        expect(a).toEqual({ total: 6129.67, pf: 6129.67, pj: 0, payer: "PF", paid_on: "2026-06-09", unattributed: 0 });
    });

    it("splits an instalment settled from both pockets", () => {
        // the real case: part from the person's account, part from the company's
        const a = allocateFromReceipts([
            receipt({ amount: 3000, payer_type: "PJ", paid_on: "2026-05-11" }),
            receipt({ amount: 3065.99, payer_type: "PF", paid_on: "2026-05-11" }),
        ]);
        expect(a.payer).toBe("SPLIT");
        expect(a.pj).toBe(3000);
        expect(a.pf).toBe(3065.99);
        expect(a.total).toBe(6065.99);
    });

    it("takes the latest date as the day the instalment was settled", () => {
        const a = allocateFromReceipts([
            receipt({ amount: 1, payer_type: "PF", paid_on: "2026-05-09" }),
            receipt({ amount: 1, payer_type: "PJ", paid_on: "2026-05-11" }),
        ]);
        expect(a.paid_on).toBe("2026-05-11");
    });

    it("leaves the payer undecided when a receipt could not be attributed", () => {
        const a = allocateFromReceipts([
            receipt({ amount: 3000, payer_type: "PJ" }),
            receipt({ amount: 3065.99, payer_type: null }),
        ]);
        expect(a.payer).toBeNull();
        expect(a.unattributed).toBe(3065.99);
        expect(a.total).toBe(6065.99);
    });

    it("has nothing to say without amounts", () => {
        const a = allocateFromReceipts([receipt({ payer_type: "PF" })]);
        expect(a.payer).toBeNull();
        expect(a.total).toBe(0);
    });
});
