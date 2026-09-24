-- FipeZap por cidade.
--
-- Até aqui fipezap_series guardava só a planilha nacional ("Índice FipeZAP") do arquivo da FIPE.
-- A mesma série (venda / locação / rentabilidade × métrica × dormitórios) passa a existir para as
-- 36 cidades que têm as três séries (22 capitais + 14 outras); 'brasil' é a série nacional já gravada.
-- Novidades:
--   city_slug          'brasil' ou o slug da cidade (catálogo em apps/web/src/lib/fipezap-cities.ts)
--   metric 'indice'    o Número-Índice da FIPE (nível), para gráficos rebaseados entre cidades
--   janela de 180 meses: o cron apaga o que fica antes dos 15 anos mais recentes (nacional inclusive)
--   vw_fipezap_latest  último mês publicado de cada série por cidade (uma linha por série)

alter table public.fipezap_series
    add column if not exists city_slug text not null default 'brasil'
        check (city_slug ~ '^[a-z0-9-]+$');

-- sem default: quem grava precisa dizer de que cidade é a linha (o tipo Insert passa a exigir)
alter table public.fipezap_series alter column city_slug drop default;

alter table public.fipezap_series drop constraint if exists fipezap_series_metric_check;
alter table public.fipezap_series add constraint fipezap_series_metric_check
    check (metric in ('var_mensal', 'var_12m', 'preco_m2', 'yield_mensal', 'indice'));

alter table public.fipezap_series
    drop constraint if exists fipezap_series_reference_date_index_type_metric_dormitorios_key;
alter table public.fipezap_series
    add constraint fipezap_series_series_month_key
    unique (city_slug, reference_date, index_type, metric, dormitorios);

drop index if exists public.idx_fipezap_dorm;
drop index if exists public.idx_fipezap_type_metric;
drop index if exists public.idx_fipezap_main_filter;
-- leituras nacionais (tipo/métrica/dormitórios fixos + cidade) e o último mês por cidade
create index if not exists idx_fipezap_series_lookup
    on public.fipezap_series (index_type, metric, dormitorios, city_slug, reference_date desc);

comment on column public.fipezap_series.city_slug is
    'brasil = índice nacional; senão o slug da cidade (apps/web/src/lib/fipezap-cities.ts). Janela móvel de 180 meses.';

-- Último mês publicado de cada série, por cidade. As colunas do DISTINCT ON são as do filtro, então
-- os predicados do PostgREST (index_type, metric, dormitorios, city_slug) descem para o índice.
create or replace view public.vw_fipezap_latest with (security_invoker = 'true') as
select distinct on (city_slug, index_type, metric, dormitorios)
       city_slug, index_type, metric, dormitorios, reference_date, value
  from public.fipezap_series
 order by city_slug, index_type, metric, dormitorios, reference_date desc;

-- observabilidade da janela de retenção
alter table public.fipezap_sync_state
    add column if not exists retention_cutoff date,
    add column if not exists rows_deleted integer;
