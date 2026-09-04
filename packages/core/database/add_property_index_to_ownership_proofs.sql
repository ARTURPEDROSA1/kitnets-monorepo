-- ============================================================
-- Add property_index to ownership_proofs and enable DELETE RLS
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add property_index column (default 0 for primary property)
ALTER TABLE public.ownership_proofs 
    ADD COLUMN IF NOT EXISTS property_index INTEGER NOT NULL DEFAULT 0;

-- 2. Create index for efficient querying by profile and property
CREATE INDEX IF NOT EXISTS idx_ownership_proofs_profile_property 
    ON public.ownership_proofs (profile_id, property_index);

-- 3. Backfill property_index for existing records based on file_url pattern (/prop-{idx}/)
UPDATE public.ownership_proofs
SET property_index = (substring(file_url from '/prop-([0-9]+)/'))::integer
WHERE file_url ~ '/prop-([0-9]+)/' AND property_index = 0;

-- 4. Enable DELETE policy for users to delete their own proofs
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public'
        AND tablename = 'ownership_proofs' 
        AND policyname = 'Users can delete own proofs'
    ) THEN
        CREATE POLICY "Users can delete own proofs" 
        ON public.ownership_proofs FOR DELETE 
        USING (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE profiles.id = ownership_proofs.profile_id
                AND profiles.clerk_id = (SELECT auth.jwt() ->> 'sub')
            )
        );
    END IF;
END $$;

-- 5. Deduplicate existing records: keep only the newest proof per (profile_id, property_index, original_name)
DELETE FROM public.ownership_proofs
WHERE id NOT IN (
    SELECT DISTINCT ON (profile_id, property_index, original_name) id
    FROM public.ownership_proofs
    ORDER BY profile_id, property_index, original_name, created_at DESC, id
);
