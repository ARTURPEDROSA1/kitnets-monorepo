-- Account deletion: every foreign key into public.profiles must either cascade
-- or null out, so `DELETE FROM profiles WHERE clerk_id = …` cannot fail with an
-- FK violation.
--
-- Before this, listings / ownership_proofs / gateways and the *.deleted_by
-- audit columns had plain (NO ACTION) references. deleteAccount() only logged
-- that failure and still deleted the Clerk user, which stranded the profile;
-- the next signup with the same e-mail silently re-linked it.
--
-- Data the user owns is removed with the profile (CASCADE). References that
-- are audit trails or hardware links are kept and merely detached (SET NULL).

-- Owned data → CASCADE
ALTER TABLE public.listings
    DROP CONSTRAINT IF EXISTS listings_profile_id_fkey;
ALTER TABLE public.listings
    ADD CONSTRAINT listings_profile_id_fkey
        FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.ownership_proofs
    DROP CONSTRAINT IF EXISTS ownership_proofs_profile_id_fkey;
ALTER TABLE public.ownership_proofs
    ADD CONSTRAINT ownership_proofs_profile_id_fkey
        FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Detachable references → SET NULL
ALTER TABLE public.gateways
    DROP CONSTRAINT IF EXISTS gateways_owner_id_fkey;
ALTER TABLE public.gateways
    ADD CONSTRAINT gateways_owner_id_fkey
        FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.agencies
    DROP CONSTRAINT IF EXISTS agencies_deleted_by_fkey;
ALTER TABLE public.agencies
    ADD CONSTRAINT agencies_deleted_by_fkey
        FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.agents
    DROP CONSTRAINT IF EXISTS agents_deleted_by_fkey;
ALTER TABLE public.agents
    ADD CONSTRAINT agents_deleted_by_fkey
        FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.leases
    DROP CONSTRAINT IF EXISTS leases_deleted_by_fkey;
ALTER TABLE public.leases
    ADD CONSTRAINT leases_deleted_by_fkey
        FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tenants
    DROP CONSTRAINT IF EXISTS tenants_deleted_by_fkey;
ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_deleted_by_fkey
        FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
