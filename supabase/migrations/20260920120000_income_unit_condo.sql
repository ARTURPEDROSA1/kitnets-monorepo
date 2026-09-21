-- Income ledger: revenue per unit and the condominium fee.
--
-- A multi-unit property (kitnets) receives one rent per unit, so a month can now hold one row per unit.
-- `unit_id` points to the sub-unit in the owner's profile JSON, exactly like `leases.unit_id`
-- (NULL = the whole property, which is what every existing row and every single-unit property has);
-- `unit_name` is the unit's name when the row was saved, so the ledger still reads right if the unit is
-- later renamed or removed.
--
-- `condo_amount` is the condominium fee the landlord paid for the month. It is a cost like the energy
-- cost and the other expenses: it never changes what was received, it lowers NOI through OPEX.
--   opex = agency fee + energy cost + other expenses + condominium (+ landlord IPTU from the taxes register)
--   noi  = received − energy cost − other expenses − condominium

ALTER TABLE public.property_income_months
    ADD COLUMN IF NOT EXISTS unit_id text,
    ADD COLUMN IF NOT EXISTS unit_name text,
    ADD COLUMN IF NOT EXISTS condo_amount numeric(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.property_income_months.unit_id IS 'Sub-unit of a multi-unit property (id inside the owner''s profile JSON); NULL = the whole property.';
COMMENT ON COLUMN public.property_income_months.unit_name IS 'Name of the unit when the row was last saved.';
COMMENT ON COLUMN public.property_income_months.condo_amount IS 'Condominium fee paid by the landlord in the month. Cost, >= 0.';

-- One row per property, month and unit. NULLS NOT DISTINCT keeps a single whole-property row per month
-- (two NULL unit_ids count as the same key), so upserts on (property_id, month, unit_id) stay exact.
ALTER TABLE public.property_income_months
    DROP CONSTRAINT IF EXISTS property_income_months_unique;

ALTER TABLE public.property_income_months
    ADD CONSTRAINT property_income_months_unique UNIQUE NULLS NOT DISTINCT (property_id, month, unit_id);

ALTER TABLE public.property_income_months
    DROP CONSTRAINT IF EXISTS property_income_months_non_negative;

ALTER TABLE public.property_income_months
    ADD CONSTRAINT property_income_months_non_negative CHECK (
        received_amount >= 0
        AND energy_portion >= 0
        AND other_income >= 0
        AND other_expenses >= 0
        AND iptu_amount >= 0
        AND condo_amount >= 0
        AND agency_fee_pct >= 0
        AND agency_fee_pct < 100
    );
