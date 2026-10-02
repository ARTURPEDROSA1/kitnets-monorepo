-- Behaviour checks for migrations/20261003000000_invoice_charges.sql (run by the db workflow after
-- every migration is applied; one rolled-back transaction).

BEGIN;

DO $$
DECLARE
    v_owner    UUID;
    v_property UUID;
    v_tenant   UUID;
    v_lease    UUID;
    v_invoice  UUID;
    v_charge   UUID;
    v_count    INTEGER;
BEGIN
    INSERT INTO public.profiles (clerk_id) VALUES ('check_charge_owner') RETURNING id INTO v_owner;
    INSERT INTO public.properties (name, owner_id) VALUES ('Casa', v_owner) RETURNING id INTO v_property;
    INSERT INTO public.tenants (user_id, full_name, cpf, property_id, management_type)
    VALUES (v_owner, 'Inquilino', '52998224725', v_property, 'SELF_MANAGED') RETURNING id INTO v_tenant;
    INSERT INTO public.leases (user_id, property_id, primary_tenant_id, management_type, start_date, monthly_rent, rent_due_day)
    VALUES (v_owner, v_property, v_tenant, 'SELF_MANAGED', '2026-01-01', 1200, 10) RETURNING id INTO v_lease;
    v_invoice := public.invoice_create(v_owner,
        jsonb_build_object('lease_id', v_lease, 'property_id', v_property, 'tenant_id', v_tenant, 'reference_month', '2026-10-01', 'due_date', '2026-10-10'),
        jsonb_build_array(jsonb_build_object('kind', 'RENT', 'description', 'Aluguel', 'amount', 1200)));

    -- 1. Service role only; the bucket is private.
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.invoice_charges'::regclass) THEN
        RAISE EXCEPTION 'FAIL: RLS is off on invoice_charges';
    END IF;
    IF has_table_privilege('anon', 'public.invoice_charges', 'SELECT') OR has_table_privilege('authenticated', 'public.invoice_charges', 'SELECT') THEN
        RAISE EXCEPTION 'FAIL: invoice_charges is readable by a browser role';
    END IF;
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'invoice-documents' AND public) THEN
        RAISE EXCEPTION 'FAIL: the invoice-documents bucket is public';
    END IF;
    RAISE NOTICE 'ok: charges are service-role only and the documents bucket is private';

    -- 2. One live boleto per invoice.
    INSERT INTO public.invoice_charges (invoice_id, owner_id, provider, kind, status, seu_numero, amount, due_date)
    VALUES (v_invoice, v_owner, 'INTER', 'BOLEPIX', 'REQUESTED', 'F1', 1200, '2026-10-10') RETURNING id INTO v_charge;
    BEGIN
        INSERT INTO public.invoice_charges (invoice_id, owner_id, provider, kind, status, seu_numero, amount, due_date)
        VALUES (v_invoice, v_owner, 'INTER', 'BOLEPIX', 'REQUESTED', 'F1-2', 1200, '2026-10-10');
        RAISE EXCEPTION 'FAIL: a second live boleto was accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'ok: one live boleto per invoice';
    END;
    UPDATE public.invoice_charges SET status = 'EXPIRED', provider_status = 'EXPIRADO' WHERE id = v_charge;
    INSERT INTO public.invoice_charges (invoice_id, owner_id, provider, kind, status, seu_numero, amount, due_date)
    VALUES (v_invoice, v_owner, 'INTER', 'BOLEPIX', 'REQUESTED', 'F1-2', 1200, '2026-10-20');
    RAISE NOTICE 'ok: an expired boleto can be followed by another';

    -- 3. The bank's reference leads to one charge.
    UPDATE public.invoice_charges SET provider_ref = '183e982a' WHERE seu_numero = 'F1-2';
    BEGIN
        UPDATE public.invoice_charges SET provider_ref = '183e982a' WHERE id = v_charge;
        RAISE EXCEPTION 'FAIL: two charges share the bank''s reference' USING ERRCODE = 'P0001';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'ok: a provider reference is unique';
    END;

    -- 4. Only the states, providers and kinds the module knows.
    BEGIN
        UPDATE public.invoice_charges SET status = 'MAYBE' WHERE id = v_charge;
        RAISE EXCEPTION 'FAIL: junk accepted as a charge status' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: the charge status is constrained';
    END;
    BEGIN
        INSERT INTO public.invoice_charges (invoice_id, owner_id, provider, kind, amount) VALUES (v_invoice, v_owner, 'INTER', 'BOLEPIX', 0);
        RAISE EXCEPTION 'FAIL: a charge of zero was accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: a charge asks for something';
    END;

    -- 5. The charges go with their invoice.
    PERFORM public.invoice_cancel(v_owner, v_invoice, 'teste');
    DELETE FROM public.invoices WHERE id = v_invoice;
    SELECT COUNT(*) INTO v_count FROM public.invoice_charges WHERE invoice_id = v_invoice;
    IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: charges outlived their invoice'; END IF;
    RAISE NOTICE 'ok: charges go with their invoice';
END;
$$;

ROLLBACK;
