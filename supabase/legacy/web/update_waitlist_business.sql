
-- Update waitlist_leads table with new business columns

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'business_name') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN business_name text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waitlist_leads' AND column_name = 'trade_name') THEN
        ALTER TABLE public.waitlist_leads ADD COLUMN trade_name text;
    END IF;
END $$;
