-- Behaviour checks for migrations/20261003200000_card_checkout.sql (run by the db workflow after
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
    v_card     UUID;
    v_result   TEXT;
    v_count    INTEGER;
BEGIN
    INSERT INTO public.profiles (clerk_id) VALUES ('check_card_owner') RETURNING id INTO v_owner;
    INSERT INTO public.profiles (clerk_id) VALUES ('check_card_other') RETURNING id INTO v_other;
    INSERT INTO public.properties (name, owner_id) VALUES ('Casa', v_owner) RETURNING id INTO v_property;
    INSERT INTO public.tenants (user_id, full_name, cpf, property_id, management_type)
    VALUES (v_owner, 'Inquilino', '52998224725', v_property, 'SELF_MANAGED') RETURNING id INTO v_tenant;
    INSERT INTO public.leases (user_id, property_id, primary_tenant_id, management_type, start_date, monthly_rent, rent_due_day)
    VALUES (v_owner, v_property, v_tenant, 'SELF_MANAGED', '2026-01-01', 1200, 10) RETURNING id INTO v_lease;
    v_invoice := public.invoice_create(v_owner,
        jsonb_build_object('lease_id', v_lease, 'property_id', v_property, 'tenant_id', v_tenant, 'reference_month', '2026-10-01', 'due_date', '2026-10-10'),
        jsonb_build_array(jsonb_build_object('kind', 'RENT', 'description', 'Aluguel', 'amount', 1200)));

    -- 1. A boleto and a card session live side by side; two card sessions do not.
    INSERT INTO public.invoice_charges (invoice_id, owner_id, provider, kind, status, seu_numero, amount, due_date)
    VALUES (v_invoice, v_owner, 'INTER', 'BOLEPIX', 'OPEN', 'F1', 1200, '2026-10-10');
    INSERT INTO public.invoice_charges (invoice_id, owner_id, provider, kind, status, provider_ref, amount, net_amount, surcharge_amount, checkout_url, expires_at)
    VALUES (v_invoice, v_owner, 'STRIPE', 'CARD_CHECKOUT', 'OPEN', 'cs_test_1', 1250.27, 1200, 50.27, 'https://checkout.stripe.com/c/pay/cs_test_1', NOW() + INTERVAL '1 hour') RETURNING id INTO v_card;
    RAISE NOTICE 'ok: a boleto and a card session live side by side';
    BEGIN
        INSERT INTO public.invoice_charges (invoice_id, owner_id, provider, kind, status, amount)
        VALUES (v_invoice, v_owner, 'STRIPE', 'CARD_CHECKOUT', 'REQUESTED', 1250.27);
        RAISE EXCEPTION 'FAIL: a second live card session was accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'ok: one live card session per invoice';
    END;
    UPDATE public.invoice_charges SET status = 'EXPIRED', checkout_url = NULL WHERE id = v_card;
    INSERT INTO public.invoice_charges (invoice_id, owner_id, provider, kind, status, provider_ref, amount, net_amount, surcharge_amount)
    VALUES (v_invoice, v_owner, 'STRIPE', 'CARD_CHECKOUT', 'OPEN', 'cs_test_2', 1250.27, 1200, 50.27) RETURNING id INTO v_card;
    RAISE NOTICE 'ok: an expired session can be followed by another';

    -- 2. A card payment settles the invoice as CARD with the surcharge apart, and the ledger follows.
    v_result := public.invoice_mark_paid(v_owner, v_invoice, '2026-10-09', 1200, 'CARD', 0, 50.27, 'pi_test_1', 'STRIPE');
    IF v_result <> 'PAID' THEN RAISE EXCEPTION 'FAIL: card payment did not settle the invoice (%)', v_result; END IF;
    SELECT COUNT(*) INTO v_count FROM public.invoices WHERE id = v_invoice AND status = 'PAID' AND paid_via = 'CARD' AND paid_amount = 1200 AND surcharge_amount = 50.27 AND late_fee_amount = 0;
    IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: the card payment was not recorded as expected'; END IF;
    SELECT COUNT(*) INTO v_count FROM public.property_income_months WHERE property_id = v_property AND direct_rent = 1200;
    IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: the ledger does not carry the rent paid by card'; END IF;
    RAISE NOTICE 'ok: a card payment settles the invoice with the surcharge apart; the ledger carries the rent, never the fee';

    -- 3. A second payment is a duplicate, never a second settlement.
    v_result := public.invoice_mark_paid(v_owner, v_invoice, '2026-10-09', 1200, 'PIX', 0, 0, 'txid', 'INTER');
    IF v_result <> 'DUPLICATE' THEN RAISE EXCEPTION 'FAIL: a second payment was not flagged (%)', v_result; END IF;
    RAISE NOTICE 'ok: paying by card and then by Pix is a duplicate';

    -- 4. Another owner cannot see or touch the session (service role only; scoped by owner in the API).
    IF has_table_privilege('anon', 'public.invoice_charges', 'UPDATE') OR has_table_privilege('authenticated', 'public.invoice_charges', 'UPDATE') THEN
        RAISE EXCEPTION 'FAIL: invoice_charges is writable by a browser role';
    END IF;
    SELECT COUNT(*) INTO v_count FROM public.invoice_charges WHERE id = v_card AND owner_id = v_other;
    IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: the card session belongs to the wrong owner'; END IF;
    RAISE NOTICE 'ok: sessions are service-role only and owned';

    -- 5. The Stripe connection: one account per platform, never two owners.
    INSERT INTO public.billing_connections (owner_id, provider, status, environment, external_account_id, metadata)
    VALUES (v_owner, 'STRIPE', 'CONNECTED', 'PRODUCTION', 'acct_check_1', '{"charges_enabled": true}'::jsonb);
    BEGIN
        INSERT INTO public.billing_connections (owner_id, provider, status, environment, external_account_id, metadata)
        VALUES (v_other, 'STRIPE', 'CONNECTED', 'PRODUCTION', 'acct_check_1', '{}'::jsonb);
        RAISE EXCEPTION 'FAIL: the same Stripe account was connected to two owners' USING ERRCODE = 'P0001';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'ok: a Stripe account connects to one owner';
    END;
END;
$$;

ROLLBACK;
