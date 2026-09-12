-- ============================================================
-- Fix: Re-link gateway to property + Create missing RPC functions
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Re-link the gateway to its property
-- (This was reset when the gateway was re-claimed because the claim API didn't preserve property_id)
UPDATE public.gateways
SET property_id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
WHERE id = '587ea104-bca7-4af2-8c47-52b642d51e14'
  AND property_id IS NULL;

-- Also ensure the property has the correct owner_id
UPDATE public.properties
SET owner_id = (
    SELECT owner_id FROM public.gateways
    WHERE id = '587ea104-bca7-4af2-8c47-52b642d51e14'
)
WHERE id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
  AND owner_id IS NULL;


-- 2. Create the get_latest_billing_rate RPC function
-- This is called by the gateway detail page to compute "Custo Estimado"
CREATE OR REPLACE FUNCTION get_latest_billing_rate(p_property_id UUID)
RETURNS TABLE(
    reference_month TEXT,
    effective_rate_per_m3 NUMERIC,
    total_amount NUMERIC,
    consumption_m3 NUMERIC
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
    SELECT
        reference_month,
        effective_rate_per_m3,
        total_amount,
        consumption_m3
    FROM water_bills
    WHERE property_id = p_property_id
      AND effective_rate_per_m3 IS NOT NULL
    ORDER BY reference_month DESC
    LIMIT 1;
$$;


-- 3. Verify
SELECT id, label, property_id, owner_id, status
FROM gateways
WHERE id = '587ea104-bca7-4af2-8c47-52b642d51e14';

SELECT reference_month, effective_rate_per_m3, total_amount
FROM get_latest_billing_rate('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
