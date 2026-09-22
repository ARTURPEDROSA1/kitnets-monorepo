-- Condomínios: the condominium of a multi-unit property, as a record of its own.
--
-- The Condomínio page opens on one card per condominium. A condominium belongs to exactly one property
-- (the multi-unit property whose units pay it) and a property has at most one condominium. Its revenue is
-- the Condomínio column of the income ledger and its costs are `condominium_months`, both keyed by the
-- property. The record itself carries the name the owner gives it.
--
-- Every property that already has a condominium charged in its income ledger gets a condominium record,
-- named after the property, so nothing disappears from the page that existed before this table.
--
-- Written and read by the API with the service role, always for the signed-in profile: RLS on, no policies.

CREATE TABLE IF NOT EXISTS public.condominiums (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT condominiums_property_unique UNIQUE (property_id)
);

CREATE INDEX IF NOT EXISTS idx_condominiums_owner ON public.condominiums (owner_id);

DROP TRIGGER IF EXISTS trg_condominiums_updated_at ON public.condominiums;
CREATE TRIGGER trg_condominiums_updated_at
    BEFORE UPDATE ON public.condominiums
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

ALTER TABLE public.condominiums ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.condominiums FROM anon, authenticated;

COMMENT ON TABLE public.condominiums IS 'The condominium of a multi-unit property (one per property). Revenue: property_income_months.condo_amount; costs: condominium_months.';

INSERT INTO public.condominiums (owner_id, property_id, name)
SELECT DISTINCT p.owner_id, p.id, 'Condomínio ' || COALESCE(NULLIF(trim(p.name), ''), 'do imóvel')
  FROM public.properties p
  JOIN public.property_income_months m ON m.property_id = p.id
 WHERE m.condo_amount > 0
   AND p.owner_id IS NOT NULL
ON CONFLICT (property_id) DO NOTHING;
