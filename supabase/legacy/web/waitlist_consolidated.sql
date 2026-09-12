
-- 1. Create the table if it doesn't exist
create table if not exists public.waitlist_leads (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  profile_type text null,
  cpf text null,
  cnpj text null,
  portfolio_size text null,
  city text null,
  state text null,
  name text null,
  email text null,
  whatsapp text null,
  status text null default 'pending'::text,
  source text null,
  constraint waitlist_leads_pkey primary key (id)
);

-- 2. Add Row Level Security (RLS) if not already enabled
alter table public.waitlist_leads enable row level security;

-- Policy to allow anonymous inserts (public submission)
do $$ 
begin 
  if not exists (select 1 from pg_policies where tablename = 'waitlist_leads' and policyname = 'Allow anonymous inserts') then
    create policy "Allow anonymous inserts" on public.waitlist_leads for insert with check (true);
  end if;
end $$;

-- Policy to restrict reads to authenticated users only (admin)
do $$ 
begin 
  if not exists (select 1 from pg_policies where tablename = 'waitlist_leads' and policyname = 'Enable read access for authenticated users only') then
    create policy "Enable read access for authenticated users only" on public.waitlist_leads for select using (auth.role() = 'authenticated');
  end if;
end $$;

-- 3. Add all additional columns safely (idempotent)
do $$ 
begin 
    -- Address columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'zip_code') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN zip_code text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'street') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN street text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'neighborhood') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN neighborhood text;
    END IF;

    -- Business columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'business_name') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN business_name text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'trade_name') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN trade_name text;
    END IF;

    -- Full details columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'number') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN number text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'complement') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN complement text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'partners_json') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN partners_json text;
    END IF;
end $$;
