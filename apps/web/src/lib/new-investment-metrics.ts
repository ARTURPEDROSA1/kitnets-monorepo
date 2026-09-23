/**
 * The numbers on top of a Novo Investimento — card and dashboard read the same object.
 *
 * Everything is cash: an off-plan unit produces nothing until the keys arrive, so the only
 * question until then is "how much of this thing have I already paid, and what is still coming".
 * The yield figures are deliberately based on the **committed** total (paid + still due), not on
 * the contract's headline price: index corrections make the two diverge over three years.
 */
import {
    expandSchedules,
    monthsBetween,
    paymentMonth,
    payerSplit,
    paymentTotal,
    pendingByKind,
    pendingInstalments,
    type InvestmentPayment,
    type InvestmentSchedule,
    type NewInvestment,
    type OpenInstalment,
    type PendingKindSummary,
    type ScheduledInstalment,
} from "./new-investments";
import { round2 } from "./property-income";

export interface InvestmentMetrics {
    /** Contract headline price (quadro resumo "preço total do imóvel"). */
    contractPrice: number;
    /** Paid so far, instalments + index corrections. */
    paidToDate: number;
    /** Index correction inside `paidToDate`. */
    correctionsPaid: number;
    /** How `paidToDate` divides between the pockets; `unassigned` is the rows with no payer recorded. */
    paidByPayer: { pf: number; pj: number; unassigned: number };
    /**
     * Still owed: forecast instalments no payment covers, plus payments marked PLANNED. Each open
     * instalment is projected at the last value paid for its kind (see `pendingInstalments`), so
     * this moves every time a payment is recorded.
     */
    remaining: number;
    /** `paidToDate + remaining` — what the unit is going to have cost. */
    committed: number;
    /** % of `committed` already paid. */
    paidPct: number;
    /** Number of payments recorded as PAID. */
    paidCount: number;
    /** Forecast instalments still open. */
    remainingCount: number;
    /** What is still owed, one line per kind, in the order the kinds are listed. */
    remainingByKind: PendingKindSummary[];

    /** Due date and amount of the next thing to pay, from `asOf`. */
    nextDueOn: string | null;
    nextDueAmount: number;
    /** Open instalments whose due date has already passed. */
    overdueAmount: number;
    overdueCount: number;

    /** First and last cash movement known (paid or forecast), `YYYY-MM`. */
    firstMonth: string | null;
    lastMonth: string | null;
    /** Average monthly outlay over the months that had one. */
    avgMonthlyOutlay: number;

    /** Months from `asOf` to the keys; negative once they have been handed over. */
    monthsToKeys: number | null;
    keysOn: string | null;
    keysDelivered: boolean;

    /** Net monthly rent expected: rent − vacancy − running costs. */
    netMonthlyRent: number | null;
    /** 12 × rent ÷ committed. */
    grossYieldPct: number | null;
    /** 12 × net rent ÷ committed. */
    netYieldPct: number | null;
    /** Months of net rent needed to give the invested capital back, from the first rent. */
    paybackMonths: number | null;
}

const EMPTY_TOTALS = { paid: 0, corrections: 0, count: 0 };

function sumPaid(payments: InvestmentPayment[]) {
    return payments.reduce(
        (acc, p) =>
            p.status === "PAID"
                ? { paid: acc.paid + paymentTotal(p), corrections: acc.corrections + (p.correction_amount || 0), count: acc.count + 1 }
                : acc,
        EMPTY_TOTALS
    );
}

/** The month the unit starts paying rent: what the owner set, else the month after the keys. */
export function rentStartMonth(investment: NewInvestment): string | null {
    if (investment.rent_start_on) return investment.rent_start_on.slice(0, 7);
    const keys = investment.keys_delivered_on ?? investment.keys_expected_on;
    if (!keys) return null;
    const [y, m] = keys.slice(0, 7).split("-").map(Number);
    const total = y * 12 + m; // +1 month, already zero-based by dropping the −1
    return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function computeInvestmentMetrics(
    investment: NewInvestment,
    schedules: InvestmentSchedule[],
    payments: InvestmentPayment[],
    asOf: Date = new Date()
): InvestmentMetrics {
    const today = asOf.toISOString().slice(0, 10);
    const { paid, corrections, count } = sumPaid(payments);
    // Who paid it: a row with no payer recorded is neither pocket's, and is shown as such.
    const paidByPayer = payments.reduce(
        (acc, p) => {
            if (p.status !== "PAID") return acc;
            const split = payerSplit(p);
            if (!split) acc.unassigned = round2(acc.unassigned + paymentTotal(p));
            else {
                acc.pf = round2(acc.pf + split.pf);
                acc.pj = round2(acc.pj + split.pj);
            }
            return acc;
        },
        { pf: 0, pj: 0, unassigned: 0 }
    );

    // Still owed = forecast instalments nothing covers + payments the owner typed as planned
    const pending: ScheduledInstalment[] = pendingInstalments(schedules, payments);
    const plannedPayments = payments.filter(p => p.status === "PLANNED");
    const remaining = round2(
        pending.reduce((s, i) => s + i.amount, 0) + plannedPayments.reduce((s, p) => s + paymentTotal(p), 0)
    );

    const committed = round2(paid + remaining);
    const openItems: OpenInstalment[] = [
        ...pending.map(i => ({ kind: i.kind, dueOn: i.dueOn, amount: i.amount })),
        ...plannedPayments.map(p => ({ kind: p.kind, dueOn: p.due_on, amount: paymentTotal(p) })),
    ].sort((a, b) => (a.dueOn < b.dueOn ? -1 : 1));

    const next = openItems.find(i => i.dueOn >= today) ?? null;
    const overdue = openItems.filter(i => i.dueOn < today);

    // Month range over everything known, realised and forecast
    const months = [
        ...payments.map(paymentMonth),
        ...expandSchedules(schedules).map(i => i.dueOn.slice(0, 7)),
    ].sort();
    const firstMonth = months[0] ?? null;
    const lastMonth = months[months.length - 1] ?? null;

    const paidMonths = new Set(payments.filter(p => p.status === "PAID").map(paymentMonth));
    const avgMonthlyOutlay = paidMonths.size > 0 ? round2(paid / paidMonths.size) : 0;

    const keysOn = investment.keys_delivered_on ?? investment.keys_expected_on;
    const monthsToKeys = keysOn ? monthsBetween(today.slice(0, 7), keysOn.slice(0, 7)) : null;

    const rent = investment.estimated_rent && investment.estimated_rent > 0 ? investment.estimated_rent : null;
    const netMonthlyRent =
        rent === null
            ? null
            : round2(rent * (1 - investment.rent_vacancy_pct / 100) * (1 - investment.rent_costs_pct / 100));
    const base = committed > 0 ? committed : null;

    return {
        contractPrice: round2(investment.total_price || 0),
        paidToDate: round2(paid),
        correctionsPaid: round2(corrections),
        paidByPayer,
        remaining,
        committed,
        paidPct: committed > 0 ? round2((paid / committed) * 100) : 0,
        paidCount: count,
        remainingCount: openItems.length,
        remainingByKind: pendingByKind(openItems),

        nextDueOn: next?.dueOn ?? null,
        nextDueAmount: round2(next?.amount ?? 0),
        overdueAmount: round2(overdue.reduce((s, i) => s + i.amount, 0)),
        overdueCount: overdue.length,

        firstMonth,
        lastMonth,
        avgMonthlyOutlay,

        monthsToKeys,
        keysOn: keysOn ?? null,
        keysDelivered: Boolean(investment.keys_delivered_on),

        netMonthlyRent,
        grossYieldPct: rent !== null && base ? round2(((rent * 12) / base) * 100) : null,
        netYieldPct: netMonthlyRent !== null && base ? round2(((netMonthlyRent * 12) / base) * 100) : null,
        paybackMonths: netMonthlyRent !== null && netMonthlyRent > 0 && base ? Math.ceil(base / netMonthlyRent) : null,
    };
}

/** Compact figures the list page's square card shows without loading the whole dashboard. */
export interface InvestmentCardSummary {
    id: string;
    paidToDate: number;
    committed: number;
    paidPct: number;
    remaining: number;
    nextDueOn: string | null;
    nextDueAmount: number;
    overdueCount: number;
    monthsToKeys: number | null;
    keysOn: string | null;
    netYieldPct: number | null;
    documents: number;
    /** Signed URL of the card's cover picture; null when none was chosen. Always `photoUrls[0]`. */
    coverUrl: string | null;
    /** Signed URLs the card slides through: the cover first, then the other photos in upload order. */
    photoUrls: string[];
}

/** How many pictures a list card is willing to carry; the lightbox shows the rest. */
export const CARD_PHOTO_LIMIT = 12;

/**
 * The storage paths a card slides through: the chosen cover first, then the remaining photos in
 * the order they were uploaded, without repeats and capped so a card with fifty photos does not
 * sign fifty URLs on every list load.
 */
export function cardPhotoPaths(coverPath: string | null, photoPaths: string[], limit = CARD_PHOTO_LIMIT): string[] {
    const ordered = coverPath ? [coverPath, ...photoPaths.filter(p => p !== coverPath)] : photoPaths;
    return Array.from(new Set(ordered)).slice(0, Math.max(0, limit));
}

export function toCardSummary(id: string, metrics: InvestmentMetrics, documents: number, photoUrls: string[] = []): InvestmentCardSummary {
    return {
        id,
        paidToDate: metrics.paidToDate,
        committed: metrics.committed,
        paidPct: metrics.paidPct,
        remaining: metrics.remaining,
        nextDueOn: metrics.nextDueOn,
        nextDueAmount: metrics.nextDueAmount,
        overdueCount: metrics.overdueCount,
        monthsToKeys: metrics.monthsToKeys,
        keysOn: metrics.keysOn,
        netYieldPct: metrics.netYieldPct,
        documents,
        coverUrl: photoUrls[0] ?? null,
        photoUrls,
    };
}
