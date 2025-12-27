
-- Update waitlist_leads table with new detailed address and partner columns

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'number') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN number text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'complement') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN complement text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'partners_json') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN partners_json text; -- Using text to store JSON string for simplicity
    END IF;
END $$;
