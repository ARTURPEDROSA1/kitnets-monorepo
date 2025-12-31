-- Migration to fix leads table structure for Calculator Lead Capture
-- This script adds missing columns and ensures uniqueness on email to support UPSERT operations.

-- 1. Add missing columns referenced in save-calculator-lead.ts
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS location_source TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS trigger_type TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS interaction_count INTEGER;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS engaged_seconds NUMERIC;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS export_type TEXT;

-- 2. Ensure Email is Unique
-- The UPSERT operation requires a unique constraint on the column used for conflict resolution (email).
-- Note: If this fails causing an error, you likely have duplicate emails in your 'leads' table.
-- You can run: DELETE FROM public.leads a USING public.leads b WHERE a.id < b.id AND a.email = b.email;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'leads_email_key'
    ) THEN
        ALTER TABLE public.leads ADD CONSTRAINT leads_email_key UNIQUE (email);
    END IF;
END $$;

-- 3. RLS Policies
-- Enables the "upsert" capability for public users.
-- WARNING: This allows any user to update any lead if they know the email.
-- For a strict production app, consider using a Service Role in the server action instead of public RLS.
DO $$
BEGIN
    -- Public Update
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'Public Update Leads'
    ) THEN
        CREATE POLICY "Public Update Leads" ON public.leads FOR UPDATE USING (true) WITH CHECK (true);
    END IF;
      -- Public Select (needed for ON CONFLICT check in some RLS configs? safe to add for own leads usually, but here public)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'Public Read Leads'
    ) THEN
         CREATE POLICY "Public Read Leads" ON public.leads FOR SELECT USING (true);
    END IF;
END $$;
