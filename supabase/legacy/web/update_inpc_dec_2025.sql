-- Update INPC data for December 2025
-- Monthly: 0.21%
-- Accumulated 12m: 3.90% (Calculated based on 2025 seed data)

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
    0.21,
    3.90,
    false
FROM economic_indexes
WHERE code = 'INPC'
ON CONFLICT (index_id, year, month) DO UPDATE SET
    value_percent = EXCLUDED.value_percent,
    accumulated_12m = EXCLUDED.accumulated_12m,
    is_projection = EXCLUDED.is_projection,
    reference_date = EXCLUDED.reference_date;
