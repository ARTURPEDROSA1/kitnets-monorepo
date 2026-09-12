alter table public.profiles add column if not exists property_photos jsonb default '[]'::jsonb;
