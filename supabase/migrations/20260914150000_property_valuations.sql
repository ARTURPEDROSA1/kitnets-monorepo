-- Property valuations: what the property is worth over time.
--
--   source  MANUAL    owner's own estimate
--           APPRAISAL formal appraisal / laudo
--           FIPEZAP   purchase price carried by the FipeZap sale index (estimate)
--           LISTING   asking price of comparable listings
--
-- The latest row (by valued_on) is the market value used by the investment
-- analysis: appreciation, equity, IRR with unrealised value, cap rate.

CREATE TABLE IF NOT EXISTS public.property_valuations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    owner_id    UUID NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,

    valued_on   DATE NOT NULL,
    amount      NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
    source      TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'APPRAISAL', 'FIPEZAP', 'LISTING')),
    note        TEXT,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_valuations_property_date
    ON public.property_valuations (property_id, valued_on DESC);
CREATE INDEX IF NOT EXISTS idx_property_valuations_owner
    ON public.property_valuations (owner_id);

DROP TRIGGER IF EXISTS trg_property_valuations_updated_at ON public.property_valuations;
CREATE TRIGGER trg_property_valuations_updated_at
    BEFORE UPDATE ON public.property_valuations
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

ALTER TABLE public.property_valuations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_valuations FROM anon, authenticated;

COMMENT ON TABLE public.property_valuations IS 'Market value estimates of a property over time (manual, appraisal, FipeZap-carried, listings). Latest row feeds the investment analysis.';
