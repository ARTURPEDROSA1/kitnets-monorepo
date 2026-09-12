-- Kitnets.com CMS (Supabase-Backed) – Final Implementation Spec (v1)
-- Based on User Request

-- 2.1 Enums
do $$ begin
    create type article_status as enum ('draft', 'published', 'archived');
exception
    when duplicate_object then null;
end $$;

-- 2.2 Tables

-- authors
create table if not exists authors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  avatar_url text null,
  bio text null,
  social_links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- categories
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- tags
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- articles (canonical entity)
create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references authors(id),
  primary_category_id uuid not null references categories(id),
  status article_status not null default 'draft',
  published_at timestamptz null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists articles_status_published_at_idx on articles (status, published_at desc);
create index if not exists articles_primary_category_status_idx on articles (primary_category_id, status);
create index if not exists articles_author_status_idx on articles (author_id, status);

-- article_translations
create table if not exists article_translations (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  lang text not null,
  title text not null,
  slug text not null,
  excerpt text null,
  content_mdx text not null,
  content_compiled jsonb null,
  metadata jsonb not null default '{}'::jsonb,
  reading_time_minutes int null,
  word_count int null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(lang, slug),
  unique(article_id, lang)
);
create index if not exists article_translations_lang_slug_idx on article_translations (lang, slug);
create index if not exists article_translations_article_lang_idx on article_translations (article_id, lang);

-- article_tags (many-to-many)
create table if not exists article_tags (
  article_id uuid not null references articles(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (article_id, tag_id)
);
create index if not exists article_tags_tag_id_idx on article_tags (tag_id);

-- article_categories (optional secondary categories)
create table if not exists article_categories (
  article_id uuid not null references articles(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  primary key (article_id, category_id)
);

-- article_revisions
create table if not exists article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  lang text not null,
  title text not null,
  excerpt text null,
  content_mdx text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid null,
  reason text null
);
create index if not exists article_revisions_article_lang_created_idx on article_revisions (article_id, lang, created_at desc);

-- 3) Row Level Security (RLS)

alter table authors enable row level security;
alter table categories enable row level security;
alter table tags enable row level security;
alter table articles enable row level security;
alter table article_translations enable row level security;
alter table article_tags enable row level security;
alter table article_categories enable row level security;
alter table article_revisions enable row level security;

-- 3.1 Public read rules (anon)

create policy "Public authors read" on authors for select using (true);
create policy "Public categories read" on categories for select using (true);
create policy "Public tags read" on tags for select using (true);

-- Articles public read: published only
create policy "Public articles read" on articles for select using (
  status = 'published' and (published_at is null or published_at <= now())
);

-- Translations public read: parent article is published
create policy "Public translations read" on article_translations for select using (
  exists (
    select 1 from articles 
    where articles.id = article_translations.article_id 
    and articles.status = 'published' 
    and (articles.published_at is null or articles.published_at <= now())
  )
);

-- Article tags public read: parent article is published
create policy "Public article_tags read" on article_tags for select using (
  exists (
    select 1 from articles 
    where articles.id = article_tags.article_id 
    and articles.status = 'published' 
    and (articles.published_at is null or articles.published_at <= now())
  )
);

-- Article categories public read: parent article is published
create policy "Public article_categories read" on article_categories for select using (
  exists (
    select 1 from articles 
    where articles.id = article_categories.article_id 
    and articles.status = 'published' 
    and (articles.published_at is null or articles.published_at <= now())
  )
);

-- Article revisions: no public read (default deny)

-- Note: Editors/Admins will use Service Role to bypass RLS for writes and drafts.
