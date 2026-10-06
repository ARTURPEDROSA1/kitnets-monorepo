-- Behaviour checks for migrations/20261006120000_property_row_links.sql (run by the db workflow after
-- every migration is applied; one rolled-back transaction).
BEGIN;

DO $$
DECLARE
    v_owner UUID; v_other UUID; v_multi UUID; v_house UUID; v_first UUID; v_again UUID; v_foreign UUID;
    v_tenant UUID; v_lease UUID; v_count INT; v_stored TEXT;
BEGIN
    -- the 2026-10-06 profile: the first property, a multi-unit SANTO ANTONIO with its id, and a new house
    -- named after the same bairro, without one
    INSERT INTO public.profiles (clerk_id) VALUES ('check_property_links_owner') RETURNING id INTO v_owner;
    INSERT INTO public.profiles (clerk_id) VALUES ('check_property_links_other') RETURNING id INTO v_other;
    INSERT INTO public.properties (owner_id, name, address) VALUES (v_owner, 'SANTO ANTONIO', 'RUA CLAUDIONOR IDELF BRAGA, 35 - SANTO ANTONIO') RETURNING id INTO v_multi;
    UPDATE public.profiles SET
        property_type = 'single',
        property_details = '{"propertyName": "VALE DO SOL"}',
        property_address = '{"street": "RUA ATLAS", "number": "50"}',
        additional_properties = jsonb_build_array(
            jsonb_build_object('id', v_multi::text, 'propertyType', 'multi', 'details', jsonb_build_object('propertyName', 'SANTO ANTONIO'), 'address', jsonb_build_object('street', 'RUA CLAUDIONOR IDELF BRAGA', 'number', '35')),
            jsonb_build_object('propertyType', 'single', 'details', jsonb_build_object('propertyName', 'SANTO ANTONIO'), 'address', jsonb_build_object('street', 'RUA JOSE GOIS', 'number', '45')))
    WHERE id = v_owner;

    v_house := public.link_profile_property_row(v_owner, 2, NULL, NULL, 'SANTO ANTONIO', 'RUA JOSE GOIS, 45 - SANTO ANTONIO', 'Itabirito', 'MG', NULL);
    IF v_house IS NULL OR v_house = v_multi THEN RAISE EXCEPTION 'FAIL: the house did not get a row of its own'; END IF;
    SELECT additional_properties -> 1 ->> 'id' INTO v_stored FROM public.profiles WHERE id = v_owner;
    IF v_stored IS DISTINCT FROM v_house::text THEN RAISE EXCEPTION 'FAIL: the house''s id was not stamped (%)', v_stored; END IF;
    SELECT count(*) INTO v_count FROM public.properties WHERE owner_id = v_owner AND name = 'SANTO ANTONIO';
    IF v_count <> 2 THEN RAISE EXCEPTION 'FAIL: % SANTO ANTONIO rows, expected 2', v_count; END IF;
    RAISE NOTICE 'ok: two properties of the same name get two rows, each stamped with its own';

    v_again := public.link_profile_property_row(v_owner, 2, v_house::text, v_house, 'SANTO ANTONIO', NULL, NULL, NULL, NULL);
    IF v_again IS DISTINCT FROM v_house THEN RAISE EXCEPTION 'FAIL: linking again changed the row'; END IF;
    SELECT count(*) INTO v_count FROM public.properties WHERE owner_id = v_owner;
    IF v_count <> 2 THEN RAISE EXCEPTION 'FAIL: linking again created a row'; END IF;
    RAISE NOTICE 'ok: linking twice is harmless';

    -- the first property keeps its id in property_details.propertyRowId
    v_first := public.link_profile_property_row(v_owner, 0, NULL, NULL, 'VALE DO SOL', 'RUA ATLAS, 50 -', NULL, NULL, NULL);
    SELECT property_details ->> 'propertyRowId' INTO v_stored FROM public.profiles WHERE id = v_owner;
    IF v_first IS NULL OR v_stored IS DISTINCT FROM v_first::text THEN RAISE EXCEPTION 'FAIL: the first property was not stamped'; END IF;
    PERFORM 1 FROM public.profiles WHERE id = v_owner AND property_details ->> 'propertyName' = 'VALE DO SOL';
    IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: stamping lost the property details'; END IF;
    RAISE NOTICE 'ok: the first property is stamped in property_details';

    -- the entry changed since it was read: nothing happens
    IF public.link_profile_property_row(v_owner, 1, NULL, NULL, 'SANTO ANTONIO', NULL, NULL, NULL, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL: an entry whose id changed since it was read was stamped';
    END IF;
    IF public.link_profile_property_row(v_owner, 2, v_house::text, v_house, 'OUTRO NOME', NULL, NULL, NULL, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL: an entry of another name was stamped';
    END IF;
    IF public.link_profile_property_row(v_owner, 7, NULL, NULL, 'SANTO ANTONIO', NULL, NULL, NULL, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL: a slot past the end was stamped';
    END IF;
    RAISE NOTICE 'ok: a stale call changes nothing';

    -- another owner's row is never linked
    INSERT INTO public.properties (owner_id, name) VALUES (v_other, 'ALHEIO') RETURNING id INTO v_foreign;
    UPDATE public.profiles SET additional_properties = additional_properties || jsonb_build_array(jsonb_build_object('details', jsonb_build_object('propertyName', 'ALHEIO'))) WHERE id = v_owner;
    BEGIN
        PERFORM public.link_profile_property_row(v_owner, 3, NULL, v_foreign, 'ALHEIO', NULL, NULL, NULL, NULL);
        RAISE EXCEPTION 'FAIL: another owner''s row was linked';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
        RAISE NOTICE 'ok: another owner''s row is refused';
    END;

    -- deleting: refused (and nothing touched) while a contract points to the property
    INSERT INTO public.tenants (user_id, full_name, cpf, property_id, management_type)
    VALUES (v_owner, 'Inquilino', '52998224725', v_multi, 'SELF_MANAGED') RETURNING id INTO v_tenant;
    INSERT INTO public.leases (user_id, property_id, primary_tenant_id, management_type, start_date, monthly_rent, rent_due_day)
    VALUES (v_owner, v_multi, v_tenant, 'SELF_MANAGED', '2025-01-06', 1300, 10) RETURNING id INTO v_lease;
    INSERT INTO public.lease_charges (lease_id, charge_type, responsibility, amount) VALUES (v_lease, 'CONDOMINIUM', 'TENANT', 250);
    INSERT INTO public.energy_bills (property_id, consumer_unit, reference_month, grid_consumption_kwh, total_amount)
    VALUES (v_multi, '3003077953', '2026-08', 100, 90);
    BEGIN
        PERFORM public.delete_property_cascade(v_multi, v_owner);
        RAISE EXCEPTION 'FAIL: a property with a contract was deleted';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
        IF SQLERRM <> 'property_has_leases' THEN RAISE EXCEPTION 'FAIL: unexpected refusal %', SQLERRM; END IF;
    END;
    PERFORM 1 FROM public.lease_charges WHERE lease_id = v_lease;
    IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: the refusal deleted the charges'; END IF;
    PERFORM 1 FROM public.energy_bills WHERE property_id = v_multi;
    IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: the refusal unlinked the bills'; END IF;
    RAISE NOTICE 'ok: a property with a contract is refused, nothing touched';

    BEGIN
        PERFORM public.delete_property_cascade(v_multi, v_other);
        RAISE EXCEPTION 'FAIL: another owner deleted the property';
    EXCEPTION WHEN no_data_found THEN
        RAISE NOTICE 'ok: only the owner deletes';
    END;

    -- the contract deleted (soft) first: the property goes, the bills stay without it
    UPDATE public.leases SET deleted_at = NOW() WHERE id = v_lease;
    PERFORM public.delete_property_cascade(v_multi, v_owner);
    PERFORM 1 FROM public.properties WHERE id = v_multi;
    IF FOUND THEN RAISE EXCEPTION 'FAIL: the property is still there'; END IF;
    PERFORM 1 FROM public.leases WHERE id = v_lease;
    IF FOUND THEN RAISE EXCEPTION 'FAIL: the deleted contract is still there'; END IF;
    PERFORM 1 FROM public.tenants WHERE id = v_tenant;
    IF FOUND THEN RAISE EXCEPTION 'FAIL: the property''s tenant is still there'; END IF;
    SELECT count(*) INTO v_count FROM public.energy_bills WHERE consumer_unit = '3003077953' AND property_id IS NULL;
    IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: the bills were not kept unlinked'; END IF;
    PERFORM 1 FROM public.properties WHERE id = v_house;
    IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: the other SANTO ANTONIO went too'; END IF;
    RAISE NOTICE 'ok: delete_property_cascade removes the property, keeps the bills, leaves the namesake alone';
END $$;

ROLLBACK;
