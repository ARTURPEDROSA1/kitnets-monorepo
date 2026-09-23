/**
 * Internal rate of return of a monthly series of flows — shared by the cash-flow simulator (rent
 * against instalments over the horizon) and the metrics of a sold project (what was paid against
 * the sale). Pure and dependency-free so both can import it without pulling each other in.
 */

/**
 * Monthly internal rate of return of a series of flows (index = month, negative = out, positive
 * = in), by bisection on the net present value. Null when the flows never change sign, or when
 * no rate between −50% and +100% a month answers — a flow that only ever loses has no TIR.
 */
export function internalRateOfReturn(flows: number[]): number | null {
    if (!flows.some(f => f < 0) || !flows.some(f => f > 0)) return null;
    const npv = (rate: number) => flows.reduce((sum, f, t) => sum + f / Math.pow(1 + rate, t), 0);
    // The lower bracket: (1 + r)^-t explodes past double precision at −99% a month over a
    // 30-year horizon, so start at −50% (already absurd) and back off while it overflows.
    let lo = -0.5, hi = 1;
    let fLo = npv(lo);
    for (const candidate of [-0.3, -0.1, -0.02]) {
        if (Number.isFinite(fLo)) break;
        lo = candidate;
        fLo = npv(lo);
    }
    let fHi = npv(hi);
    if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        const fMid = npv(mid);
        if (Math.abs(fMid) < 1e-7 || hi - lo < 1e-10) return mid;
        if (fLo * fMid < 0) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
    }
    return (lo + hi) / 2;
}

/** A monthly rate as the yearly figure people quote (% a.a.), two decimals. */
export const annualizePct = (monthlyRate: number): number => Math.round((Math.pow(1 + monthlyRate, 12) - 1) * 10000) / 100;
