-- ============================================================
-- CLEANUP: Deduplicate profiles for pedrosa.ac@gmail.com
-- Run this in Supabase SQL Editor (as service_role / admin)
-- ============================================================

-- Step 0: PREVIEW — See all profiles for this email
SELECT 
    id, 
    clerk_id, 
    full_name, 
    email, 
    role,
    cpf,
    phone,
    birth_date,
    address IS NOT NULL AND address != '{}'::jsonb AS has_address,
    property_address IS NOT NULL AND property_address != '{}'::jsonb AS has_property_address,
    property_photos IS NOT NULL AND array_length(property_photos, 1) > 0 AS has_photos,
    created_at,
    updated_at
FROM public.profiles
WHERE email = 'pedrosa.ac@gmail.com'
ORDER BY updated_at DESC;

-- Step 1: Identify the BEST profile (most complete, most recently updated)
-- This query ranks profiles by completeness + recency and picks the winner
WITH ranked AS (
    SELECT 
        id,
        clerk_id,
        full_name,
        email,
        updated_at,
        (
            (CASE WHEN full_name IS NOT NULL AND full_name != '' AND full_name != 'EMPTY' THEN 1 ELSE 0 END) +
            (CASE WHEN cpf IS NOT NULL AND cpf != '' THEN 1 ELSE 0 END) +
            (CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END) +
            (CASE WHEN birth_date IS NOT NULL THEN 1 ELSE 0 END) +
            (CASE WHEN address IS NOT NULL AND address != '{}'::jsonb THEN 1 ELSE 0 END) +
            (CASE WHEN property_address IS NOT NULL AND property_address != '{}'::jsonb THEN 1 ELSE 0 END) +
            (CASE WHEN property_photos IS NOT NULL AND array_length(property_photos, 1) > 0 THEN 1 ELSE 0 END)
        ) AS completeness_score,
        ROW_NUMBER() OVER (
            PARTITION BY email 
            ORDER BY 
                (
                    (CASE WHEN full_name IS NOT NULL AND full_name != '' AND full_name != 'EMPTY' THEN 1 ELSE 0 END) +
                    (CASE WHEN cpf IS NOT NULL AND cpf != '' THEN 1 ELSE 0 END) +
                    (CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END) +
                    (CASE WHEN birth_date IS NOT NULL THEN 1 ELSE 0 END) +
                    (CASE WHEN address IS NOT NULL AND address != '{}'::jsonb THEN 1 ELSE 0 END) +
                    (CASE WHEN property_address IS NOT NULL AND property_address != '{}'::jsonb THEN 1 ELSE 0 END) +
                    (CASE WHEN property_photos IS NOT NULL AND array_length(property_photos, 1) > 0 THEN 1 ELSE 0 END)
                ) DESC,
                updated_at DESC
        ) AS rn
    FROM public.profiles
    WHERE email = 'pedrosa.ac@gmail.com'
)
SELECT id, clerk_id, full_name, completeness_score, rn, 
       CASE WHEN rn = 1 THEN '✅ KEEP' ELSE '❌ DELETE' END AS action
FROM ranked
ORDER BY rn;

-- Step 2: Check for related data in other tables (ownership_proofs, gateways, listings)
-- Make sure we aren't losing important linked data
SELECT 'ownership_proofs' AS table_name, p.id AS profile_id, p.clerk_id, count(op.id) AS related_count
FROM public.profiles p
LEFT JOIN public.ownership_proofs op ON op.profile_id = p.id
WHERE p.email = 'pedrosa.ac@gmail.com'
GROUP BY p.id, p.clerk_id

UNION ALL

SELECT 'gateways', p.id, p.clerk_id, count(g.id)
FROM public.profiles p
LEFT JOIN public.gateways g ON g.owner_id = p.id
WHERE p.email = 'pedrosa.ac@gmail.com'
GROUP BY p.id, p.clerk_id

UNION ALL

SELECT 'listings', p.id, p.clerk_id, count(l.id)
FROM public.profiles p
LEFT JOIN public.listings l ON l.profile_id = p.id
WHERE p.email = 'pedrosa.ac@gmail.com'
GROUP BY p.id, p.clerk_id

ORDER BY table_name, related_count DESC;


-- ============================================================
-- Step 3: MIGRATE related data to the keeper profile, then DELETE duplicates
-- ⚠️ IMPORTANT: Run Step 0-2 first, note the KEEPER profile ID, then update below
-- Replace '<KEEPER_PROFILE_ID>' with the actual UUID of the profile to keep
-- ============================================================

-- UNCOMMENT AND EDIT the lines below after reviewing Step 1 & 2 output

/*

-- Set the keeper profile ID (the one with rn=1 from Step 1)
DO $$
DECLARE
    keeper_id UUID := '<KEEPER_PROFILE_ID>';  -- ← REPLACE THIS
    keeper_email TEXT := 'pedrosa.ac@gmail.com';
BEGIN
    -- Migrate ownership_proofs to keeper profile
    UPDATE public.ownership_proofs 
    SET profile_id = keeper_id
    WHERE profile_id IN (
        SELECT id FROM public.profiles 
        WHERE email = keeper_email AND id != keeper_id
    );

    -- Migrate gateways to keeper profile
    UPDATE public.gateways 
    SET owner_id = keeper_id
    WHERE owner_id IN (
        SELECT id FROM public.profiles 
        WHERE email = keeper_email AND id != keeper_id
    );

    -- Migrate listings to keeper profile
    UPDATE public.listings 
    SET profile_id = keeper_id
    WHERE profile_id IN (
        SELECT id FROM public.profiles 
        WHERE email = keeper_email AND id != keeper_id
    );

    -- Delete duplicate profiles (NOT the keeper)
    DELETE FROM public.profiles 
    WHERE email = keeper_email AND id != keeper_id;

    RAISE NOTICE 'Cleanup complete. Remaining profiles for %: %', 
        keeper_email,
        (SELECT count(*) FROM public.profiles WHERE email = keeper_email);
END $$;

*/


-- ============================================================
-- Step 4: PREVENT future duplicates
-- Add a unique index on email (lowercase) to prevent duplicate signups
-- ============================================================

-- This ensures no two profiles can share the same email, 
-- regardless of which Clerk account created them
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique 
ON public.profiles (LOWER(email));


-- ============================================================
-- Step 5: Verify final state
-- ============================================================
SELECT id, clerk_id, full_name, email, role, created_at, updated_at
FROM public.profiles
WHERE email = 'pedrosa.ac@gmail.com';
