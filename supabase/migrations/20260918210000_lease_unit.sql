-- A lease on a multi-unit property is usually for one unit (one tenant, one
-- kitnet); now and then a company rents the whole property. `unit_id` points
-- to the sub-unit in the owner's profile JSON (`profiles.sub_units[].id` or
-- `profiles.additional_properties[].subUnits[].id`); NULL means the whole
-- property, which is also what every existing lease and every single-unit
-- property has. `unit_name` is the unit's name when the lease was saved, so
-- the lease still reads right if the unit is later renamed or removed.
ALTER TABLE "public"."leases"
    ADD COLUMN IF NOT EXISTS "unit_id" "text",
    ADD COLUMN IF NOT EXISTS "unit_name" "text";

COMMENT ON COLUMN "public"."leases"."unit_id" IS 'Sub-unit of a multi-unit property (id inside the owner''s profile JSON); NULL = the whole property.';
COMMENT ON COLUMN "public"."leases"."unit_name" IS 'Name of the unit when the lease was last saved.';

CREATE INDEX IF NOT EXISTS "idx_leases_property_unit" ON "public"."leases" ("property_id", "unit_id");

-- Sub-units had no identity of their own (they were addressed by position).
-- Give every existing one a stable id; the app assigns one to new units.
UPDATE "public"."profiles" p
SET "sub_units" = (
    SELECT jsonb_agg(
        CASE
            WHEN jsonb_typeof(u) = 'object' AND COALESCE(u->>'id', '') = ''
                THEN u || jsonb_build_object('id', gen_random_uuid()::text)
            ELSE u
        END
        ORDER BY ord
    )
    FROM jsonb_array_elements(p."sub_units") WITH ORDINALITY AS t(u, ord)
)
WHERE jsonb_typeof(p."sub_units") = 'array'
  AND jsonb_array_length(p."sub_units") > 0;

UPDATE "public"."profiles" p
SET "additional_properties" = (
    SELECT jsonb_agg(
        CASE
            WHEN jsonb_typeof(ap) = 'object'
                 AND jsonb_typeof(ap->'subUnits') = 'array'
                 AND jsonb_array_length(ap->'subUnits') > 0
                THEN jsonb_set(ap, '{subUnits}', (
                    SELECT jsonb_agg(
                        CASE
                            WHEN jsonb_typeof(u) = 'object' AND COALESCE(u->>'id', '') = ''
                                THEN u || jsonb_build_object('id', gen_random_uuid()::text)
                            ELSE u
                        END
                        ORDER BY uord
                    )
                    FROM jsonb_array_elements(ap->'subUnits') WITH ORDINALITY AS s(u, uord)
                ))
            ELSE ap
        END
        ORDER BY aord
    )
    FROM jsonb_array_elements(p."additional_properties") WITH ORDINALITY AS a(ap, aord)
)
WHERE jsonb_typeof(p."additional_properties") = 'array'
  AND jsonb_array_length(p."additional_properties") > 0;
