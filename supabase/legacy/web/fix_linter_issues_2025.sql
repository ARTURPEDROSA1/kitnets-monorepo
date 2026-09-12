-- Fix 1: Enable RLS for minimum_wage_history
ALTER TABLE public.minimum_wage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read Access Minimum Wage" ON public.minimum_wage_history;
CREATE POLICY "Public Read Access Minimum Wage" ON public.minimum_wage_history
    FOR SELECT USING (true);

-- Fix 2: Enable RLS for fipezap_series
ALTER TABLE public.fipezap_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read Access FipeZap" ON public.fipezap_series;
CREATE POLICY "Public Read Access FipeZap" ON public.fipezap_series
    FOR SELECT USING (true);

-- Fix 3: Fix Security Definer View (vw_latest_indices)
-- Switch to SECURITY INVOKER to respect RLS of the querying user
ALTER VIEW public.vw_latest_indices SET (security_invoker = true);
