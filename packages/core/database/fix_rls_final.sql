
-- Drop the existing ambiguous policy for insert
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Create a more permissive and specific policy for profiles
-- Allow insert if user is authenticated AND the clerk_id matches their JWT sub
CREATE POLICY "Users can insert own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (
    auth.role() = 'authenticated' AND 
    clerk_id = (select auth.jwt() ->> 'sub')
);

-- Ensure update policy is also robust
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE
USING ( clerk_id = (select auth.jwt() ->> 'sub') )
WITH CHECK ( clerk_id = (select auth.jwt() ->> 'sub') );

-- Ensure select policy
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
USING ( clerk_id = (select auth.jwt() ->> 'sub') );

-- IMPORTANT: Grant permissions explicitly if not already done
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
