-- Behaviour checks for migrations/20261003700000_lease_adjustments.sql (run by the db workflow after
-- every migration is applied; one rolled-back transaction).
BEGIN;

DO $$
DECLARE
    v_owner UUID; v_property UUID; v_tenant UUID; v_lease UUID; v_id UUID;
    v_result TEXT; v_rent NUMERIC; v_condo NUMERIC; v_count INTEGER;
BEGIN
    INSERT INTO public.profiles (clerk_id) VALUES ('check_adjustment_owner') RETURNING id INTO v_owner;
    INSERT INTO public.properties (name, owner_id) VALUES ('Casa', v_owner) RETURNING id INTO v_property;
    INSERT INTO public.tenants (user_id, full_name, cpf, property_id, management_type)
    VALUES (v_owner, 'Inquilino', '52998224725', v_property, 'SELF_MANAGED') RETURNING id INTO v_tenant;
    INSERT INTO public.leases (user_id, property_id, primary_tenant_id, management_type, start_date, monthly_rent, rent_due_day)
    VALUES (v_owner, v_property, v_tenant, 'SELF_MANAGED', '2024-08-29', 1900, 10) RETURNING id INTO v_lease;
    INSERT INTO public.lease_charges (lease_id, charge_type, responsibility, amount) VALUES (v_lease, 'CONDOMINIUM', 'TENANT', 400);
    INSERT INTO public.lease_charges (lease_id, charge_type, responsibility, amount) VALUES (v_lease, 'IPTU', 'TENANT', 50);

    -- the daily calculation records a row and moves the lease's amounts
    v_result := public.lease_adjustments_record(v_lease,
        '[{"effective_date":"2025-08-29","source":"CALCULATED","index_code":"IVAR","index_pct":6.17,"index_factor":1.061677811864,"previous_rent":1900,"new_rent":2017.19,"previous_condo":400,"new_condo":424.67,"condo_factor":1.061677811864,"document_id":null,"notes":null}]'::jsonb,
        2017.19, 424.67, false);
    IF v_result <> 'OK' THEN RAISE EXCEPTION 'FAIL: first record returned %', v_result; END IF;
    SELECT monthly_rent INTO v_rent FROM public.leases WHERE id = v_lease;
    SELECT amount INTO v_condo FROM public.lease_charges WHERE lease_id = v_lease AND charge_type = 'CONDOMINIUM';
    IF v_rent <> 2017.19 OR v_condo <> 424.67 THEN RAISE EXCEPTION 'FAIL: amounts not moved (% / %)', v_rent, v_condo; END IF;
    SELECT amount INTO v_condo FROM public.lease_charges WHERE lease_id = v_lease AND charge_type = 'IPTU';
    IF v_condo <> 50 THEN RAISE EXCEPTION 'FAIL: another charge was touched (%)', v_condo; END IF;
    RAISE NOTICE 'ok: a calculated adjustment is recorded and moves rent and condominium only';

    -- a second reader that calculated from the old state changes nothing
    v_result := public.lease_adjustments_record(v_lease,
        '[{"effective_date":"2025-08-29","source":"CALCULATED","index_code":"IVAR","index_pct":6.17,"index_factor":1.061677811864,"previous_rent":2017.19,"new_rent":2141.61,"previous_condo":424.67,"new_condo":450.86,"condo_factor":1.061677811864,"document_id":null,"notes":null}]'::jsonb,
        2141.61, 450.86, false);
    IF v_result <> 'STALE' THEN RAISE EXCEPTION 'FAIL: a repeated date returned %', v_result; END IF;
    SELECT monthly_rent INTO v_rent FROM public.leases WHERE id = v_lease;
    SELECT count(*) INTO v_count FROM public.lease_adjustments WHERE lease_id = v_lease;
    IF v_rent <> 2017.19 OR v_count <> 1 THEN RAISE EXCEPTION 'FAIL: the stale write went through (rent %, rows %)', v_rent, v_count; END IF;
    RAISE NOTICE 'ok: the same adjustment is never applied twice';

    -- an addendum takes the place of the calculated row of its date; a NULL condominium leaves the charge alone
    v_result := public.lease_adjustments_record(v_lease,
        '[{"effective_date":"2025-08-29","source":"ADDENDUM","index_code":null,"index_pct":null,"index_factor":null,"previous_rent":1900,"new_rent":1950,"previous_condo":400,"new_condo":null,"condo_factor":null,"document_id":null,"notes":"Negociado"}]'::jsonb,
        1950, NULL, true);
    IF v_result <> 'OK' THEN RAISE EXCEPTION 'FAIL: the addendum returned %', v_result; END IF;
    SELECT monthly_rent INTO v_rent FROM public.leases WHERE id = v_lease;
    SELECT amount INTO v_condo FROM public.lease_charges WHERE lease_id = v_lease AND charge_type = 'CONDOMINIUM';
    SELECT count(*) INTO v_count FROM public.lease_adjustments WHERE lease_id = v_lease AND source = 'ADDENDUM' AND new_rent = 1950;
    IF v_rent <> 1950 OR v_condo <> 424.67 OR v_count <> 1 THEN RAISE EXCEPTION 'FAIL: addendum not applied (rent %, condo %, rows %)', v_rent, v_condo, v_count; END IF;
    RAISE NOTICE 'ok: an addendum replaces the calculated row of its date';

    -- the rows of a replace are the whole history: a date left out goes away
    v_result := public.lease_adjustments_record(v_lease,
        '[{"effective_date":"2025-09-01","source":"ADDENDUM","index_code":null,"index_pct":null,"index_factor":null,"previous_rent":1900,"new_rent":1950,"previous_condo":400,"new_condo":null,"condo_factor":null,"document_id":null,"notes":null}]'::jsonb,
        1950, NULL, true);
    SELECT count(*) INTO v_count FROM public.lease_adjustments WHERE lease_id = v_lease;
    IF v_result <> 'OK' OR v_count <> 1 THEN RAISE EXCEPTION 'FAIL: replace kept a row it was not given (%, % rows)', v_result, v_count; END IF;
    UPDATE public.lease_adjustments SET effective_date = '2025-08-29' WHERE lease_id = v_lease;
    RAISE NOTICE 'ok: a replace removes the dates it leaves out';

    -- only the latest addendum can be removed, and the amounts go back
    v_result := public.lease_adjustments_record(v_lease,
        '[{"effective_date":"2026-08-29","source":"CALCULATED","index_code":"IVAR","index_pct":1,"index_factor":1.01,"previous_rent":1950,"new_rent":1969.5,"previous_condo":null,"new_condo":null,"condo_factor":null,"document_id":null,"notes":null}]'::jsonb,
        1969.5, NULL, false);
    SELECT id INTO v_id FROM public.lease_adjustments WHERE lease_id = v_lease AND effective_date = '2025-08-29';
    v_result := public.lease_adjustment_remove(v_lease, v_id);
    IF v_result <> 'NOT_LATEST' THEN RAISE EXCEPTION 'FAIL: removing a middle row returned %', v_result; END IF;
    SELECT id INTO v_id FROM public.lease_adjustments WHERE lease_id = v_lease AND effective_date = '2026-08-29';
    v_result := public.lease_adjustment_remove(v_lease, v_id);
    IF v_result <> 'NOT_ADDENDUM' THEN RAISE EXCEPTION 'FAIL: removing a calculated row returned %', v_result; END IF;
    DELETE FROM public.lease_adjustments WHERE id = v_id;
    SELECT id INTO v_id FROM public.lease_adjustments WHERE lease_id = v_lease AND effective_date = '2025-08-29';
    v_result := public.lease_adjustment_remove(v_lease, v_id);
    SELECT monthly_rent INTO v_rent FROM public.leases WHERE id = v_lease;
    IF v_result <> 'OK' OR v_rent <> 1900 THEN RAISE EXCEPTION 'FAIL: removal returned % with rent %', v_result, v_rent; END IF;
    RAISE NOTICE 'ok: only the latest addendum is removed, and the rent goes back';

    -- the table is the API''s alone
    IF has_table_privilege('authenticated', 'public.lease_adjustments', 'SELECT') OR has_table_privilege('anon', 'public.lease_adjustments', 'SELECT') THEN
        RAISE EXCEPTION 'FAIL: lease_adjustments is readable outside the service role';
    END IF;
    IF has_function_privilege('authenticated', 'public.lease_adjustments_record(uuid, jsonb, numeric, numeric, boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'FAIL: lease_adjustments_record is callable outside the service role';
    END IF;
    RAISE NOTICE 'ok: service role only';
END;
$$;

ROLLBACK;
