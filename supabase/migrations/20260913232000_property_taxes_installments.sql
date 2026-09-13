-- Property taxes: optional instalments per tax row (IPTU is commonly paid in
-- up to 6 parcelas, and the payer can differ per parcela — e.g. the landlord
-- pays the ones that fall in a vacancy).
--
--   installments: JSON array of { seq, amount, paid_by, paid_on }
--   When non-empty, the row's effective amount is the sum of the parcelas and
--   the tenant/landlord split comes from them; `amount` / `paid_by` on the row
--   are kept in sync by the API as the totals/majority for older readers.

ALTER TABLE public.property_taxes
    ADD COLUMN IF NOT EXISTS installments JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.property_taxes
    DROP CONSTRAINT IF EXISTS property_taxes_installments_is_array;
ALTER TABLE public.property_taxes
    ADD CONSTRAINT property_taxes_installments_is_array
    CHECK (jsonb_typeof(installments) = 'array' AND jsonb_array_length(installments) <= 12);

COMMENT ON COLUMN public.property_taxes.installments IS
    'Parcelas: [{seq, amount, paid_by TENANT|LANDLORD, paid_on}] — empty when paid in one go.';
