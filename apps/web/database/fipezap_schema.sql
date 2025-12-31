-- FIPEZAP Database Schema
-- Based on normalization strategy for efficient filtering and scaling.

-- 1. Table: fipezap_series
create table if not exists public.fipezap_series (
  id bigserial primary key,

  reference_date date not null,          -- always first day of month
  index_type text not null check (
    index_type in ('venda', 'locacao', 'yield')
  ),

  metric text not null check (
    metric in (
      'var_mensal',        -- %
      'var_12m',           -- %
      'preco_m2',          -- R$/m²
      'yield_mensal'       -- % mensalizada
    )
  ),

  dormitorios text not null check (
    dormitorios in ('total', '1', '2', '3', '4')
  ),

  value numeric(10,4),                    -- supports %, price, yield

  source text default 'FIPEZAP',
  created_at timestamptz default now(),

  unique (
    reference_date,
    index_type,
    metric,
    dormitorios
  )
);

-- 2. Indexes (CRITICAL for performance)
create index if not exists idx_fipezap_date
  on public.fipezap_series (reference_date);

create index if not exists idx_fipezap_type_metric
  on public.fipezap_series (index_type, metric);

create index if not exists idx_fipezap_dorm
  on public.fipezap_series (dormitorios);

create index if not exists idx_fipezap_main_filter
  on public.fipezap_series (
    index_type,
    metric,
    dormitorios,
    reference_date
  );

-- 3. Row Level Security
alter table public.fipezap_series enable row level security;

create policy "Public Read Access FipeZap" on public.fipezap_series
  for select using (true);

/*
Usage Examples:

-- Insert Data
insert into fipezap_series (reference_date, index_type, metric, dormitorios, value)
values ('2008-01-01', 'venda', 'preco_m2', 'total', 2226);

-- Query KPI (Latest Monthly Variation for Venda Total)
select value from fipezap_series
where index_type = 'venda' and metric = 'var_mensal' and dormitorios = 'total'
order by reference_date desc limit 1;
*/
