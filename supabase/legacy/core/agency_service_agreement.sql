-- ============================================================
-- Add Service Agreement and Notes columns to agencies
-- ============================================================

ALTER TABLE public.agencies
ADD COLUMN IF NOT EXISTS service_agreement_url TEXT,
ADD COLUMN IF NOT EXISTS service_agreement_filename TEXT,
ADD COLUMN IF NOT EXISTS management_fee NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS agreement_start_date DATE,
ADD COLUMN IF NOT EXISTS agreement_end_date DATE;

COMMENT ON COLUMN public.agencies.service_agreement_url IS 'URL of the uploaded service agreement or property management contract document.';
COMMENT ON COLUMN public.agencies.service_agreement_filename IS 'Original filename of the service agreement document.';
COMMENT ON COLUMN public.agencies.management_fee IS 'Property management fee percentage (e.g. 10.00 for 10%).';
COMMENT ON COLUMN public.agencies.agreement_start_date IS 'Start date of the service agreement.';
COMMENT ON COLUMN public.agencies.agreement_end_date IS 'End/renewal date of the service agreement.';
