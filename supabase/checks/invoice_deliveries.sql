-- Behaviour checks for migrations/20261003100000_invoice_deliveries.sql (run by the db workflow after
-- every migration is applied; one rolled-back transaction).

BEGIN;

DO $$
DECLARE
    v_owner    UUID;
    v_other    UUID;
    v_property UUID;
    v_tenant   UUID;
    v_lease    UUID;
    v_invoice  UUID;
    v_delivery UUID;
    v_count    INTEGER;
    v_attempts INTEGER;
BEGIN
    INSERT INTO public.profiles (clerk_id) VALUES ('check_delivery_owner') RETURNING id INTO v_owner;
    INSERT INTO public.profiles (clerk_id) VALUES ('check_delivery_other') RETURNING id INTO v_other;
    INSERT INTO public.properties (name, owner_id) VALUES ('Casa', v_owner) RETURNING id INTO v_property;
    INSERT INTO public.tenants (user_id, full_name, cpf, property_id, management_type)
    VALUES (v_owner, 'Inquilino', '52998224725', v_property, 'SELF_MANAGED') RETURNING id INTO v_tenant;
    INSERT INTO public.leases (user_id, property_id, primary_tenant_id, management_type, start_date, monthly_rent, rent_due_day)
    VALUES (v_owner, v_property, v_tenant, 'SELF_MANAGED', '2026-01-01', 1200, 10) RETURNING id INTO v_lease;
    v_invoice := public.invoice_create(v_owner,
        jsonb_build_object('lease_id', v_lease, 'property_id', v_property, 'tenant_id', v_tenant, 'reference_month', '2026-10-01', 'due_date', '2026-10-10'),
        jsonb_build_array(jsonb_build_object('kind', 'RENT', 'description', 'Aluguel', 'amount', 1200)));

    -- 1. Service role only.
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.invoice_deliveries'::regclass) THEN
        RAISE EXCEPTION 'FAIL: RLS is off on invoice_deliveries';
    END IF;
    IF has_table_privilege('anon', 'public.invoice_deliveries', 'SELECT') OR has_table_privilege('authenticated', 'public.invoice_deliveries', 'SELECT') THEN
        RAISE EXCEPTION 'FAIL: invoice_deliveries is readable by a browser role';
    END IF;
    IF has_function_privilege('anon', 'public.invoice_delivery_claim(uuid, uuid)', 'EXECUTE') OR has_function_privilege('authenticated', 'public.invoice_delivery_claim(uuid, uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'FAIL: invoice_delivery_claim is callable by a browser role';
    END IF;
    RAISE NOTICE 'ok: deliveries are service-role only';

    -- 2. One e-mail of each kind and sequence per invoice.
    INSERT INTO public.invoice_deliveries (invoice_id, owner_id, kind, sequence, recipient)
    VALUES (v_invoice, v_owner, 'ISSUE', 0, 'ana@example.com') RETURNING id INTO v_delivery;
    BEGIN
        INSERT INTO public.invoice_deliveries (invoice_id, owner_id, kind, sequence, recipient) VALUES (v_invoice, v_owner, 'ISSUE', 0, 'ana@example.com');
        RAISE EXCEPTION 'FAIL: a second ISSUE e-mail was accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'ok: one e-mail per invoice, kind and sequence';
    END;
    INSERT INTO public.invoice_deliveries (invoice_id, owner_id, kind, sequence, recipient) VALUES (v_invoice, v_owner, 'RESEND', 1, 'ana@example.com');
    RAISE NOTICE 'ok: a resend is numbered beside the issue';

    -- 3. The claim: only one caller gets it, and only while it is to be sent.
    SELECT COUNT(*) INTO v_count FROM public.invoice_delivery_claim(v_owner, v_delivery);
    IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: a pending delivery was not claimed'; END IF;
    SELECT status, attempts INTO STRICT v_count, v_attempts FROM (SELECT CASE status WHEN 'SENDING' THEN 1 ELSE 0 END AS status, attempts FROM public.invoice_deliveries WHERE id = v_delivery) s;
    IF v_count <> 1 OR v_attempts <> 1 THEN RAISE EXCEPTION 'FAIL: the claim did not mark SENDING with one attempt'; END IF;
    SELECT COUNT(*) INTO v_count FROM public.invoice_delivery_claim(v_owner, v_delivery);
    IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: a delivery being sent was claimed again'; END IF;
    RAISE NOTICE 'ok: a claim is exclusive while fresh';

    -- 3b. A dead run's claim can be taken over; a sent delivery never.
    UPDATE public.invoice_deliveries SET locked_at = NOW() - INTERVAL '11 minutes' WHERE id = v_delivery;
    SELECT COUNT(*) INTO v_count FROM public.invoice_delivery_claim(v_owner, v_delivery);
    IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: a stale claim could not be taken over'; END IF;
    UPDATE public.invoice_deliveries SET status = 'SENT', sent_at = NOW(), provider_id = 'msg_1' WHERE id = v_delivery;
    SELECT COUNT(*) INTO v_count FROM public.invoice_delivery_claim(v_owner, v_delivery);
    IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: a sent delivery was claimed'; END IF;
    UPDATE public.invoice_deliveries SET status = 'FAILED', last_error = 'x' WHERE id = v_delivery;
    SELECT COUNT(*) INTO v_count FROM public.invoice_delivery_claim(v_owner, v_delivery);
    IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: a failed delivery could not be tried again'; END IF;
    RAISE NOTICE 'ok: stale and failed deliveries are tried again, sent ones never';

    -- 3c. Another owner cannot claim it.
    SELECT COUNT(*) INTO v_count FROM public.invoice_delivery_claim(v_other, v_delivery);
    IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: another owner claimed the delivery'; END IF;
    RAISE NOTICE 'ok: the claim is scoped to the owner';

    -- 4. Only the kinds and states the module knows; a recipient is required.
    BEGIN
        UPDATE public.invoice_deliveries SET status = 'MAYBE' WHERE id = v_delivery;
        RAISE EXCEPTION 'FAIL: junk accepted as a delivery status' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: the delivery status is constrained';
    END;
    BEGIN
        INSERT INTO public.invoice_deliveries (invoice_id, owner_id, kind, sequence, recipient) VALUES (v_invoice, v_owner, 'POSTCARD', 0, 'ana@example.com');
        RAISE EXCEPTION 'FAIL: junk accepted as a delivery kind' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: the delivery kind is constrained';
    END;

    -- 5. The deliveries go with their invoice.
    PERFORM public.invoice_cancel(v_owner, v_invoice, 'teste');
    DELETE FROM public.invoices WHERE id = v_invoice;
    SELECT COUNT(*) INTO v_count FROM public.invoice_deliveries WHERE invoice_id = v_invoice;
    IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: deliveries outlived their invoice'; END IF;
    RAISE NOTICE 'ok: deliveries go with their invoice';
END;
$$;

ROLLBACK;
