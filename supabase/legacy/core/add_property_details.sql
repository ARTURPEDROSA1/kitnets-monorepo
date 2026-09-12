-- ============================================================
-- Add property_details and sub_units columns to profiles table
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS property_details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sub_units JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS property_videos JSONB DEFAULT '[]'::jsonb;
