
-- Update waitlist_leads table with new creci column

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'creci') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN creci text;
    END IF;
END $$;
