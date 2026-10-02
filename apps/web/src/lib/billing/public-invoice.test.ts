import { describe, expect, it } from "vitest";
import { PUBLIC_TOKEN_REGEX, firstNameOf, maskCpf, publicInvoiceState } from "./public-invoice";

const TODAY = "2026-10-15";
const charge = (status: "REQUESTED" | "OPEN" | "PAID" | "CANCELLED" | "EXPIRED" | "FAILED") => ({ status, due_date: "2026-10-20", digitable_line: null, pix_copy_paste: null, has_pdf: false });

describe("publicInvoiceState", () => {
    it("tells the tenant what to do", () => {
        expect(publicInvoiceState({ status: "ISSUED", due_date: "2026-10-20", charge: charge("OPEN") }, TODAY)).toBe("pay");
        expect(publicInvoiceState({ status: "ISSUED", due_date: "2026-10-10", charge: charge("OPEN") }, TODAY)).toBe("late_pay");
        expect(publicInvoiceState({ status: "ISSUED", due_date: "2026-10-20", charge: charge("REQUESTED") }, TODAY)).toBe("preparing");
        expect(publicInvoiceState({ status: "DRAFT", due_date: "2026-10-20", charge: null }, TODAY)).toBe("preparing");
        expect(publicInvoiceState({ status: "ISSUED", due_date: "2026-10-20", charge: charge("FAILED") }, TODAY)).toBe("preparing");
        expect(publicInvoiceState({ status: "ISSUED", due_date: "2026-10-01", charge: charge("EXPIRED") }, TODAY)).toBe("expired");
        expect(publicInvoiceState({ status: "PAID", due_date: "2026-10-20", charge: charge("PAID") }, TODAY)).toBe("paid");
        // the bank says paid before the invoice caught up: paid, not "pay again"
        expect(publicInvoiceState({ status: "ISSUED", due_date: "2026-10-20", charge: charge("PAID") }, TODAY)).toBe("paid");
        expect(publicInvoiceState({ status: "CANCELLED", due_date: "2026-10-20", charge: charge("CANCELLED") }, TODAY)).toBe("cancelled");
    });
});

describe("maskCpf", () => {
    it("keeps the middle six digits only", () => {
        expect(maskCpf("12345678901")).toBe("***.456.789-**");
        expect(maskCpf("123.456.789-01")).toBe("***.456.789-**");
        expect(maskCpf("1234")).toBeNull();
        expect(maskCpf(null)).toBeNull();
    });
});

describe("firstNameOf / token", () => {
    it("first name only", () => {
        expect(firstNameOf("  Ana Paula Souza ")).toBe("Ana");
        expect(firstNameOf(null)).toBe("");
    });

    it("a token is two uuids without dashes", () => {
        expect(PUBLIC_TOKEN_REGEX.test("a".repeat(64))).toBe(true);
        expect(PUBLIC_TOKEN_REGEX.test("0123456789abcdef".repeat(4))).toBe(true);
        expect(PUBLIC_TOKEN_REGEX.test("A".repeat(64))).toBe(false);
        expect(PUBLIC_TOKEN_REGEX.test("a".repeat(63))).toBe(false);
        expect(PUBLIC_TOKEN_REGEX.test("../etc/passwd")).toBe(false);
    });
});
