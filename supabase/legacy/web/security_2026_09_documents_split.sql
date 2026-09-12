-- ============================================================
-- Security fix (Sep 2026): split the 'documents' bucket
--
-- Before: one PUBLIC bucket held matrículas, IPTU, identity documents and
-- agency agreements next to property photos/videos. Every file in it was
-- fetchable by URL without authentication.
--
-- After:
--   * property-media  (public)  photos/…, videos/…, listings/…
--   * documents       (private) <profileId>/… ownership proofs,
--                               agencies/<id>/agreements/… service agreements
--
-- ORDER MATTERS. Run these three steps in sequence:
--   1. deploy branch fix/documents-bucket-split (new uploads go to
--      property-media; agreements are served through signed URLs)
--   2. node apps/web/scripts/migrate-property-media.mjs --apply
--      (moves existing photos/videos and rewrites the stored URLs)
--   3. THIS FILE, once, in the Supabase SQL editor
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-media', 'property-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

UPDATE storage.buckets SET public = false WHERE id = 'documents';

-- 2. Drop the role-wide policies: any signed-in user could read or write ANY
--    object in the bucket.
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view documents"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;

-- 3. documents: owner-prefix policies for the browser upload/read/delete of
--    ownership proofs. Paths are <profileId>/… or <profileId>/prop-N/…, so
--    the first folder must be the caller's own profile id. Agency agreements
--    (agencies/<id>/…) are handled exclusively by the service role.
DROP POLICY IF EXISTS "Owners manage own documents (insert)" ON storage.objects;
CREATE POLICY "Owners manage own documents (insert)"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.profiles
        WHERE clerk_id = (SELECT auth.jwt() ->> 'sub')
    )
);

DROP POLICY IF EXISTS "Owners manage own documents (select)" ON storage.objects;
CREATE POLICY "Owners manage own documents (select)"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.profiles
        WHERE clerk_id = (SELECT auth.jwt() ->> 'sub')
    )
);

DROP POLICY IF EXISTS "Owners manage own documents (delete)" ON storage.objects;
CREATE POLICY "Owners manage own documents (delete)"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.profiles
        WHERE clerk_id = (SELECT auth.jwt() ->> 'sub')
    )
);

-- 4. property-media: public reads happen through the public URL (no policy
--    needed). Browser uploads are limited to the caller's own folders:
--    photos/<profileId>/…, videos/<profileId>/…, listings/<profileId>/…
DROP POLICY IF EXISTS "Owners upload own property media" ON storage.objects;
CREATE POLICY "Owners upload own property media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'property-media'
    AND (storage.foldername(name))[1] IN ('photos', 'videos', 'listings')
    AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM public.profiles
        WHERE clerk_id = (SELECT auth.jwt() ->> 'sub')
    )
);

DROP POLICY IF EXISTS "Owners delete own property media" ON storage.objects;
CREATE POLICY "Owners delete own property media"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'property-media'
    AND (storage.foldername(name))[1] IN ('photos', 'videos', 'listings')
    AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM public.profiles
        WHERE clerk_id = (SELECT auth.jwt() ->> 'sub')
    )
);

-- 5. Verify (single result set)
SELECT 'bucket' AS kind, id AS name,
       CASE WHEN public THEN 'PUBLIC' ELSE 'private' END AS status
FROM storage.buckets
UNION ALL
SELECT 'leftover media in documents', name, 'MOVE ME'
FROM storage.objects
WHERE bucket_id = 'documents' AND (name LIKE 'photos/%' OR name LIKE 'videos/%')
UNION ALL
SELECT 'storage policy', policyname, cmd || ' | ' || coalesce(qual, with_check)
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY 1, 2;

-- ROLLBACK (only if proof upload/viewing breaks because the Clerk→Supabase
-- JWT template does not put the Clerk user id in `sub`):
--   UPDATE storage.buckets SET public = true WHERE id = 'documents';
--   CREATE POLICY "Authenticated users can upload documents" ON storage.objects FOR INSERT
--     WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated');
--   CREATE POLICY "Authenticated users can view documents" ON storage.objects FOR SELECT
--     USING (bucket_id = 'documents' AND auth.role() = 'authenticated');
