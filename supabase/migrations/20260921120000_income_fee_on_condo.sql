-- Income ledger: the tenant's condominium comes inside the agency's deposit, and the agency fee may or may not reach it.
--
-- The condominium is an expense of the property: it is due every month, even when the unit is vacant (it will
-- be the revenue of the condominium cost centre). While the unit is rented the tenant pays it: the agency
-- collects rent + condominium in one payment and makes one deposit per unit. Depending on the landlord's
-- agreement, the agency charges its % on the rent only (the condominium is forwarded in full) or on the
-- whole amount (rent + condominium). `fee_on_condo` records which.
--
--   condo_in   = condominium inside the deposit: condo_amount × (1 − pct/100) when fee_on_condo, else
--                condo_amount; never more than received − energy (a vacant unit has no tenant paying it)
--   net rent   = received − energy − condo_in
--   gross rent = net rent ÷ (1 − pct/100)
--   noi        = received − energy cost − other expenses − condo_amount      (unchanged)
--
-- Migration 20260920120000 introduced `condo_amount` as a cost paid apart from the deposit, so the rows saved
-- since then (one day of data) hold a deposit without the condominium: it was derived from the gross rent
-- alone. Adding the condominium to those deposits keeps the gross rent, fee and net rent the landlord typed
-- exactly as they were. Rows with nothing received (vacancy) are left alone. The block runs only when the
-- column is created, so it never repeats.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'property_income_months' AND column_name = 'fee_on_condo'
    ) THEN
        ALTER TABLE public.property_income_months
            ADD COLUMN fee_on_condo boolean NOT NULL DEFAULT false;

        UPDATE public.property_income_months
           SET received_amount = received_amount + condo_amount
         WHERE condo_amount > 0
           AND received_amount > 0;
    END IF;
END $$;

COMMENT ON COLUMN public.property_income_months.condo_amount IS 'Condominium due by the unit in the month: an expense of the property, due even when vacant. While rented, the tenant pays it and the agency forwards it inside received_amount. >= 0.';
COMMENT ON COLUMN public.property_income_months.fee_on_condo IS 'true = the agency fee applies to rent + condominium; false = to the rent only (condominium forwarded in full).';
