-- 1. Create the Table (Schema)
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

-- 2. Insert the Data (Seed)
-- Update economic_indexes to ensure the index exists
INSERT INTO public.economic_indexes (code, name, source, frequency, category, is_official)
VALUES ('REAJUSTE-SALARIO-MINIMO', 'Reajuste do Salário Mínimo', 'Governo Federal', 'Irregular', 'market', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.minimum_wage_history (reference_date, amount_brl, variation_percent, legislation, remarks, is_projection)
VALUES
('2026-01-01', 1621.00, 6.79, 'Decreto nº 12.797/2025', null, false),
('2025-01-01', 1518.00, 7.95, 'Decreto 12.342/2024', null, false),
('2024-01-01', 1412.00, 6.97, 'Decreto 11.864/2024', null, false),
('2023-05-01', 1320.00, 1.38, 'MP 1.172/2023 (Lei 14.663, de 2023)', '8,90% com relação a 2022', false),
('2023-01-01', 1302.00, 7.43, 'MP 1.143/2022 (Lei 14.663, de 2023)', null, false),
('2022-01-01', 1212.00, 10.16, 'MP 1091/2021 (Lei 14.358, de 2022)', null, false),
('2021-01-01', 1100.00, 5.26, 'MP 1021/2020 (Lei 14.158, de 2021)', null, false),
('2020-02-01', 1045.00, 0.58, 'MP 919/2020 (Lei 14.013, de 2020)', null, false),
('2020-01-01', 1039.00, 4.10, 'MP 916/2019 (Lei 14.013, de 2020)', null, false),
('2019-01-01', 998.00, 4.61, 'Decreto 9.661/2019', null, false),
('2018-01-01', 954.00, 1.81, 'Decreto 9.255/2017', null, false),
('2017-01-01', 937.00, 6.48, 'Lei 13.152/2015', null, false),
('2016-01-01', 880.00, 11.68, 'Decreto 8.618/2015', null, false),
('2015-01-01', 788.00, 8.84, 'Decreto 8.381/2014', null, false),
('2014-01-01', 724.00, 6.78, 'Decreto 8.166/2013', null, false),
('2013-01-01', 678.00, 9.00, 'Decreto 7.872/2012', null, false),
('2012-01-01', 622.00, 14.13, 'Decreto 7.655/2011', null, false),
('2011-03-01', 545.00, 0.93, 'Lei 12.382/2011', null, false),
('2011-01-01', 540.00, 5.88, 'MP 516/2010 (Lei Nº 12.382, 2011)', null, false),
('2010-01-01', 510.00, 9.68, 'Lei 12.255/2010', null, false),
('2009-02-01', 465.00, 12.05, 'Lei 11.944/2009', null, false),
('2008-03-01', 415.00, 9.21, 'Lei 11.709/2008', null, false),
('2007-04-01', 380.00, 8.57, 'Lei 11.498/2007', null, false),
('2006-04-01', 350.00, 16.67, 'Lei 11.321/2006', null, false),
('2005-05-01', 300.00, 15.38, 'Lei 11.164/2005', null, false),
('2004-05-01', 260.00, 8.33, 'Lei 10.888/2004', null, false),
('2003-06-01', 240.00, 20.00, 'Lei 10.699/2003', null, false),
('2002-06-01', 200.00, 11.11, 'Lei 10.525/2002', null, false),
('2001-06-01', 180.00, 19.21, 'MP 2.194-6/2001', null, false),
('2000-06-01', 151.00, 11.03, 'Lei 9.971/2000', null, false),
('1999-05-01', 136.00, 4.62, 'Lei 9.971/2000', null, false),
('1998-05-01', 130.00, 8.33, 'Lei 9.971/2000', null, false),
('1997-05-01', 120.00, 7.14, 'Lei 9.971/2000', null, false),
('1996-05-01', 112.00, 12.00, 'Lei 9.971/2000', null, false),
('1995-05-01', 100.00, 42.86, 'Lei 9.032/1995', null, false),
('1994-09-01', 70.00, 8.04, 'MP 598/1994', null, false),
('1994-07-01', 64.79, null, 'Lei 8.880/1994', null, false)
ON CONFLICT (reference_date) DO UPDATE SET
amount_brl = EXCLUDED.amount_brl,
variation_percent = EXCLUDED.variation_percent,
legislation = EXCLUDED.legislation,
remarks = EXCLUDED.remarks,
is_projection = EXCLUDED.is_projection;
