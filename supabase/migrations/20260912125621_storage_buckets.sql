-- Storage buckets.
--
-- The baseline migration deliberately contains no Supabase-managed storage
-- objects (tables, functions, indexes): every Supabase database already has
-- them, and re-creating them would collide. Bucket ROWS are not part of a
-- schema dump either, so they are declared here so that a fresh database
-- (local `supabase db reset`, CI) ends up with the same buckets as production.
--
-- Idempotent: re-running only re-asserts the visibility flag.

INSERT INTO storage.buckets (id, name, public)
VALUES
    ('documents',       'documents',       false),  -- ownership proofs, agency agreements (signed URLs)
    ('lease-documents', 'lease-documents', false),  -- contracts, tenant documents (signed URLs)
    ('energy-bills',    'energy-bills',    false),  -- current_bill.pdf per property (signed URLs)
    ('property-media',  'property-media',  true),   -- photos/, videos/, listings/
    ('agency-logos',    'agency-logos',    true),
    ('agent-photos',    'agent-photos',    true),
    ('gateway-photos',  'gateway-photos',  true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
