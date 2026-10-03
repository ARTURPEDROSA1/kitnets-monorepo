-- Behaviour checks for migrations/20261003400000_invoice_tracking.sql (run by the db workflow after
-- every migration is applied; one rolled-back transaction).

BEGIN;

DO $$
DECLARE
    v_owner    UUID;
    v_property UUID;
    v_tenant   UUID;
    v_lease    UUID;
    v_invoice  UUID;
    v_token    TEXT;
    v_count    INTEGER;
    v_first    BOOLEAN;
BEGIN
    INSERT INTO public.profiles (clerk_id) VALUES ('check_tracking_owner') RETURNING id INTO v_owner;
    INSERT INTO public.properties (name, owner_id) VALUES ('Casa', v_owner) RETURNING id INTO v_property;
    INSERT INTO public.tenants (user_id, full_name, cpf, property_id, management_type)
    VALUES (v_owner, 'Inquilino', '52998224725', v_property, 'SELF_MANAGED') RETURNING id INTO v_tenant;
    INSERT INTO public.leases (user_id, property_id, primary_tenant_id, management_type, start_date, monthly_rent, rent_due_day)
    VALUES (v_owner, v_property, v_tenant, 'SELF_MANAGED', '2026-01-01', 1200, 10) RETURNING id INTO v_lease;
    v_invoice := public.invoice_create(v_owner,
        jsonb_build_object('lease_id', v_lease, 'property_id', v_property, 'tenant_id', v_tenant, 'reference_month', '2026-10-01', 'due_date', '2026-10-10'),
        jsonb_build_array(jsonb_build_object('kind', 'RENT', 'description', 'Aluguel', 'amount', 1200)));
    SELECT public_token INTO v_token FROM public.invoices WHERE id = v_invoice;

    -- 1. Only the service role counts views.
    IF has_function_privilege('anon', 'public.invoice_record_view(text)', 'EXECUTE') OR has_function_privilege('authenticated', 'public.invoice_record_view(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'FAIL: invoice_record_view is callable by a browser role';
    END IF;
    RAISE NOTICE 'ok: views are counted by the service role only';

    -- 2. The first view is told apart; a second within half an hour is not counted.
    SELECT COUNT(*), bool_or(first_view) INTO v_count, v_first FROM public.invoice_record_view(v_token);
    IF v_count <> 1 OR NOT v_first THEN RAISE EXCEPTION 'FAIL: the first view was not recorded as the first'; END IF;
    SELECT COUNT(*) INTO v_count FROM public.invoice_record_view(v_token);
    IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: a view within half an hour was counted again'; END IF;
    SELECT view_count INTO v_count FROM public.invoices WHERE id = v_invoice;
    IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: view_count is % after one counted view', v_count; END IF;
    RAISE NOTICE 'ok: the first view is the first, and a reload is not another';

    -- 3. Later views count, and are not the first.
    UPDATE public.invoices SET last_viewed_at = NOW() - INTERVAL '31 minutes' WHERE id = v_invoice;
    SELECT COUNT(*), bool_or(first_view) INTO v_count, v_first FROM public.invoice_record_view(v_token);
    IF v_count <> 1 OR v_first THEN RAISE EXCEPTION 'FAIL: a later view was not counted, or was called the first'; END IF;
    SELECT view_count INTO v_count FROM public.invoices WHERE id = v_invoice AND first_viewed_at IS NOT NULL AND last_viewed_at > first_viewed_at - INTERVAL '1 second';
    IF v_count <> 2 THEN RAISE EXCEPTION 'FAIL: view_count is % after two counted views', v_count; END IF;
    RAISE NOTICE 'ok: later views count and keep the first date';

    -- 4. A token that leads nowhere counts nothing.
    SELECT COUNT(*) INTO v_count FROM public.invoice_record_view(repeat('0', 64));
    IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: an unknown token recorded a view'; END IF;
    RAISE NOTICE 'ok: an unknown token records nothing';

    -- 5. A delivery keeps what the provider reported; a bounce is a state of its own.
    INSERT INTO public.invoice_deliveries (invoice_id, owner_id, kind, sequence, recipient, status, provider_id, sent_at)
    VALUES (v_invoice, v_owner, 'ISSUE', 0, 'ana@example.com', 'SENT', 'msg_check_1', NOW());
    UPDATE public.invoice_deliveries SET delivered_at = NOW() WHERE provider_id = 'msg_check_1';
    UPDATE public.invoice_deliveries SET status = 'BOUNCED', bounced_at = NOW(), last_error = 'caixa inexistente' WHERE provider_id = 'msg_check_1';
    SELECT COUNT(*) INTO v_count FROM public.invoice_deliveries WHERE provider_id = 'msg_check_1' AND status = 'BOUNCED' AND delivered_at IS NOT NULL AND bounced_at IS NOT NULL;
    IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: the delivery did not keep the provider''s report'; END IF;
    SELECT COUNT(*) INTO v_count FROM public.invoice_delivery_claim(v_owner, (SELECT id FROM public.invoice_deliveries WHERE provider_id = 'msg_check_1'));
    IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: a bounced delivery was claimed for sending again'; END IF;
    RAISE NOTICE 'ok: delivered and bounced are kept; a bounced delivery is never sent again on its own';
END;
$$;

ROLLBACK;
