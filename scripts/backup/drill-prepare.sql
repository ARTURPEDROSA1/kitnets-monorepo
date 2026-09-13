-- Prepares a scratch Postgres (supabase/postgres image, or any Postgres with
-- the Supabase roles) to receive a restore of the public schema.
--
-- Production policies call the helpers below. The supabase/postgres image
-- ships auth.uid() and auth.role() but not auth.jwt(), which the platform adds
-- on top; real Supabase projects have all three, so this is only for drills.
-- Definitions match supabase's own; CREATE OR REPLACE keeps existing ones.
create schema if not exists auth;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

do $$
begin
  -- Roles the grants and policies refer to; already present in the supabase image.
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
