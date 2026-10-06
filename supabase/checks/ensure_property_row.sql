-- Behaviour checks for migrations/20261005140000_ensure_property_row.sql (run by the db workflow after
-- every migration is applied; one rolled-back transaction).
BEGIN;

DO $$
DECLARE
    v_owner UUID; v_other UUID; v_first UUID; v_again UUID; v_uc UUID; v_count INT;
BEGIN
    INSERT INTO public.profiles (clerk_id) VALUES ('check_ensure_property_owner') RETURNING id INTO v_owner;
    INSERT INTO public.profiles (clerk_id) VALUES ('check_ensure_property_other') RETURNING id INTO v_other;

    v_first := public.ensure_property_row(v_owner, '  VILA JOSE LOPES ', 'RUA JOSE GOIS, 45 - VILA JOSE LOPES', 'Itabirito', 'MG', '35450-000');
    PERFORM 1 FROM public.properties WHERE id = v_first AND name = 'VILA JOSE LOPES' AND city = 'Itabirito';
    IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: the row was not created as asked'; END IF;
    RAISE NOTICE 'ok: a missing property gets its row';

    v_again := public.ensure_property_row(v_owner, 'vila jose lopes', NULL, NULL, NULL, NULL);
    IF v_again <> v_first THEN RAISE EXCEPTION 'FAIL: a second row was created for the same name'; END IF;
    SELECT count(*) INTO v_count FROM public.properties WHERE owner_id = v_owner;
    IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: % rows for one property', v_count; END IF;
    RAISE NOTICE 'ok: the same name (case and spaces aside) finds the existing row';

    -- a standalone consumer unit with the same name is an energy record, not the rental property
    INSERT INTO public.properties (owner_id, name, electronic_id) VALUES (v_owner, 'CASA DA PRAIA', '{"isStandaloneUc": true}') RETURNING id INTO v_uc;
    IF public.ensure_property_row(v_owner, 'CASA DA PRAIA', NULL, NULL, NULL, NULL) = v_uc THEN
        RAISE EXCEPTION 'FAIL: a standalone consumer unit stood for the rental property';
    END IF;
    RAISE NOTICE 'ok: a standalone consumer unit does not count';

    -- another owner's property of the same name is theirs
    IF public.ensure_property_row(v_other, 'VILA JOSE LOPES', NULL, NULL, NULL, NULL) = v_first THEN
        RAISE EXCEPTION 'FAIL: another owner got this owner''s row';
    END IF;
    RAISE NOTICE 'ok: rows are per owner';

    BEGIN
        PERFORM public.ensure_property_row(v_owner, '   ', NULL, NULL, NULL, NULL);
        RAISE EXCEPTION 'FAIL: a blank name was accepted';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
        RAISE NOTICE 'ok: a blank name is refused';
    END;
END $$;

ROLLBACK;
