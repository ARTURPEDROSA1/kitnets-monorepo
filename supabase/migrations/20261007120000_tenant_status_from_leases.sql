-- Inquilinos: a tenant whose every contract has ended is a former tenant.
--
-- The Contratos import created the tenants of an old, already closed contract as current ones (status
-- ACTIVE), so they showed among "Atuais" with "sem contrato em vigor". The app now keeps a tenant's status in
-- line with their contracts (apps/web/src/lib/tenant-status.ts, applied when a contract is created, edited or
-- closed); this puts right the tenants it left behind: not FORMER yet, no contract in force or in the works
-- (as primary tenant or co-tenant), at least one contract that ran and ended. They become FORMER, out on the
-- day the last one ended (its termination, else its term) unless a move-out day was already recorded.
-- Tenants with no contract, or only cancelled ones, are left as the owner registered them.

WITH tenant_leases AS (
    SELECT l.primary_tenant_id AS tenant_id, l.status, l.end_date, l.termination_date
    FROM public.leases l
    WHERE l.deleted_at IS NULL AND l.primary_tenant_id IS NOT NULL
    UNION ALL
    SELECT lt.tenant_id, l.status, l.end_date, l.termination_date
    FROM public.lease_tenants lt
    JOIN public.leases l ON l.id = lt.lease_id
    WHERE l.deleted_at IS NULL
),
moved_out AS (
    SELECT tenant_id, MAX(COALESCE(termination_date, end_date)::date) AS last_day
    FROM tenant_leases
    GROUP BY tenant_id
    HAVING BOOL_OR(status IN ('EXPIRED', 'TERMINATED'))
       AND NOT BOOL_OR(status IN ('ACTIVE', 'EXPIRING_SOON', 'DRAFT'))
)
UPDATE public.tenants t
SET status = 'FORMER',
    move_out_date = COALESCE(t.move_out_date, m.last_day)
FROM moved_out m
WHERE t.id = m.tenant_id
  AND t.deleted_at IS NULL
  AND t.status <> 'FORMER';
