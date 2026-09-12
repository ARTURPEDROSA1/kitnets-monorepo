-- ============================================================
-- Add metadata columns to gateways table
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.gateways ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.gateways ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.gateways ADD COLUMN IF NOT EXISTS panel_photo_url TEXT;
