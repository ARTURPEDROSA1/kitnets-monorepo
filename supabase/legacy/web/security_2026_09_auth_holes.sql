-- ============================================================
-- Security fix (Sep 2026): close anonymous read/write paths
--
-- Run ONCE in the Supabase SQL editor against the live project,
-- AFTER deploying the matching app changes (branch fix/auth-holes):
--   * water bills are now read/written through /api/water-bills
--   * lead / waitlist / contact / FAQ / suggestion server actions
--     now write with the service-role client
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. SECURITY DEFINER functions were executable by anon/authenticated
--    with no ownership check → anyone with the public anon key could
--    read or write any property's water bills.
DO $$
DECLARE
    fn record;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN (
              'get_property_bills',
              'get_property_details',
              'get_latest_billing_rate',
              'get_property_energy_bills',
              'upsert_water_bill'
          )
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
        RAISE NOTICE 'Revoked anon/authenticated EXECUTE on %', fn.sig;
    END LOOP;
END $$;

-- 2. World-readable / world-updatable PII and property data.
DROP POLICY IF EXISTS "Public Read Leads"      ON public.leads;
DROP POLICY IF EXISTS "Public Update Leads"    ON public.leads;
DROP POLICY IF EXISTS "Public Insert Leads"    ON public.leads;           -- writes now use service role
DROP POLICY IF EXISTS "Public Read Properties" ON public.properties;

DROP POLICY IF EXISTS "Enable read access for authenticated users only" ON public.waitlist_leads;
DROP POLICY IF EXISTS "Allow anonymous inserts"                         ON public.waitlist_leads; -- writes now use service role

-- 3. Verify
SELECT p.proname,
       has_function_privilege('anon',          p.oid, 'execute') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') AS authenticated_exec
FROM pg_proc p
WHERE p.prosecdef AND p.pronamespace = 'public'::regnamespace
ORDER BY 1;

SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('leads', 'properties', 'waitlist_leads')
ORDER BY 1, 2;
