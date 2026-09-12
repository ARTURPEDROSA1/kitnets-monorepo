-- ============================================================
-- RPC: Get all bills for a property (SECURITY DEFINER - bypasses RLS)
-- Run this in Supabase SQL Editor
-- ============================================================
CREATE OR REPLACE FUNCTION get_property_bills(p_property_id UUID)
RETURNS TABLE(
    id UUID,
    reference_month TEXT,
    meter_number TEXT,
    previous_reading NUMERIC,
    current_reading NUMERIC,
    consumption_m3 NUMERIC,
    billed_consumption_m3 NUMERIC,
    reading_date DATE,
    due_date DATE,
    water_tariff NUMERIC,
    sewage_tariff NUMERIC,
    water_basic_fee NUMERIC,
    sewage_basic_fee NUMERIC,
    total_amount NUMERIC,
    effective_rate_per_m3 NUMERIC,
    occurrence_code TEXT
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
    SELECT
        id, reference_month, meter_number,
        previous_reading, current_reading,
        consumption_m3, billed_consumption_m3,
        reading_date, due_date,
        water_tariff, sewage_tariff, water_basic_fee, sewage_basic_fee,
        total_amount, effective_rate_per_m3, occurrence_code
    FROM water_bills
    WHERE property_id = p_property_id
    ORDER BY reference_month DESC;
$$;

-- Also create a function for property details
CREATE OR REPLACE FUNCTION get_property_details(p_property_id UUID)
RETURNS TABLE(
    id UUID,
    name TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    connection_code TEXT
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
    SELECT id, name, address, city, state, zip, connection_code
    FROM properties
    WHERE id = p_property_id
    LIMIT 1;
$$;
