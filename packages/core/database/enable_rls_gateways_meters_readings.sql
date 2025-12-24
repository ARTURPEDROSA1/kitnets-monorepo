-- Enable RLS for IoT tables
alter table public.gateways enable row level security;
alter table public.meters enable row level security;
alter table public.readings enable row level security;

-- Policy: GATEWAYS
-- Users can view/edit their own gateways
create policy "Users can all own gateways"
on public.gateways for all
using (
  owner_id in (
    select id from public.profiles
    where clerk_id = (select auth.jwt() ->> 'sub')
  )
)
with check (
  owner_id in (
    select id from public.profiles
    where clerk_id = (select auth.jwt() ->> 'sub')
  )
);

-- Policy: METERS
-- Users can view/edit meters linked to their gateways
create policy "Users can all own meters"
on public.meters for all
using (
  gateway_id in (
    select id from public.gateways
    where owner_id in (
      select id from public.profiles
      where clerk_id = (select auth.jwt() ->> 'sub')
    )
  )
)
with check (
  gateway_id in (
    select id from public.gateways
    where owner_id in (
      select id from public.profiles
      where clerk_id = (select auth.jwt() ->> 'sub')
    )
  )
);

-- Policy: READINGS
-- Users can view readings linked to their meters
-- (Assuming they don't insert readings manually, only view. Gateways insert via Service Role.)
create policy "Users can view own readings"
on public.readings for select
using (
  meter_id in (
    select id from public.meters
    where gateway_id in (
      select id from public.gateways
      where owner_id in (
        select id from public.profiles
        where clerk_id = (select auth.jwt() ->> 'sub')
      )
    )
  )
);
