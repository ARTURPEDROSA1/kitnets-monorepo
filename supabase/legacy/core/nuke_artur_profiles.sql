-- ============================================================
-- NUCLEAR CLEANUP: Remove ALL profiles for pedrosa.ac@gmail.com
-- Run this in Supabase SQL Editor (as service_role / admin)
-- Date: 2026-02-16
-- Purpose: Clear all ARTUR duplicate profiles before LLC re-signup
-- ============================================================

-- ============================================================
-- Step 0: PREVIEW — See what we're about to delete
-- Run this first to verify the scope of deletion
-- ============================================================

-- 0a. All profiles for this email
SELECT 
    id, 
    clerk_id, 
    full_name, 
    email, 
    role,
    created_at,
    updated_at
FROM public.profiles
WHERE LOWER(email) = 'pedrosa.ac@gmail.com'
ORDER BY created_at;

-- 0b. Related ownership_proofs
SELECT op.id, op.profile_id, op.original_name, op.status, op.created_at
FROM public.ownership_proofs op
JOIN public.profiles p ON op.profile_id = p.id
WHERE LOWER(p.email) = 'pedrosa.ac@gmail.com';

-- 0c. Related gateways
SELECT g.id, g.serial_number, g.owner_id, g.label, g.status
FROM public.gateways g
JOIN public.profiles p ON g.owner_id = p.id
WHERE LOWER(p.email) = 'pedrosa.ac@gmail.com';

-- 0d. Related listings
SELECT l.id, l.profile_id, l.title, l.type, l.intent
FROM public.listings l
JOIN public.profiles p ON l.profile_id = p.id
WHERE LOWER(p.email) = 'pedrosa.ac@gmail.com';

-- 0e. Count summary
SELECT 
    (SELECT COUNT(*) FROM public.profiles WHERE LOWER(email) = 'pedrosa.ac@gmail.com') AS profiles_count,
    (SELECT COUNT(*) FROM public.ownership_proofs WHERE profile_id IN (SELECT id FROM public.profiles WHERE LOWER(email) = 'pedrosa.ac@gmail.com')) AS proofs_count,
    (SELECT COUNT(*) FROM public.gateways WHERE owner_id IN (SELECT id FROM public.profiles WHERE LOWER(email) = 'pedrosa.ac@gmail.com')) AS gateways_count,
    (SELECT COUNT(*) FROM public.listings WHERE profile_id IN (SELECT id FROM public.profiles WHERE LOWER(email) = 'pedrosa.ac@gmail.com')) AS listings_count;


-- ============================================================
-- Step 1: SAVE Clerk IDs (you'll need these to delete from Clerk)
-- Copy the output of this query before proceeding
-- ============================================================

SELECT clerk_id 
FROM public.profiles 
WHERE LOWER(email) = 'pedrosa.ac@gmail.com'
ORDER BY created_at;


-- ============================================================
-- Step 2: DELETE everything (cascade from profiles)
-- ⚠️  UNCOMMENT the block below ONLY after reviewing Step 0 output
-- ============================================================

/*

-- 2a. Delete ownership_proofs linked to these profiles
DELETE FROM public.ownership_proofs 
WHERE profile_id IN (
    SELECT id FROM public.profiles WHERE LOWER(email) = 'pedrosa.ac@gmail.com'
);

-- 2b. Unlink gateways (set owner_id to NULL so the gateway can be re-claimed)
UPDATE public.gateways 
SET owner_id = NULL, status = 'unclaimed'
WHERE owner_id IN (
    SELECT id FROM public.profiles WHERE LOWER(email) = 'pedrosa.ac@gmail.com'
);

-- 2c. Delete listings linked to these profiles
DELETE FROM public.listings 
WHERE profile_id IN (
    SELECT id FROM public.profiles WHERE LOWER(email) = 'pedrosa.ac@gmail.com'
);

-- 2d. Delete ALL profiles for this email
DELETE FROM public.profiles 
WHERE LOWER(email) = 'pedrosa.ac@gmail.com';

-- 2e. Verify deletion
SELECT 'Remaining profiles:' AS status, COUNT(*) AS count
FROM public.profiles 
WHERE LOWER(email) = 'pedrosa.ac@gmail.com';

*/


-- ============================================================
-- Step 3: PREVENT future duplicates
-- Add unique constraint on email AND on clerk_id
-- ============================================================

/*

-- Unique email (case-insensitive) — prevents multiple profiles for same email
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique 
ON public.profiles (LOWER(email));

-- clerk_id already has UNIQUE constraint in schema, but verify:
-- ALTER TABLE public.profiles ADD CONSTRAINT profiles_clerk_id_unique UNIQUE (clerk_id);

*/


-- ============================================================
-- Step 4: FINAL VERIFICATION
-- Run after Step 2 to confirm clean state
-- ============================================================

SELECT 'profiles' AS table_name, COUNT(*) AS total_rows FROM public.profiles
UNION ALL
SELECT 'ownership_proofs', COUNT(*) FROM public.ownership_proofs
UNION ALL
SELECT 'gateways', COUNT(*) FROM public.gateways
UNION ALL
SELECT 'listings', COUNT(*) FROM public.listings;
