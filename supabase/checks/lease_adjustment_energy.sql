-- Behaviour checks for migrations/20261004200000_lease_adjustment_energy.sql (run by the db workflow after
-- every migration is applied; one rolled-back transaction).
BEGIN;

DO $$
DECLARE
    v_owner UUID; v_property UUID; v_tenant UUID; v_lease UUID; v_id UUID;
    v_result TEXT; v_rent NUMERIC; v_energy NUMERIC; v_type TEXT;
BEGIN
    INSERT INTO public.profiles (clerk_id) VALUES ('check_adjustment_energy_owner') RETURNING id INTO v_owner;
    INSERT INTO public.properties (name, owner_id) VALUES ('Casa de rua', v_owner) RETURNING id INTO v_property;
    INSERT INTO public.tenants (user_id, full_name, cpf, property_id, management_type)
    VALUES (v_owner, 'Inquilino', '52998224725', v_property, 'SELF_MANAGED') RETURNING id INTO v_tenant;
    INSERT INTO public.leases (user_id, property_id, primary_tenant_id, management_type, start_date, monthly_rent, rent_due_day)
    VALUES (v_owner, v_property, v_tenant, 'SELF_MANAGED', '2025-12-10', 4000, 10) RETURNING id INTO v_lease;
    INSERT INTO public.lease_charges (lease_id, charge_type, responsibility, amount) VALUES (v_lease, 'ELECTRICITY', 'TENANT', 350);
    INSERT INTO public.lease_charges (lease_id, charge_type, responsibility, amount) VALUES (v_lease, 'WATER', 'TENANT', 80);

    -- a house without a condominium: the calculated row carries the energy and moves it
    v_result := public.lease_adjustments_record(v_lease,
        '[{"effective_date":"2026-12-10","source":"CALCULATED","index_code":"IPCA","index_pct":4.5,"index_factor":1.045,"previous_rent":4000,"new_rent":4180,"previous_condo":350,"new_condo":365.75,"condo_factor":1.045,"charge_type":"ELECTRICITY","document_id":null,"notes":null}]'::jsonb,
        4180, 365.75, false);
    IF v_result <> 'OK' THEN RAISE EXCEPTION 'FAIL: record returned %', v_result; END IF;
    SELECT monthly_rent INTO v_rent FROM public.leases WHERE id = v_lease;
    SELECT amount INTO v_energy FROM public.lease_charges WHERE lease_id = v_lease AND charge_type = 'ELECTRICITY';
    SELECT charge_type INTO v_type FROM public.lease_adjustments WHERE lease_id = v_lease;
    IF v_rent <> 4180 OR v_energy <> 365.75 OR v_type <> 'ELECTRICITY' THEN
        RAISE EXCEPTION 'FAIL: energy not moved (rent %, energy %, type %)', v_rent, v_energy, v_type;
    END IF;
    SELECT amount INTO v_energy FROM public.lease_charges WHERE lease_id = v_lease AND charge_type = 'WATER';
    IF v_energy <> 80 THEN RAISE EXCEPTION 'FAIL: another charge was touched (%)', v_energy; END IF;
    RAISE NOTICE 'ok: a house''s calculated adjustment moves rent and energy only';

    -- an addendum on the energy, then its removal puts the energy back
    DELETE FROM public.lease_adjustments WHERE lease_id = v_lease;
    UPDATE public.lease_charges SET amount = 350 WHERE lease_id = v_lease AND charge_type = 'ELECTRICITY';
    v_result := public.lease_adjustments_record(v_lease,
        '[{"effective_date":"2026-12-10","source":"ADDENDUM","index_code":null,"index_pct":null,"index_factor":null,"previous_rent":4000,"new_rent":4100,"previous_condo":350,"new_condo":360,"condo_factor":null,"charge_type":"ELECTRICITY","document_id":null,"notes":"Negociado"}]'::jsonb,
        4100, 360, true);
    SELECT amount INTO v_energy FROM public.lease_charges WHERE lease_id = v_lease AND charge_type = 'ELECTRICITY';
    IF v_result <> 'OK' OR v_energy <> 360 THEN RAISE EXCEPTION 'FAIL: addendum on the energy returned % (energy %)', v_result, v_energy; END IF;
    SELECT id INTO v_id FROM public.lease_adjustments WHERE lease_id = v_lease;
    v_result := public.lease_adjustment_remove(v_lease, v_id);
    SELECT amount INTO v_energy FROM public.lease_charges WHERE lease_id = v_lease AND charge_type = 'ELECTRICITY';
    SELECT monthly_rent INTO v_rent FROM public.leases WHERE id = v_lease;
    IF v_result <> 'OK' OR v_energy <> 350 OR v_rent <> 4000 THEN RAISE EXCEPTION 'FAIL: removal returned % (energy %, rent %)', v_result, v_energy, v_rent; END IF;
    RAISE NOTICE 'ok: removing an addendum puts the energy back';

    -- a row that names no charge (written before this migration) is the condominium: the energy stays
    INSERT INTO public.lease_charges (lease_id, charge_type, responsibility, amount) VALUES (v_lease, 'CONDOMINIUM', 'TENANT', 500);
    v_result := public.lease_adjustments_record(v_lease,
        '[{"effective_date":"2026-12-10","source":"CALCULATED","index_code":"IPCA","index_pct":4.5,"index_factor":1.045,"previous_rent":4000,"new_rent":4180,"previous_condo":500,"new_condo":522.5,"condo_factor":1.045,"document_id":null,"notes":null}]'::jsonb,
        4180, 522.5, false);
    SELECT amount INTO v_energy FROM public.lease_charges WHERE lease_id = v_lease AND charge_type = 'ELECTRICITY';
    SELECT amount INTO v_rent FROM public.lease_charges WHERE lease_id = v_lease AND charge_type = 'CONDOMINIUM';
    IF v_result <> 'OK' OR v_energy <> 350 OR v_rent <> 522.5 THEN RAISE EXCEPTION 'FAIL: unnamed charge (energy %, condominium %)', v_energy, v_rent; END IF;
    RAISE NOTICE 'ok: a row without charge_type moves the condominium, as before';

    -- only the two charges are accepted
    BEGIN
        UPDATE public.lease_adjustments SET charge_type = 'WATER' WHERE lease_id = v_lease;
        RAISE EXCEPTION 'FAIL: charge_type accepted WATER';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: charge_type is CONDOMINIUM or ELECTRICITY';
    END;
END;
$$;

ROLLBACK;
