-- Update IPCA data for January 2026
-- Source: IBGE (https://ibge.gov.br/explica/inflacao.php)
-- Values: Monthly 0.16%, Accumulated 12m 4.56%, Accumulated Year 0.16%
-- IPCA do último mês: 0,33% (Jan/2026) — from the image
-- IPCA acumulado de 12 meses: 4,44% (Jan/2026)
-- IPCA acumulado em 2026: 0,33% (Jan = first month, so YTD = monthly)
-- Next release date: 12/03/2026

INSERT INTO economic_index_values (
    index_id,
    year,
    month,
    reference_date,
    value_percent,
    accumulated_12m,
    is_projection
)
SELECT 
    id,
    2026,
    1,
    '2026-01-01',
    0.33,
    4.44,
    false
FROM economic_indexes
WHERE code = 'IPCA'
ON CONFLICT (index_id, year, month) DO UPDATE SET
    value_percent = EXCLUDED.value_percent,
    accumulated_12m = EXCLUDED.accumulated_12m,
    is_projection = EXCLUDED.is_projection,
    reference_date = EXCLUDED.reference_date;
