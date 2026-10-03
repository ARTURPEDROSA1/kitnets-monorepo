import { describe, expect, it } from "vitest";
import { cardOffer, type CardOfferInput } from "./card-offer";

const input = (over: Partial<CardOfferInput> = {}): CardOfferInput => ({
    status: "ISSUED", amount: 249.9, due_date: "2026-10-20", fine_pct: 2, interest_pct_month: 1, days_payable_after_due: 30,
    cardFeePct: 3.99, cardFeeFixed: 0.39, stripeUsable: true, today: "2026-10-15", ...over,
});

describe("cardOffer", () => {
    it("on time: the invoice grossed up by the fee", () => {
        const o = cardOffer(input());
        expect(o).toEqual({ available: true, late: { daysLate: 0, fine: 0, interest: 0, extra: 0, total: 249.9 }, gross: 260.7, surcharge: 10.8, net: 249.9 });
    });

    it("late: the boleto's late charges first, then the fee on the whole", () => {
        const o = cardOffer(input({ today: "2026-10-27" }));
        if (!o.available) throw new Error("expected an offer");
        expect(o.late).toMatchObject({ daysLate: 7, fine: 5, interest: 0.58, total: 255.48 });
        expect(o.net).toBe(255.48);
        // (255.48 + 0.39) / 0.9601 = 266.5035… → up to the centavo
        expect(o.gross).toBe(266.51);
        expect(o.surcharge).toBe(11.03);
    });

    it("says why there is no card", () => {
        expect(cardOffer(input({ status: "PAID" }))).toEqual({ available: false, reason: "NOT_OPEN" });
        expect(cardOffer(input({ status: "CANCELLED" }))).toEqual({ available: false, reason: "NOT_OPEN" });
        expect(cardOffer(input({ stripeUsable: false }))).toEqual({ available: false, reason: "NO_STRIPE" });
        expect(cardOffer(input({ cardFeePct: null }))).toEqual({ available: false, reason: "FEE_UNDECIDED" });
        expect(cardOffer(input({ cardFeeFixed: undefined }))).toEqual({ available: false, reason: "FEE_UNDECIDED" });
        expect(cardOffer(input({ today: "2026-11-20" }))).toEqual({ available: false, reason: "WINDOW_CLOSED" });
        // no window decided: still payable, with the late charges
        expect(cardOffer(input({ today: "2026-11-20", days_payable_after_due: null }))).toMatchObject({ available: true, late: { daysLate: 31 } });
    });

    it("a draft can be paid by card too (the card does not need the boleto)", () => {
        expect(cardOffer(input({ status: "DRAFT" }))).toMatchObject({ available: true });
    });
});
