
-- Update waitlist_leads table with new address columns

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'zip_code') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN zip_code text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'street') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN street text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'neighborhood') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN neighborhood text;
    END IF;
END $$;
