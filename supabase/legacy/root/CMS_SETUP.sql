-- CMS Tables Setup for Kitnets.com

-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- 1. Authors Table
create table if not exists public.authors (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  slug text not null unique,
  avatar_url text,
  bio text,
  social_links jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Categories Table
create table if not exists public.categories (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Articles Table
create table if not exists public.articles (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  slug text not null,
  content text, -- MDX content
  excerpt text,
  status text check (status in ('draft', 'published', 'archived')) default 'draft',
  published_at timestamp with time zone,
  author_id uuid references public.authors(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  metadata jsonb default '{}'::jsonb, -- SEO metadata
  cover_image text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Ensure slug is unique per category (or globally? Globally is better for simple routing)
  unique(slug)
);

-- Indexes for performance
create index if not exists articles_slug_idx on public.articles (slug);
create index if not exists articles_status_idx on public.articles (status);
create index if not exists articles_category_id_idx on public.articles (category_id);
create index if not exists articles_author_id_idx on public.articles (author_id);

-- RLS Policies (Row Level Security)
alter table public.authors enable row level security;
alter table public.categories enable row level security;
alter table public.articles enable row level security;

-- Public Read Access
create policy "Allow public read access on authors" on public.authors for select using (true);
create policy "Allow public read access on categories" on public.categories for select using (true);
create policy "Allow public read access on published articles" on public.articles for select using (status = 'published' and published_at <= now());

-- Admin Write Access (Adjust 'service_role' or specific user roles as needed)
-- For now, allowing authenticated users to read everything (including drafts)
create policy "Allow authenticated read access" on public.articles for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- Create updated_at triggers
create or replace function public.handle_updated_at() 
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger authors_updated_at before update on public.authors for each row execute procedure public.handle_updated_at();
create trigger categories_updated_at before update on public.categories for each row execute procedure public.handle_updated_at();
create trigger articles_updated_at before update on public.articles for each row execute procedure public.handle_updated_at();
