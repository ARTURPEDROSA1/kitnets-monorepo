-- ============================================================
-- Imobiliária (Agency) Module — Allow Independent Agency Registrations
-- Drops the global UNIQUE constraint on agencies(cnpj) so multiple
-- accounts (e.g. independent landlords or personal/corporate accounts)
-- can manage the same real estate agency independently in their dashboards.
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Drop the unique constraint if present
ALTER TABLE public.agencies DROP CONSTRAINT IF EXISTS agencies_cnpj_key;

-- 2. Drop unique index if created separately
DROP INDEX IF EXISTS public.idx_agencies_cnpj;

-- 3. Recreate standard non-unique index for fast lookups
CREATE INDEX IF NOT EXISTS idx_agencies_cnpj ON public.agencies(cnpj) WHERE cnpj IS NOT NULL;
