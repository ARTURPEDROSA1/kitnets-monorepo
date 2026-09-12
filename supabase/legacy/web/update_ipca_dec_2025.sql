-- Update IPCA data for December 2025
-- Values: Monthly 0.33%, Accumulated 12m 4.26%
-- Constraint is on (index_id, year, month)
-- Column accumulated_year does not exist.

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
    2025,
    12,
    '2025-12-01',
    0.33,
    4.26,
    false
FROM economic_indexes
WHERE code = 'IPCA'
ON CONFLICT (index_id, year, month) DO UPDATE SET
    value_percent = EXCLUDED.value_percent,
    accumulated_12m = EXCLUDED.accumulated_12m,
    is_projection = EXCLUDED.is_projection,
    reference_date = EXCLUDED.reference_date;
