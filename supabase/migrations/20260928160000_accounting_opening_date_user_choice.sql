-- The start of the holding's books on the platform is the owner's decision (with the
-- contador), not a default: accounting_settings.opening_date loses its DEFAULT and may be
-- NULL until it is chosen. Nothing from the bank statement is posted before it is set.
--
-- Rows that only carry the old default (2026-01-01) and have no journal entry yet go back
-- to "not decided".

ALTER TABLE public.accounting_settings ALTER COLUMN opening_date DROP DEFAULT;
ALTER TABLE public.accounting_settings ALTER COLUMN opening_date DROP NOT NULL;

ALTER TABLE public.accounting_settings DROP CONSTRAINT IF EXISTS accounting_settings_opening_first_day;
ALTER TABLE public.accounting_settings
    ADD CONSTRAINT accounting_settings_opening_first_day CHECK (opening_date IS NULL OR EXTRACT(DAY FROM opening_date) = 1);

UPDATE public.accounting_settings s
   SET opening_date = NULL
 WHERE s.opening_date = DATE '2026-01-01'
   AND NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.owner_id = s.owner_id);

COMMENT ON COLUMN public.accounting_settings.opening_date IS
    'First day of the first month kept in the platform books (the opening balance date). NULL until the owner decides; the bank statement is not posted before it is set.';
