
export type System = 'SAC' | 'PRICE';
export type AmortizationEffect = 'reduce_term' | 'reduce_installment';

export interface ExtraPayment {
    month: number;
    amount: number;
    effect: AmortizationEffect;
    source?: string; // e.g. 'FGTS'
}

export interface MortgageInputs {
    propertyValue: number;
    downPayment: number;
    system: System;
    termMonths: number;
    annualInterestRate: number; // e.g. 10.5 for 10.5%
    mipRate: number; // as a decimal, e.g. 0.0003
    dfiRate: number; // as a decimal, e.g. 0.0001
    extraPayments: ExtraPayment[];
}

export interface MonthlyData {
    month: number;
    interest: number;
    amortization: number;
    extraAmortization: number;
    mip: number;
    dfi: number;
    fees: number;
    payment: number; // J + A + MIP + DFI + Fees
    balance: number; // End of month balance
}

export interface MortgageResult {
    schedule: MonthlyData[];
    summary: {
        totalPaid: number;
        totalInterest: number;
        totalAmortization: number;
        totalInsurance: number; // MIP + DFI
        interestSaved: number;
        monthsSaved: number;
        originalMonths: number;
        finalMonths: number;
    };
}

export function calculateMortgage(inputs: MortgageInputs): MortgageResult {
    const {
        propertyValue,
        downPayment,
        system,
        termMonths,
        annualInterestRate,
        mipRate,
        dfiRate,
        extraPayments
    } = inputs;

    let balance = propertyValue - downPayment;
    if (balance < 0) balance = 0;

    const i = Math.pow(1 + annualInterestRate / 100, 1 / 12) - 1;

    const schedule: MonthlyData[] = [];

    const currentTerm = termMonths; // Remaining term logic start

    // For SAC, A is usually fixed calculated at start, UNLESS we change strategy.
    // Initial SAC Amortization:
    let sacAmortization = balance / currentTerm;

    // For PRICE, P (payment) is fixed calculated at start.
    // func to calc Price Pmt:
    const calcPricePmt = (pVal: number, rate: number, n: number) => {
        if (rate === 0) return pVal / n;
        return pVal * (rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1);
    };
    let priceInstallment = calcPricePmt(balance, i, currentTerm);

    let totalInterest = 0;
    let totalAmortization = 0;
    let totalInsurance = 0;
    let totalPaid = 0;

    // We loop until balance is close to 0 or we hit a safety limit.
    let month = 1;
    while (balance > 1e-2 && month <= 420) { // 35 years max usually
        // 1. Calculate Interest
        const interest = balance * i;

        // 2. Calculate Regular Amortization & Payment based on System
        let amortization = 0;
        let payment_principal_interest = 0; // The P or (A+J) part

        if (system === 'SAC') {
            // SAC: Amortization is fixed (unless last month adjustment)
            amortization = sacAmortization;
            if (amortization > balance) amortization = balance;
            payment_principal_interest = amortization + interest;
        } else {
            // PRICE: Payment is fixed
            payment_principal_interest = priceInstallment;
            // If last month or small balance, adjust
            // But strictly: A = P - J
            amortization = payment_principal_interest - interest;

            // Correct for end of loan rounding issues
            if (balance - amortization < 1e-2) {
                amortization = balance;
                payment_principal_interest = amortization + interest;
            }
        }

        // 3. Insurance
        const mip = balance * mipRate; // On balance
        const dfi = propertyValue * dfiRate; // On property value (constant usually)
        const insurance = mip + dfi;

        // 4. Initial monthly totals (before extra amort)
        const totalMonthly = payment_principal_interest + insurance;

        // 5. Apply Regular Amortization
        let newBalance = balance - amortization;

        // 6. Check for Extra Payments
        const extras = extraPayments.filter(e => e.month === month);
        let extraAmortTotal = 0;
        let reduceTerm = false; // Priority logic: if any event says reduce term, we do it?

        for (const extra of extras) {
            let amount = extra.amount;
            if (amount > newBalance) amount = newBalance; // Cap at outstanding

            extraAmortTotal += amount;
            newBalance -= amount;

            if (extra.effect === 'reduce_term') reduceTerm = true;
        }

        // 7. Store Data
        schedule.push({
            month,
            interest,
            amortization,
            extraAmortization: extraAmortTotal,
            mip,
            dfi,
            fees: 0,
            payment: totalMonthly + extraAmortTotal,
            balance: newBalance
        });

        totalInterest += interest;
        totalAmortization += (amortization + extraAmortTotal);
        totalInsurance += insurance;
        totalPaid += (totalMonthly + extraAmortTotal);

        // 8. Re-calculate Strategy for Next Month if Extra Payment happened
        if (extraAmortTotal > 0 && newBalance > 1e-2) {
            if (reduceTerm) {
                // Keep Payment (approx), Reduce Term
                // If SAC, we keep sacAmortization constant. Balance drops faster, reaches 0 sooner.
                // If PRICE, we keep priceInstallment constant. Balance drops faster, reaches 0 sooner.
                // No explicit recalculation needed for 'reduce_term' in this iterative model
                // because we just check balance > 0.
            } else {
                // Reduce Payment (Keep Term)
                // We aim to finish at original 'termMonths'.
                const monthsPassed = month;
                const monthsRemaining = termMonths - monthsPassed;

                if (monthsRemaining > 0) {
                    if (system === 'SAC') {
                        // A' = SD' / n_rem
                        sacAmortization = newBalance / monthsRemaining;
                    } else {
                        // P' = SD' * ... (recalculate annuity for rem term)
                        priceInstallment = calcPricePmt(newBalance, i, monthsRemaining);
                    }
                }
            }
        }

        balance = newBalance;
        month++;
    }

    return {
        schedule,
        summary: {
            totalPaid,
            totalInterest,
            totalAmortization,
            totalInsurance,
            interestSaved: 0, // Need base run to calc this
            monthsSaved: termMonths - (schedule.length), // Approx
            originalMonths: termMonths,
            finalMonths: schedule.length
        }
    };
}

// Wrapper to calculate everything including savings
export function calculateMortgageWithComparisons(inputs: MortgageInputs): MortgageResult {
    // 1. Run Baseline (No extra payments)
    const baselineInputs = { ...inputs, extraPayments: [] };
    const baseline = calculateMortgage(baselineInputs);

    // 2. Run Actual
    const result = calculateMortgage(inputs);

    // 3. Compute Deltas
    result.summary.interestSaved = baseline.summary.totalInterest - result.summary.totalInterest;

    // Note: monthsSaved is already calculated roughly, but comparing to baseline length is safer
    result.summary.monthsSaved = baseline.schedule.length - result.schedule.length;

    return result;
}
