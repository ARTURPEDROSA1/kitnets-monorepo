
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
create policy "Users can view own profile" 
on public.profiles for select 
using (auth.uid() = id);

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
create index idx_readings_meter_timestamp on public.readings(meter_id, timestamp desc);
