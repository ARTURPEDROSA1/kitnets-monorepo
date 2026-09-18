-- State of the daily FipeZap sync (/api/cron/update-fipezap): the stamp of the last FIPE workbook
-- imported, so an unchanged file is not downloaded again, and the outcome of the last run.
-- Single row. Written and read by the service role only: RLS is on with no policies.
create table if not exists public.fipezap_sync_state (
  id smallint primary key default 1 check (id = 1),
  etag text,
  last_modified text,
  latest_reference_date date,
  last_checked_at timestamptz,
  last_imported_at timestamptz,
  last_status text check (last_status in ('unchanged', 'imported', 'error')),
  last_message text,
  rows_upserted integer
);

alter table public.fipezap_sync_state enable row level security;

insert into public.fipezap_sync_state (id) values (1) on conflict (id) do nothing;
