-- Migration to update leads table for Index Lead Capture

-- 1. Add missing columns
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS page_url TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS consent_newsletter BOOLEAN DEFAULT TRUE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_type TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS referrer TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

-- 2. Add Index for performance on Lookups
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);

-- 3. Comments
COMMENT ON COLUMN public.leads.last_seen_at IS 'Timestamp of most recent interaction';
COMMENT ON COLUMN public.leads.first_seen_at IS 'Timestamp of initial capture';
COMMENT ON COLUMN public.leads.lead_type IS 'Origin type e.g. index_filter_gate';
