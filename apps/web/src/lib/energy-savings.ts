/**
 * How "Economia Solar" is valued.
 *
 * The saving is what the utility actually credited on the bill
 * (`energy_compensated_amount`, printed as a negative line). Multiplying the
 * compensated kWh by the tariff overstates it for systems connected after
 * January 2023 (Lei 14.300, GD II/III): compensated energy pays a growing
 * share of the distribution charge (TUSD Fio B), 60% of it in 2026. The
 * kWh × tariff figure is kept only as a fallback for bills that carry no
 * credited amount, and is flagged so the UI can label it "estimada".
 */

type Numeric = number | string | null | undefined;

export interface SolarBillFields {
    solar_injected_kwh?: Numeric;
    solar_compensated_kwh?: Numeric;
    generation_balance_kwh?: Numeric;
    unit_price?: Numeric;
    energy_compensated_amount?: Numeric;
    energy_scee_exempt_amount?: Numeric;
}

export interface SolarSavings {
    /** R$ saved this month. */
    amount: number;
    /** True when derived from kWh × tariff instead of read from the bill. */
    estimated: boolean;
    /** Solar activity on the bill but no compensated kWh recorded: ask the user. */
    missingCompensatedKwh: boolean;
}

const n = (v: Numeric): number => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
};

/** Any sign on the bill that the unit takes part in energy compensation. */
export function hasSolarActivity(bill: SolarBillFields): boolean {
    return (
        n(bill.solar_injected_kwh) > 0 ||
        n(bill.solar_compensated_kwh) > 0 ||
        n(bill.generation_balance_kwh) > 0 ||
        Math.abs(n(bill.energy_compensated_amount)) > 0 ||
        n(bill.energy_scee_exempt_amount) > 0
    );
}

export function solarSavings(bill: SolarBillFields): SolarSavings {
    const compensatedKwh = n(bill.solar_compensated_kwh);
    const missingCompensatedKwh = hasSolarActivity(bill) && !(compensatedKwh > 0);

    const credited = Math.abs(n(bill.energy_compensated_amount));
    if (credited > 0) {
        return { amount: Math.round(credited * 100) / 100, estimated: false, missingCompensatedKwh };
    }

    const unitPrice = n(bill.unit_price);
    if (compensatedKwh > 0 && unitPrice > 0) {
        return { amount: Math.round(compensatedKwh * unitPrice * 100) / 100, estimated: true, missingCompensatedKwh };
    }

    return { amount: 0, estimated: false, missingCompensatedKwh };
}
