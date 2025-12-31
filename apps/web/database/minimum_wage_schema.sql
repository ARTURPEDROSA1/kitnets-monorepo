-- Minimum Wage History Table
create table if not exists public.minimum_wage_history (
  id bigserial primary key,
  reference_date date not null, -- Data de vigência
  amount_brl numeric(10,2) not null, -- Valor nominal
  variation_percent numeric(10,2), -- Variação percentual (pode ser null para o primeiro registro)
  legislation text, -- Lei/Decreto
  remarks text, -- Observações
  year integer generated always as (extract(year from reference_date)) stored,
  month integer generated always as (extract(month from reference_date)) stored,
  is_projection boolean default false,
  created_at timestamptz default now(),
  
  unique (reference_date)
);

-- Index for date sorting
create index if not exists idx_minimum_wage_date on public.minimum_wage_history (reference_date);
