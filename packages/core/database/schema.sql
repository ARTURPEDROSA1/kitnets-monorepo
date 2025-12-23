
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Table: profiles
-- Links Clerk Users to app-specific data
create table public.profiles (
  id uuid primary key, -- verify if Clerk uses UUID or text. Usually text (user_2b...). Using text might be safer or uuid if you map it.
  -- Clerk ID are strings, so let's use text for ID if we map 1:1, or use a separate clerk_id column.
  clerk_id text unique not null,
  role text check (role in ('landlord', 'tenant', 'admin')) default 'landlord',
  full_name text,
  email text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Policy: Users can view their own profile
-- Policy: Users can view own profile
create policy "Users can view own profile" 
on public.profiles for select 
using ( clerk_id = (select auth.jwt() ->> 'sub') );

create policy "Users can update own profile" 
on public.profiles for update
using ( clerk_id = (select auth.jwt() ->> 'sub') );

create policy "Users can insert own profile" 
on public.profiles for insert 
with check ( clerk_id = (select auth.jwt() ->> 'sub') );

-- Table: gateways
-- Represents a physical Kitnet Gateway Device
create table public.gateways (
  id uuid default uuid_generate_v4() primary key,
  serial_number text unique not null, -- The "Claim Code"
  status text check (status in ('online', 'offline', 'unclaimed')) default 'unclaimed',
  owner_id uuid references public.profiles(id), -- Linked landlord
  label text, -- User friendly name (e.g. "Building A")
  last_seen_at timestamp with time zone,
  config jsonb default '{}'::jsonb, -- Remote config copy
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Table: meters
-- Water/Gas/Energy meters attached to a gateway
create table public.meters (
  id uuid default uuid_generate_v4() primary key,
  gateway_id uuid references public.gateways(id) not null,
  meter_index int not null, -- 1-4 (physical port)
  type text check (type in ('water', 'gas', 'electricity')),
  label text, -- e.g. "Apt 101"
  pulse_factor float default 1.0, -- liters per pulse
  initial_reading float default 0,
  current_reading float default 0,
  unit text default 'm3',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(gateway_id, meter_index)
);

-- Table: readings
-- Historical consumption data
create table public.readings (
  id uuid default uuid_generate_v4() primary key,
  meter_id uuid references public.meters(id) not null,
  value float not null, -- reading value
  delta float, -- consumption since last reading
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create index for faster time-series queries

-- Add extra profile fields
alter table public.profiles add column if not exists cpf text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists address jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists property_address jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists property_photos text[] default '{}';

-- Table: ownership_proofs
create table if not exists public.ownership_proofs (
  id uuid default uuid_generate_v4() primary key,
  profile_id uuid references public.profiles(id) not null,
  file_url text not null,
  original_name text,
  file_size int,
  mime_type text,
  status text check (status in ('pending', 'approved', 'rejected')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Policy for ownership_proofs
alter table public.ownership_proofs enable row level security;

create policy "Users can view own proofs" 
on public.ownership_proofs for select 
using (
  exists (
    select 1 from public.profiles
    where profiles.id = ownership_proofs.profile_id
    and profiles.clerk_id = (select auth.jwt() ->> 'sub')
  )
);

create policy "Users can insert own proofs" 
on public.ownership_proofs for insert 
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = ownership_proofs.profile_id
    and profiles.clerk_id = (select auth.jwt() ->> 'sub')
  )
);


-- Storage Bucket (if storage schema exists)
insert into storage.buckets (id, name, public) 
values ('documents', 'documents', true)
on conflict (id) do nothing;

create policy "Authenticated users can upload documents"
on storage.objects for insert
with check ( bucket_id = 'documents' and auth.role() = 'authenticated' );

create policy "Authenticated users can view documents"
on storage.objects for select
using ( bucket_id = 'documents' and auth.role() = 'authenticated' );



-- Table: listings
create table if not exists public.listings (
  id uuid default uuid_generate_v4() primary key,
  profile_id uuid references public.profiles(id),
  title text,
  description text,
  price numeric,
  area numeric,
  bedrooms int,
  bathrooms int,
  parking int,
  location jsonb, -- city, state, neighborhood, etc.
  photos text[],
  type text, -- kitnet, studio, etc.
  intent text, -- rent, sale
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.listings enable row level security;

create policy "Public view listings" on public.listings for select using (true);

create policy "Owners insert listings" on public.listings for insert with check (
  exists (
    select 1 from public.profiles
    where profiles.id = listings.profile_id
    and profiles.clerk_id = (select auth.jwt() ->> 'sub')
  )
);
