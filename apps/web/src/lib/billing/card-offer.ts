/**
 * Whether, and for how much, an invoice can be paid by card right now. Pure: the server brings the
 * invoice, the owner's card fee, whether the Stripe account can take cards, and today's date.
 *
 * The card costs the tenant the same late charges the boleto would (lib/invoice-late-fees.ts) plus
 * the card fee the owner passes on (lib/card-gross-up.ts). An undecided fee means no card: the owner
 * decides it in Configuração, nothing is assumed.
 */
import { cardFeeDecided, grossUp } from "@/lib/card-gross-up";
import { lateCharges, stillPayable, type LateCharges } from "@/lib/invoice-late-fees";
import type { InvoiceStatus } from "@/lib/invoice-views";

export interface CardOfferInput {
    status: InvoiceStatus;
    amount: number;
    /** `YYYY-MM-DD` */
    due_date: string;
    fine_pct: number | null;
    interest_pct_month: number | null;
    days_payable_after_due: number | null;
    cardFeePct: number | null | undefined;
    cardFeeFixed: number | null | undefined;
    /** the owner's Stripe account can take cards here */
    stripeUsable: boolean;
    /** `YYYY-MM-DD` */
    today: string;
}

export type CardDenied = "NOT_OPEN" | "NO_STRIPE" | "FEE_UNDECIDED" | "WINDOW_CLOSED";

export type CardOffer =
    | { available: true; late: LateCharges; /** what the card is charged */ gross: number; /** the card line */ surcharge: number; /** what the owner receives: amount + late */ net: number }
    | { available: false; reason: CardDenied };

export function cardOffer(input: CardOfferInput): CardOffer {
    if (input.status !== "DRAFT" && input.status !== "ISSUED") return { available: false, reason: "NOT_OPEN" };
    if (!input.stripeUsable) return { available: false, reason: "NO_STRIPE" };
    if (!cardFeeDecided(input.cardFeePct, input.cardFeeFixed)) return { available: false, reason: "FEE_UNDECIDED" };
    if (!stillPayable(input, input.today)) return { available: false, reason: "WINDOW_CLOSED" };
    const late = lateCharges(input.amount, input, input.today);
    const g = grossUp(late.total, { pct: input.cardFeePct as number, fixed: input.cardFeeFixed as number });
    return { available: true, late, gross: g.gross, surcharge: g.surcharge, net: late.total };
}
