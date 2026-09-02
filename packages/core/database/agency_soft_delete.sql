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
