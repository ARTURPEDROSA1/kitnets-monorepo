-- Inquilinos: the profile fields of the redesigned hub and tenant dashboard.
--
--   occupation   what the tenant does for a living ("Enfermeira", "Motorista de aplicativo")
--   instagram    the Instagram handle, without the @ (the app normalises URLs and @handles to it)
--   linkedin     the LinkedIn profile URL (https://www.linkedin.com/in/…)
--   photo_path   the object path of the tenant's photo in the private bucket below (signed URLs)
--
-- Past tenants are kept as they are (status FORMER); nothing here changes the status model.

ALTER TABLE "public"."tenants"
    ADD COLUMN IF NOT EXISTS "occupation" "text",
    ADD COLUMN IF NOT EXISTS "instagram" "text",
    ADD COLUMN IF NOT EXISTS "linkedin" "text",
    ADD COLUMN IF NOT EXISTS "photo_path" "text";

COMMENT ON COLUMN "public"."tenants"."occupation" IS 'What the tenant does for a living, free text.';
COMMENT ON COLUMN "public"."tenants"."instagram" IS 'Instagram handle without the @ (1–30 chars: letters, digits, dots, underscores).';
COMMENT ON COLUMN "public"."tenants"."linkedin" IS 'LinkedIn profile URL (https://www.linkedin.com/in/…).';
COMMENT ON COLUMN "public"."tenants"."photo_path" IS 'Object path of the tenant''s photo in the private tenant-photos bucket; the app serves signed URLs.';

-- The photo of a tenant is personal data of a third party: private bucket, signed URLs only
-- (the routes use the service role; the browser never touches the bucket directly).
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-photos', 'tenant-photos', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
