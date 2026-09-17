-- Outcome of the daily index jobs (/api/cron/update-bcb, /api/cron/update-ivar): one row per job, so a
-- stale index can be diagnosed by reading a table instead of hunting through function logs.
-- Written and read by the service role only: RLS is on with no policies.
create table if not exists public.index_sync_state (
  job text primary key,
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  last_status text check (last_status in ('ok', 'unchanged', 'error')),
  last_message text,
  latest_reference text
);

alter table public.index_sync_state enable row level security;

-- IVAR: the old job guessed the year from nearby page text and, on 2026-03-05, stored February 2026's
-- figures (0.51 / 4.03) under December 2026, a month that has not happened. Remove that row; the new job
-- backfills January–August 2026 from the source's per-year tables. The date guard keeps a genuine
-- December 2026 value, written later by the new job, out of reach if this migration is ever re-run.
delete from public.economic_index_values v
using public.economic_indexes i
where v.index_id = i.id
  and i.code = 'IVAR'
  and v.year = 2026
  and v.month = 12
  and v.created_at < timestamptz '2026-09-01';
