-- Migration: Add property_type and admin_data columns to profiles table
-- Run this in the Supabase SQL Editor with service_role privileges

-- property_type: 'single' (Unifamiliar) or 'multi' (Multifamiliar), NULL if no property created yet
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS property_type text DEFAULT NULL;
ALTER TABLE public.profiles ALTER COLUMN property_type DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN property_type SET DEFAULT NULL;

-- admin_data: JSONB object holding administrator info for PJ holdings
-- Structure: { name, email, phone, address: { cep, street, number, city, state, neighborhood, complement } }
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_data jsonb DEFAULT NULL;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('property_type', 'admin_data')
ORDER BY ordinal_position;
