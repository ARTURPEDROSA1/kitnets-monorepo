-- Update Minimum Wage for 2026 based on Decree 12.797
-- See: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/D12797.htm

UPDATE public.minimum_wage_history
SET 
  amount_brl = 1621.00,
  variation_percent = 6.79,
  legislation = 'Decreto nº 12.797/2025',
  is_projection = false
WHERE reference_date = '2026-01-01';

-- Verify the update
SELECT * FROM public.minimum_wage_history WHERE reference_date = '2026-01-01';
