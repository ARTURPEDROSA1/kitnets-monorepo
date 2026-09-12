-- ============================================================
-- Security fix (Sep 2026): Row Level Security on the IoT tables
--
-- Production had RLS DISABLED on public.gateways and public.meter_readings
-- (the repo's enable_rls_gateways_meters_readings.sql was never applied and
-- targets the legacy `readings` table anyway). Anyone holding the anon key
-- could read every gateway and rewrite owner_id / property_id / readings.
--
-- Run ONCE in the Supabase SQL editor AFTER deploying branch fix/gateway-rls,
-- which moves the gateway detail/edit pages onto authenticated API routes
-- (/api/gateways/[id], /api/gateways/[id]/photo). From that deploy on, no
-- browser client touches these tables; ingest/claim use the service role.
--
-- Idempotent: safe to re-run. Also removes the temporary read-all policies
-- suggested as a stopgap ("tmp read gateways", "tmp read meter_readings").
-- ============================================================

ALTER TABLE public.gateways       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;

-- Stopgap and legacy policies
DROP POLICY IF EXISTS "tmp read gateways"          ON public.gateways;
DROP POLICY IF EXISTS "tmp read meter_readings"    ON public.meter_readings;
DROP POLICY IF EXISTS "Users can all own gateways" ON public.gateways;
DROP POLICY IF EXISTS "Users can all own meters"   ON public.meters;

-- Owner-scoped READ policies. They only take effect for clients that carry a
-- Clerk JWT (auth.jwt()->>'sub'); the anon key matches nothing. Writes are
-- reserved to the service role, so no INSERT/UPDATE/DELETE policies exist.
DROP POLICY IF EXISTS "Owners can view own gateways" ON public.gateways;
CREATE POLICY "Owners can view own gateways"
ON public.gateways FOR SELECT
USING (
    owner_id IN (
        SELECT id FROM public.profiles
        WHERE clerk_id = (SELECT auth.jwt() ->> 'sub')
    )
);

DROP POLICY IF EXISTS "Owners can view own meters" ON public.meters;
CREATE POLICY "Owners can view own meters"
ON public.meters FOR SELECT
USING (
    gateway_id IN (
        SELECT g.id FROM public.gateways g
        WHERE g.owner_id IN (
            SELECT id FROM public.profiles
            WHERE clerk_id = (SELECT auth.jwt() ->> 'sub')
        )
    )
);

-- meter_readings.meter_id is TEXT in production (meters.id is uuid); compare as text.
DROP POLICY IF EXISTS "Owners can view own meter readings" ON public.meter_readings;
CREATE POLICY "Owners can view own meter readings"
ON public.meter_readings FOR SELECT
USING (
    meter_id::text IN (
        SELECT m.id::text
        FROM public.meters m
        JOIN public.gateways g ON g.id = m.gateway_id
        WHERE g.owner_id IN (
            SELECT id FROM public.profiles
            WHERE clerk_id = (SELECT auth.jwt() ->> 'sub')
        )
    )
);

-- Verify (single result set)
SELECT 'rls' AS kind, c.relname AS name,
       CASE WHEN c.relrowsecurity THEN 'enabled' ELSE 'DISABLED' END AS status
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('gateways', 'meters', 'meter_readings')
UNION ALL
SELECT 'policy ' || tablename, policyname, cmd || ' | ' || coalesce(qual, '-')
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('gateways', 'meters', 'meter_readings')
ORDER BY 1, 2;
