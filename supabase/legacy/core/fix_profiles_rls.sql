
-- Fix profiles table ID default
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_pkey') THEN
    ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT uuid_generate_v4();
  END IF;
  
  -- Alternatively, just try to set the default if it's missing
  ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT uuid_generate_v4();
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Ensure RLS policies are correct (Drop and Recreate to be safe)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
USING ( clerk_id = (select auth.jwt() ->> 'sub') );

CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE
USING ( clerk_id = (select auth.jwt() ->> 'sub') );

CREATE POLICY "Users can insert own profile" 
ON public.profiles FOR INSERT 
WITH CHECK ( clerk_id = (select auth.jwt() ->> 'sub') );

-- Verify Grant
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
