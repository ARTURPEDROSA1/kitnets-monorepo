-- ============================================================
-- Phase 2.1: Manual Bill Entry - Schema Updates
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add "Data Leitura Orig" (original reading date) to water_bills
-- This is the actual date the meter was physically read,
-- vs reading_date which is the scheduled round date.
-- ============================================================
ALTER TABLE public.water_bills
    ADD COLUMN IF NOT EXISTS reading_date_orig DATE;

-- 2. Add allocation model to properties
-- Controls how bills are split across units/meters
-- ============================================================
ALTER TABLE public.properties
    ADD COLUMN IF NOT EXISTS allocation_model TEXT DEFAULT 'proportional';

DO $$ BEGIN
    ALTER TABLE public.properties
        ADD CONSTRAINT chk_allocation_model
        CHECK (allocation_model IN ('equal', 'proportional', 'fixed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Update existing Jan 2026 bill with original reading date
UPDATE public.water_bills
SET reading_date_orig = '2026-01-21'
WHERE property_id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
  AND reference_month = '2026-01';

-- 4. RPC function for upserting bills (used by manual entry form)
-- ============================================================
CREATE OR REPLACE FUNCTION upsert_water_bill(
    p_property_id UUID,
    p_reference_month TEXT,
    p_meter_number TEXT,
    p_previous_reading NUMERIC,
    p_current_reading NUMERIC,
    p_consumption_m3 NUMERIC,
    p_billed_consumption_m3 NUMERIC,
    p_reading_date DATE,
    p_reading_date_orig DATE,
    p_due_date DATE,
    p_total_amount NUMERIC,
    p_water_tariff NUMERIC DEFAULT 0,
    p_sewage_tariff NUMERIC DEFAULT 0,
    p_water_basic_fee NUMERIC DEFAULT 0,
    p_sewage_basic_fee NUMERIC DEFAULT 0,
    p_occurrence_code TEXT DEFAULT NULL,
    p_average_consumption_m3 NUMERIC DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bill_id UUID;
BEGIN
    INSERT INTO public.water_bills (
        property_id, reference_month, meter_number,
        previous_reading, current_reading,
        consumption_m3, billed_consumption_m3,
        reading_date, reading_date_orig, due_date,
        water_tariff, sewage_tariff, water_basic_fee, sewage_basic_fee,
        total_amount, occurrence_code, average_consumption_m3, notes,
        updated_at
    ) VALUES (
        p_property_id, p_reference_month, p_meter_number,
        p_previous_reading, p_current_reading,
        p_consumption_m3, p_billed_consumption_m3,
        p_reading_date, p_reading_date_orig, p_due_date,
        p_water_tariff, p_sewage_tariff, p_water_basic_fee, p_sewage_basic_fee,
        p_total_amount, p_occurrence_code, p_average_consumption_m3, p_notes,
        NOW()
    )
    ON CONFLICT (property_id, reference_month)
    DO UPDATE SET
        meter_number = EXCLUDED.meter_number,
        previous_reading = EXCLUDED.previous_reading,
        current_reading = EXCLUDED.current_reading,
        consumption_m3 = EXCLUDED.consumption_m3,
        billed_consumption_m3 = EXCLUDED.billed_consumption_m3,
        reading_date = EXCLUDED.reading_date,
        reading_date_orig = EXCLUDED.reading_date_orig,
        due_date = EXCLUDED.due_date,
        water_tariff = EXCLUDED.water_tariff,
        sewage_tariff = EXCLUDED.sewage_tariff,
        water_basic_fee = EXCLUDED.water_basic_fee,
        sewage_basic_fee = EXCLUDED.sewage_basic_fee,
        total_amount = EXCLUDED.total_amount,
        occurrence_code = EXCLUDED.occurrence_code,
        average_consumption_m3 = EXCLUDED.average_consumption_m3,
        notes = EXCLUDED.notes,
        updated_at = NOW()
    RETURNING id INTO v_bill_id;
    
    RETURN v_bill_id;
END;
$$;

-- 5. Update get_property_bills to include reading_date_orig
--    Must DROP first because return type is changing
-- ============================================================
DROP FUNCTION IF EXISTS get_property_bills(uuid);

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
    reading_date_orig DATE,
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
        reading_date, reading_date_orig, due_date,
        water_tariff, sewage_tariff, water_basic_fee, sewage_basic_fee,
        total_amount, effective_rate_per_m3, occurrence_code
    FROM water_bills
    WHERE property_id = p_property_id
    ORDER BY reference_month DESC;
$$;
