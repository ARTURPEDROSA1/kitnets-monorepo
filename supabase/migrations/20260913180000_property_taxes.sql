-- Property taxes over the lifetime of a property (informational register).
--
--   kind     IPTU (one row per fiscal year), ITBI (paid at purchase), OUTRO
--   paid_by  TENANT | LANDLORD — who actually paid it
--
-- This register does NOT feed the KPIs by itself: landlord-paid IPTU enters
-- OPEX through property_income_months.iptu_amount (monthly), and ITBI enters
-- the cost basis through property_transactions (CUSTOS_AQUISICAO).

CREATE TABLE IF NOT EXISTS public.property_taxes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    owner_id    UUID NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,

    year        INTEGER NOT NULL CHECK (year BETWEEN 1990 AND 2100),
    kind        TEXT NOT NULL CHECK (kind IN ('IPTU', 'ITBI', 'OUTRO')),
    amount      NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    paid_by     TEXT NOT NULL DEFAULT 'TENANT' CHECK (paid_by IN ('TENANT', 'LANDLORD')),
    paid_on     DATE,
    comment     TEXT,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_taxes_property_year
    ON public.property_taxes (property_id, year DESC);
CREATE INDEX IF NOT EXISTS idx_property_taxes_owner
    ON public.property_taxes (owner_id);

DROP TRIGGER IF EXISTS trg_property_taxes_updated_at ON public.property_taxes;
CREATE TRIGGER trg_property_taxes_updated_at
    BEFORE UPDATE ON public.property_taxes
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

ALTER TABLE public.property_taxes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_taxes FROM anon, authenticated;

COMMENT ON TABLE public.property_taxes IS 'IPTU per year, ITBI and other property taxes, with who paid them. Informational register.';
