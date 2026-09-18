-- How a lease charge with a fixed amount (energy in a kitnet, condominium in a
-- multi-unit property) is readjusted: leases usually tie it to an index, often
-- a different one from the rent's. `adjustment_notes` keeps the rule in words
-- when it is not a plain index ("revisto conforme o consumo na renovação").
ALTER TABLE "public"."lease_charges"
    ADD COLUMN IF NOT EXISTS "adjustment_index" "text",
    ADD COLUMN IF NOT EXISTS "adjustment_notes" "text";

ALTER TABLE "public"."lease_charges"
    ADD CONSTRAINT "lease_charges_adjustment_index_check"
    CHECK (("adjustment_index" IS NULL) OR ("adjustment_index" = ANY (ARRAY['IPCA'::"text", 'IGP_M'::"text", 'INPC'::"text", 'IVAR'::"text", 'CUSTOM'::"text", 'NONE'::"text"])));

COMMENT ON COLUMN "public"."lease_charges"."adjustment_index" IS 'Index that readjusts this charge''s amount (same values as leases.adjustment_index); NULL when the lease does not say.';
COMMENT ON COLUMN "public"."lease_charges"."adjustment_notes" IS 'The readjustment rule in words, when the lease states one.';
