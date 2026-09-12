-- Migration to clean up duplicates and fix leads table structure
-- Run this in your Supabase SQL Editor.

-- 1. Clean up duplicate emails (Keep the most recent one)
DELETE FROM public.leads
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY email
                   ORDER BY created_at DESC, id DESC
               ) as row_num
        FROM public.leads
    ) t
    WHERE t.row_num > 1
);

-- 2. Add missing columns (if they weren't added in the partial run)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS location_source TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS trigger_type TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS interaction_count INTEGER;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS engaged_seconds NUMERIC;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS export_type TEXT;

-- 3. Ensure Email is Unique (Now safe to run after cleanup)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'leads_email_key'
    ) THEN
        ALTER TABLE public.leads ADD CONSTRAINT leads_email_key UNIQUE (email);
    END IF;
END $$;

-- 4. RLS Policies
-- Enables the "upsert" capability for public users.
DO $$
BEGIN
    -- Public Update
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'Public Update Leads'
    ) THEN
        CREATE POLICY "Public Update Leads" ON public.leads FOR UPDATE USING (true) WITH CHECK (true);
    END IF;
      -- Public Select
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'Public Read Leads'
    ) THEN
         CREATE POLICY "Public Read Leads" ON public.leads FOR SELECT USING (true);
    END IF;
END $$;
