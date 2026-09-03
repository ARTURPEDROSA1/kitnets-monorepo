-- ============================================================
-- Agencies — Soft Delete Support
-- Run in Supabase SQL Editor
-- ============================================================

-- Add soft-delete columns
ALTER TABLE public.agencies
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.agencies
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id);

-- Index for efficient filtering of active agencies
CREATE INDEX IF NOT EXISTS idx_agencies_deleted_at
    ON public.agencies(deleted_at)
    WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.agencies.deleted_at IS 'Soft-delete timestamp. NULL = active. When set, the agency is considered deleted.';
COMMENT ON COLUMN public.agencies.deleted_by IS 'FK to profiles.id — the user who deleted this agency.';

-- Allow CNPJ reuse if previous agency was soft-deleted
ALTER TABLE public.agencies DROP CONSTRAINT IF EXISTS agencies_cnpj_key;
DROP INDEX IF EXISTS idx_agencies_cnpj_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agencies_cnpj_active
    ON public.agencies(cnpj)
    WHERE deleted_at IS NULL AND cnpj IS NOT NULL;
