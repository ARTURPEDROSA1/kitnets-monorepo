-- Behaviour checks for migrations/20261005120000_lease_notice.sql (run by the db workflow after every
-- migration is applied; one rolled-back transaction).
BEGIN;

DO $$
DECLARE
    v_owner UUID; v_property UUID; v_tenant UUID; v_lease UUID; v_status TEXT;
BEGIN
    INSERT INTO public.profiles (clerk_id) VALUES ('check_lease_notice_owner') RETURNING id INTO v_owner;
    INSERT INTO public.properties (name, owner_id) VALUES ('Kitnets', v_owner) RETURNING id INTO v_property;
    INSERT INTO public.tenants (user_id, full_name, cpf, property_id, management_type)
    VALUES (v_owner, 'Inquilino', '52998224725', v_property, 'SELF_MANAGED') RETURNING id INTO v_tenant;

    -- a lease in force with a move-out day ahead and the day the tenant gave notice
    INSERT INTO public.leases (user_id, property_id, primary_tenant_id, management_type, start_date, end_date, monthly_rent, rent_due_day, status, termination_date, notice_date)
    VALUES (v_owner, v_property, v_tenant, 'SELF_MANAGED', '2025-09-15', '2028-03-15', 1324.31, 10, 'ACTIVE', CURRENT_DATE + 30, CURRENT_DATE)
    RETURNING id INTO v_lease;
    SELECT status INTO v_status FROM public.leases WHERE id = v_lease;
    IF v_status <> 'ACTIVE' THEN RAISE EXCEPTION 'FAIL: a notice is a lease in force (%)', v_status; END IF;
    RAISE NOTICE 'ok: a lease in force keeps its planned move-out and the notice date';

    -- the notice and the closing term are kinds of file
    INSERT INTO public.lease_documents (lease_id, document_type, file_name, file_url) VALUES (v_lease, 'NOTICE', 'aviso.pdf', 'x/aviso.pdf');
    INSERT INTO public.lease_documents (lease_id, document_type, file_name, file_url) VALUES (v_lease, 'TERMINATION', 'termo.pdf', 'x/termo.pdf');
    BEGIN
        INSERT INTO public.lease_documents (lease_id, document_type, file_name, file_url) VALUES (v_lease, 'WHATEVER', 'x.pdf', 'x/x.pdf');
        RAISE EXCEPTION 'FAIL: an unknown document type was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: NOTICE and TERMINATION files are accepted, other kinds are not';
    END;

    -- a notice dated back past an anniversary: the calculated adjustment from then goes, the amounts go back
    INSERT INTO public.lease_charges (lease_id, charge_type, responsibility, amount) VALUES (v_lease, 'CONDOMINIUM', 'TENANT', 262.76);
    PERFORM public.lease_adjustments_record(v_lease,
        '[{"effective_date":"2026-09-15","source":"CALCULATED","index_code":"IVAR","index_pct":5,"index_factor":1.05,"previous_rent":1324.31,"new_rent":1390.53,"previous_condo":262.76,"new_condo":275.90,"condo_factor":1.05,"charge_type":"CONDOMINIUM","document_id":null,"notes":null}]'::jsonb,
        1390.53, 275.90, false);
    IF public.lease_adjustments_drop_from(v_lease, '2026-09-10') <> 1 THEN RAISE EXCEPTION 'FAIL: the adjustment after the notice was not dropped'; END IF;
    PERFORM 1 FROM public.leases WHERE id = v_lease AND monthly_rent = 1324.31;
    IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: the rent did not go back'; END IF;
    PERFORM 1 FROM public.lease_charges WHERE lease_id = v_lease AND charge_type = 'CONDOMINIUM' AND amount = 262.76;
    IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: the condominium did not go back'; END IF;
    RAISE NOTICE 'ok: no adjustment from the notice date on';

    -- an addendum after the notice is an agreement: nothing is removed
    PERFORM public.lease_adjustments_record(v_lease,
        '[{"effective_date":"2026-09-15","source":"ADDENDUM","index_code":null,"index_pct":null,"index_factor":null,"previous_rent":1324.31,"new_rent":1350,"previous_condo":262.76,"new_condo":null,"condo_factor":null,"charge_type":"CONDOMINIUM","document_id":null,"notes":"Acordo"}]'::jsonb,
        1350, NULL, true);
    IF public.lease_adjustments_drop_from(v_lease, '2026-09-10') <> 0 THEN RAISE EXCEPTION 'FAIL: an addendum was dropped'; END IF;
    RAISE NOTICE 'ok: an addendum after the notice stays';
END;
$$;

ROLLBACK;
