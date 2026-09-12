-- ============================================================
-- Property income ledger (Sep 2026)
--
-- One row per property per month with what the owner actually
-- received. Stored fields are what a bank statement will show;
-- everything else is derived in the app:
--
--   net_rent   = received_amount - energy_portion - other_income
--   gross_rent = net_rent / (1 - agency_fee_pct / 100)
--   fee        = gross_rent - net_rent
--
-- Example: gross R$ 4.000, agency 10 %, energy R$ 350
--   → received_amount 3.950, energy_portion 350, agency_fee_pct 10
--   → net_rent 3.600, gross_rent 4.000, fee 400
--
-- The energy portion is the part of the tenant's payment that pays
-- for solar energy; it belongs to the energy cost centre, not to the
-- property's rent, so it is tracked separately and deducted.
--
-- Run ONCE in the Supabase SQL editor. Idempotent.
-- Access is through /api/properties/[id]/income (service role,
-- scoped by owner). RLS is enabled so the anon key sees nothing.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.property_income_months (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    owner_id        UUID NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,

    month           DATE NOT NULL,                       -- always the 1st of the month
    received_on     DATE,                                -- actual credit date, when known

    received_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,   -- total credited to the owner (net of agency, incl. energy/other)
    energy_portion  NUMERIC(12, 2) NOT NULL DEFAULT 0,   -- part of received_amount that pays for energy (solar centre)
    other_income    NUMERIC(12, 2) NOT NULL DEFAULT 0,   -- part of received_amount that is not rent (parking, late fee…)
    agency_fee_pct  NUMERIC(5, 2)  NOT NULL DEFAULT 0,   -- % the agency kept before crediting the owner

    status          TEXT NOT NULL DEFAULT 'CONFIRMED'
                    CHECK (status IN ('EXPECTED', 'CONFIRMED')),
    source          TEXT NOT NULL DEFAULT 'MANUAL'
                    CHECK (source IN ('MANUAL', 'IMPORT', 'BANK')),
    bank_reference  TEXT,                                -- bank transaction id once integrated (Banco Inter etc.)
    notes           TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT property_income_months_month_is_first_day CHECK (EXTRACT(DAY FROM month) = 1),
    CONSTRAINT property_income_months_non_negative CHECK (
        received_amount >= 0 AND energy_portion >= 0 AND other_income >= 0
        AND agency_fee_pct >= 0 AND agency_fee_pct < 100
    ),
    CONSTRAINT property_income_months_unique UNIQUE (property_id, month)
);

CREATE INDEX IF NOT EXISTS idx_property_income_months_property_month
    ON public.property_income_months (property_id, month DESC);

CREATE INDEX IF NOT EXISTS idx_property_income_months_owner
    ON public.property_income_months (owner_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_property_income_months_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_property_income_months_updated_at ON public.property_income_months;
CREATE TRIGGER trg_property_income_months_updated_at
    BEFORE UPDATE ON public.property_income_months
    FOR EACH ROW
    EXECUTE FUNCTION public.set_property_income_months_updated_at();

-- RLS: no policies for anon/authenticated → only the service role can read/write.
ALTER TABLE public.property_income_months ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_income_months FROM anon, authenticated;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'property_income_months'
ORDER BY ordinal_position;
