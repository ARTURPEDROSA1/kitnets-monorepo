-- Income ledger: IPTU paid by the landlord, per month.
--
-- Whether the landlord pays IPTU is a property setting (profile JSON,
-- details.iptuPaidBy = 'tenant' | 'landlord'); when the landlord pays, the
-- ledger shows an IPTU column and the amount is a cost like the energy cost:
--   opex = agency fee + energy cost + other expenses + iptu
--   noi  = revenue − opex = received − energy cost − other expenses − iptu

ALTER TABLE public.property_income_months
    ADD COLUMN IF NOT EXISTS iptu_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.property_income_months
    DROP CONSTRAINT IF EXISTS property_income_months_non_negative;

ALTER TABLE public.property_income_months
    ADD CONSTRAINT property_income_months_non_negative CHECK (
        received_amount >= 0
        AND energy_portion >= 0
        AND other_income >= 0
        AND other_expenses >= 0
        AND iptu_amount >= 0
        AND agency_fee_pct >= 0
        AND agency_fee_pct < 100
    );

COMMENT ON COLUMN public.property_income_months.iptu_amount IS
    'IPTU paid by the landlord in the month (0 when the tenant pays). Cost, >= 0.';
