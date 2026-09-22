-- Condomínio cost centre: the monthly costs of a multi-unit property's condominium.
--
-- The landlord of a multi-unit property (kitnets, apartments) also runs its condominium. Its revenue is
-- already in the income ledger: the `condo_amount` of each unit's month in property_income_months
-- (what the tenants pay as condominium, and what a vacant unit still owes). This table holds what the
-- condominium spends: energy of the common areas, internet, water, IPTU, maintenance. One row per
-- property and month; a month without a row costs nothing.
--
-- Written and read by the API with the service role, always for a property the signed-in profile owns.

CREATE TABLE IF NOT EXISTS public.condominium_months (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id      UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    owner_id         UUID NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
    month            DATE NOT NULL,
    energy_cost      NUMERIC(12, 2) NOT NULL DEFAULT 0,
    internet_cost    NUMERIC(12, 2) NOT NULL DEFAULT 0,
    water_cost       NUMERIC(12, 2) NOT NULL DEFAULT 0,
    iptu_amount      NUMERIC(12, 2) NOT NULL DEFAULT 0,
    maintenance_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT condominium_months_unique UNIQUE (property_id, month),
    CONSTRAINT condominium_months_first_day CHECK (month = date_trunc('month', month)::date),
    CONSTRAINT condominium_months_non_negative CHECK (
        energy_cost >= 0 AND internet_cost >= 0 AND water_cost >= 0 AND iptu_amount >= 0 AND maintenance_cost >= 0
    )
);

CREATE INDEX IF NOT EXISTS idx_condominium_months_owner ON public.condominium_months (owner_id);

DROP TRIGGER IF EXISTS trg_condominium_months_updated_at ON public.condominium_months;
CREATE TRIGGER trg_condominium_months_updated_at
    BEFORE UPDATE ON public.condominium_months
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

ALTER TABLE public.condominium_months ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.condominium_months FROM anon, authenticated;

COMMENT ON TABLE public.condominium_months IS 'Monthly costs of a multi-unit property''s condominium (common-area energy, internet, water, IPTU, maintenance). Revenue comes from property_income_months.condo_amount.';
