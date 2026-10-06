-- Imóveis: the `properties` row of a property registered in the owner's profile JSON.
--
-- The Imóveis wizard saves a property in the profile JSON only; its `properties` row — what leases,
-- tenants, bills and ledgers point to — was created later, as a side effect of the energy loader, so a
-- new property was missing from Contratos and Inquilinos until the owner opened Energia. The API now
-- creates the row whenever it reads the account's properties (lib/property-rows-server.ts), from
-- several places at once: this function makes that safe. It takes a per-owner lock, looks for a rental
-- row with the same name (case and spaces aside; standalone consumer units do not count) and inserts
-- one only when there is none. Returns the row's id, found or created. Service role only.

CREATE OR REPLACE FUNCTION public.ensure_property_row(
    p_owner_id UUID,
    p_name     TEXT,
    p_address  TEXT,
    p_city     TEXT,
    p_state    TEXT,
    p_zip      TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_name TEXT := btrim(p_name);
BEGIN
    IF p_owner_id IS NULL OR v_name IS NULL OR v_name = '' THEN
        RAISE EXCEPTION 'ensure_property_row: owner and name are required';
    END IF;

    -- one owner at a time: two readers that both found the row missing never insert it twice
    PERFORM pg_advisory_xact_lock(hashtextextended('ensure_property_row:' || p_owner_id::text, 0));

    SELECT id INTO v_id
    FROM public.properties
    WHERE owner_id = p_owner_id
      AND lower(btrim(name)) = lower(v_name)
      AND (electronic_id IS NULL OR electronic_id !~ '"isStandaloneUc"\s*:\s*true')
    ORDER BY created_at
    LIMIT 1;
    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    INSERT INTO public.properties (owner_id, name, address, city, state, zip)
    VALUES (p_owner_id, v_name, NULLIF(btrim(p_address), ''), NULLIF(btrim(p_city), ''), NULLIF(btrim(p_state), ''), NULLIF(btrim(p_zip), ''))
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_property_row(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_property_row(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.ensure_property_row(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) IS 'The rental properties row of a profile property, found by name or created; per-owner lock, never a duplicate.';
