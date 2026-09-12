-- Update INPC data for January 2026
-- Source: IBGE (https://ibge.gov.br/explica/inflacao.php)
-- INPC do último mês: 0,39% (Jan/2026)
-- INPC acumulado de 12 meses: 4,30% (Jan/2026)
-- INPC acumulado em 2026: 0,39% (Jan = first month, so YTD = monthly)
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
    0.39,
    4.30,
    false
FROM economic_indexes
WHERE code = 'INPC'
ON CONFLICT (index_id, year, month) DO UPDATE SET
    value_percent = EXCLUDED.value_percent,
    accumulated_12m = EXCLUDED.accumulated_12m,
    is_projection = EXCLUDED.is_projection,
    reference_date = EXCLUDED.reference_date;
