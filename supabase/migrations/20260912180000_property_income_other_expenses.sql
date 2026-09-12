-- Income ledger: separate "outras despesas" from the energy cost.
--
-- other_income   (historical name) = energy cost: the electricity bill the owner
--                pays in the month, outside the agency transfer.
-- other_expenses = other costs the owner pays in the month (repairs, fees…),
--                also outside the transfer.
--
-- Neither changes received / net / gross rent; both are OPEX and lower NOI:
--   opex = agency fee + energy cost + other expenses
--   noi  = (gross rent + energy income) − opex = received − energy cost − other expenses

ALTER TABLE public.property_income_months
    ADD COLUMN IF NOT EXISTS other_expenses NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.property_income_months
    DROP CONSTRAINT IF EXISTS property_income_months_non_negative;

ALTER TABLE public.property_income_months
    ADD CONSTRAINT property_income_months_non_negative CHECK (
        received_amount >= 0
        AND energy_portion >= 0
        AND other_income >= 0
        AND other_expenses >= 0
        AND agency_fee_pct >= 0
        AND agency_fee_pct < 100
    );

COMMENT ON COLUMN public.property_income_months.other_income IS
    'Energy cost: electricity bill paid by the owner in the month (historical column name). Cost, >= 0.';
COMMENT ON COLUMN public.property_income_months.other_expenses IS
    'Other expenses paid by the owner in the month (repairs, fees), outside the agency transfer. Cost, >= 0.';
