/**
 * The card fee passed on to the tenant (the owner's decision of 2026-10-02): the tenant pays the
 * invoice plus what the card processor will keep, so the owner receives the invoice's amount in full.
 *
 * With a fee of `pct` % + `fixed` on what is charged, charging `gross` leaves the owner
 * `gross − gross·pct − fixed`. For that to be at least `net`: `gross ≥ (net + fixed) / (1 − pct)`,
 * rounded UP to the centavo (rounding down would leave the owner a centavo short).
 *
 * The rate and the fixed part are the owner's to type (their contract with the processor); nothing
 * here assumes one.
 */

export interface CardFee {
    /** percentage of the amount charged, e.g. 3.99 */
    pct: number;
    /** fixed part per payment, in reais, e.g. 0.39 */
    fixed: number;
}

export interface GrossUp {
    /** what the tenant is charged */
    gross: number;
    /** the card line: gross − net */
    surcharge: number;
    /** what the owner receives (the invoice's amount; a centavo more at most, from the rounding) */
    net: number;
}

/** Rounds up to the centavo, tolerant of floating-point noise (260.700000001 stays 260.70). */
const ceil2 = (n: number) => Math.ceil(Math.round(n * 1e6) / 1e4) / 100;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The amount to charge on the card so the owner receives `net` after a fee of `pct` % + `fixed`. */
export function grossUp(net: number, fee: CardFee): GrossUp {
    if (!(net > 0)) return { gross: 0, surcharge: 0, net: 0 };
    const pct = Math.max(0, Math.min(fee.pct, 99)) / 100;
    const gross = ceil2((net + Math.max(0, fee.fixed)) / (1 - pct));
    return { gross, surcharge: round2(gross - net), net: round2(net) };
}

/** Whether the owner has decided the card fee (both parts; zero is a decision). */
export const cardFeeDecided = (pct: number | null | undefined, fixed: number | null | undefined): boolean => pct != null && fixed != null && Number.isFinite(pct) && Number.isFinite(fixed);
