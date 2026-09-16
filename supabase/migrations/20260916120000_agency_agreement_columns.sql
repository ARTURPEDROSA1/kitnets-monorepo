-- Agency service agreement: real columns instead of a metadata block.
--
-- The app stored the agreement's storage path, original filename, management
-- fee and contract dates packed into `agencies.description` as
--   <!-- __METADATA__:{"service_agreement_url":...} -->
-- because these columns never existed in production (the API had a fallback
-- for "column not found" that quietly became the only path). This adds the
-- columns and moves the packed values into them, leaving `description` clean.
--
-- The file itself lives in the private "documents" bucket under
-- agencies/<agency id>/agreements/<timestamp>_<name>; the column holds that
-- object path and the API hands out one-hour signed URLs.

ALTER TABLE public.agencies
    ADD COLUMN IF NOT EXISTS service_agreement_url      text,
    ADD COLUMN IF NOT EXISTS service_agreement_filename text,
    ADD COLUMN IF NOT EXISTS management_fee             numeric(6,3),
    ADD COLUMN IF NOT EXISTS agreement_start_date       date,
    ADD COLUMN IF NOT EXISTS agreement_end_date         date;

COMMENT ON COLUMN public.agencies.service_agreement_url IS
    'Object path in the private "documents" bucket (agencies/<id>/agreements/...). Served through signed URLs.';
COMMENT ON COLUMN public.agencies.service_agreement_filename IS
    'Original filename of the uploaded agreement, for display.';
COMMENT ON COLUMN public.agencies.management_fee IS
    'Administration fee charged by the agency, in percent of the rent (e.g. 8.5).';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agencies_management_fee_range') THEN
        ALTER TABLE public.agencies
            ADD CONSTRAINT agencies_management_fee_range
            CHECK (management_fee IS NULL OR (management_fee >= 0 AND management_fee <= 100));
    END IF;
END $$;

-- Move packed metadata into the new columns. Row by row so one unreadable
-- block cannot fail the migration; such rows keep their description as-is.
DO $$
DECLARE
    r     record;
    meta  jsonb;
    clean text;
BEGIN
    FOR r IN
        SELECT id, description
        FROM public.agencies
        WHERE description LIKE '<!-- __METADATA__:%'
    LOOP
        BEGIN
            meta := (regexp_match(r.description, '^<!-- __METADATA__:(.*?) -->'))[1]::jsonb;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'agencies %: metadata block could not be parsed; left untouched', r.id;
            CONTINUE;
        END;

        clean := NULLIF(btrim(regexp_replace(r.description, '^<!-- __METADATA__:.*? -->\n?', '')), '');

        UPDATE public.agencies
        SET service_agreement_url      = COALESCE(service_agreement_url,      NULLIF(meta->>'service_agreement_url', '')),
            service_agreement_filename = COALESCE(service_agreement_filename, NULLIF(meta->>'service_agreement_filename', '')),
            management_fee             = COALESCE(management_fee,
                                             CASE WHEN meta->>'management_fee' ~ '^[0-9]+(\.[0-9]+)?$'
                                                  THEN LEAST((meta->>'management_fee')::numeric, 100) END),
            agreement_start_date       = COALESCE(agreement_start_date,
                                             CASE WHEN meta->>'agreement_start_date' ~ '^\d{4}-\d{2}-\d{2}$'
                                                  THEN (meta->>'agreement_start_date')::date END),
            agreement_end_date         = COALESCE(agreement_end_date,
                                             CASE WHEN meta->>'agreement_end_date' ~ '^\d{4}-\d{2}-\d{2}$'
                                                  THEN (meta->>'agreement_end_date')::date END),
            description                = clean
        WHERE id = r.id;
    END LOOP;
END $$;
