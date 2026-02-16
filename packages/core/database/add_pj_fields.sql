-- Migration: Add PJ (Pessoa Jurídica) fields to profiles table
-- Run this in the Supabase SQL Editor with service_role privileges

-- person_type: 'pf' (Pessoa Física) or 'pj' (Pessoa Jurídica)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS person_type text DEFAULT 'pf' CHECK (person_type IN ('pf', 'pj'));

-- CNPJ for Pessoa Jurídica
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cnpj text;

-- Razão Social (Legal business name)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_name text;

-- Nome Fantasia (Trade/brand name)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trade_name text;

-- Data da Situação Cadastral (Registration status date — replaces birth_date for PJ)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS registration_status_date date;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('person_type', 'cnpj', 'business_name', 'trade_name', 'registration_status_date')
ORDER BY ordinal_position;
