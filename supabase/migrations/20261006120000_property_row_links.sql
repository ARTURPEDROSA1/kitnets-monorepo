-- Imóveis: a property's `properties` row is found by its id, never by its name.
--
-- On 2026-10-06 a new house was named after its bairro, "SANTO ANTONIO" — the name of the owner's
-- multi-unit property. ensure_property_row looked rows up by name, so the house got no row of its own (no
-- revenue, no investment), and deleting it deleted the multi-unit property's contract charges, co-tenants,
-- contract file links and bills: the old cascade ran statement by statement from the API and stopped
-- half-way, when the invoices' foreign key refused to let the leases go.
--
-- Every property of the profile JSON now carries the id of its row (additional_properties[i].id, and
-- property_details.propertyRowId for the first property; lib/property-link.ts pairs them):
--
--   link_profile_property_row  stamps that id on one profile entry, creating the row when it does not exist,
--                              under the per-owner lock of ensure_property_row (which is no longer called);
--   delete_property_cascade    removes a property and what hangs off it in ONE transaction, and refuses while
--                              a contract or an invoice still points to it.
--
-- Both service role only.

CREATE OR REPLACE FUNCTION public.link_profile_property_row(
    p_owner_id        UUID,
    -- 0 = the first property (property_details / property_address), n = additional_properties[n - 1]
    p_slot            INT,
    -- the id the caller read on the entry (NULL = none): nothing happens when the entry changed since
    p_expected_stored TEXT,
    -- the row to link: an existing rental row of the owner, or the id to create it with; NULL = a new id
    p_row_id          UUID,
    p_name            TEXT,
    p_address         TEXT,
    p_city            TEXT,
    p_state           TEXT,
    p_zip             TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_details    JSONB;
    v_address    JSONB;
    v_additional JSONB;
    v_entry      JSONB;
    v_stored     TEXT;
    v_entry_name TEXT;
    v_street     TEXT;
    v_name       TEXT := btrim(coalesce(p_name, ''));
    v_id         UUID;
    v_row_owner  UUID;
    v_row_uc     BOOLEAN;
BEGIN
    IF p_owner_id IS NULL OR p_slot IS NULL OR p_slot < 0 OR v_name = '' THEN
        RAISE EXCEPTION 'link_profile_property_row: owner, slot and name are required';
    END IF;

    -- one owner at a time (the same lock as ensure_property_row): two readers never create two rows
    PERFORM pg_advisory_xact_lock(hashtextextended('ensure_property_row:' || p_owner_id::text, 0));

    SELECT property_details, property_address, additional_properties
    INTO v_details, v_address, v_additional
    FROM public.profiles
    WHERE id = p_owner_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF p_slot = 0 THEN
        v_details := coalesce(v_details, '{}'::jsonb);
        v_address := coalesce(v_address, '{}'::jsonb);
        v_stored := v_details ->> 'propertyRowId';
    ELSE
        IF jsonb_typeof(v_additional) IS DISTINCT FROM 'array' OR jsonb_array_length(v_additional) < p_slot THEN
            RETURN NULL;
        END IF;
        v_entry := v_additional -> (p_slot - 1);
        IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN
            RETURN NULL;
        END IF;
        v_details := coalesce(v_entry -> 'details', '{}'::jsonb);
        v_address := coalesce(v_entry -> 'address', '{}'::jsonb);
        v_stored := v_entry ->> 'id';
    END IF;

    -- the entry must still be the one the caller read: a property removed in between shifts the slots
    IF v_stored IS DISTINCT FROM p_expected_stored THEN
        RETURN NULL;
    END IF;
    v_entry_name := btrim(coalesce(v_details ->> 'propertyName', ''));
    v_street := btrim(coalesce(v_address ->> 'street', ''));
    IF v_entry_name <> '' THEN
        IF lower(v_entry_name) <> lower(v_name) THEN
            RETURN NULL;
        END IF;
    ELSIF v_street = '' OR position(lower(v_street) IN lower(v_name)) <> 1 THEN
        RETURN NULL;
    END IF;

    v_id := coalesce(p_row_id, gen_random_uuid());
    SELECT owner_id, (electronic_id IS NOT NULL AND electronic_id ~ '"isStandaloneUc"\s*:\s*true')
    INTO v_row_owner, v_row_uc
    FROM public.properties
    WHERE id = v_id;
    IF FOUND THEN
        IF v_row_owner <> p_owner_id OR v_row_uc THEN
            RAISE EXCEPTION 'link_profile_property_row: % is not a rental property of this owner', v_id;
        END IF;
    ELSE
        INSERT INTO public.properties (id, owner_id, name, address, city, state, zip)
        VALUES (v_id, p_owner_id, v_name, NULLIF(btrim(p_address), ''), NULLIF(btrim(p_city), ''), NULLIF(btrim(p_state), ''), NULLIF(btrim(p_zip), ''));
    END IF;

    IF v_stored IS DISTINCT FROM v_id::text THEN
        IF p_slot = 0 THEN
            UPDATE public.profiles
            SET property_details = jsonb_set(coalesce(property_details, '{}'::jsonb), '{propertyRowId}', to_jsonb(v_id::text))
            WHERE id = p_owner_id;
        ELSE
            UPDATE public.profiles
            SET additional_properties = jsonb_set(additional_properties, ARRAY[(p_slot - 1)::text, 'id'], to_jsonb(v_id::text))
            WHERE id = p_owner_id;
        END IF;
    END IF;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_profile_property_row(UUID, INT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_profile_property_row(UUID, INT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.link_profile_property_row(UUID, INT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) IS
    'Stamps the id of its properties row on one profile property (creating the row when missing); per-owner lock; no-op when the entry changed since it was read.';

-- Removes a rental property in one transaction. Refuses (nothing changes) while a contract that is not
-- deleted, or an invoice, points to it: those are the owner's records and go first, in Contratos / Fatura.
-- What it removes: the deleted contracts (their charges, files, co-tenants, adjustments go with them), the
-- property's tenants, the gateways' link, and the row — the ledgers that belong to it (revenue months,
-- investment, taxes, valuations, condominium) by their ON DELETE CASCADE. Water and energy bills are kept
-- without a property, so their history can be linked again. A tenant still on another property's contract
-- makes the whole thing fail (foreign key), with nothing changed.
CREATE OR REPLACE FUNCTION public.delete_property_cascade(p_property_id UUID, p_owner_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    PERFORM 1 FROM public.properties WHERE id = p_property_id AND owner_id = p_owner_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT count(*) INTO v_count FROM public.leases WHERE property_id = p_property_id AND deleted_at IS NULL;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'property_has_leases' USING DETAIL = v_count::text;
    END IF;
    SELECT count(*) INTO v_count FROM public.invoices WHERE property_id = p_property_id;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'property_has_invoices' USING DETAIL = v_count::text;
    END IF;

    UPDATE public.gateways SET property_id = NULL WHERE property_id = p_property_id;
    DELETE FROM public.leases WHERE property_id = p_property_id;
    DELETE FROM public.tenants WHERE property_id = p_property_id;
    UPDATE public.water_bills SET property_id = NULL WHERE property_id = p_property_id;
    UPDATE public.energy_bills SET property_id = NULL WHERE property_id = p_property_id;
    DELETE FROM public.properties WHERE id = p_property_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_property_cascade(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_property_cascade(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.delete_property_cascade(UUID, UUID) IS
    'Deletes a rental property and what hangs off it in one transaction; refuses while contracts or invoices point to it. Bills are kept, unlinked.';
