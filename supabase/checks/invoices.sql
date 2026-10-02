-- Behaviour checks for migrations/20261002120000_invoices_core.sql (run by the db workflow after
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
    v_second   UUID;
    v_again    UUID;
    v_result   TEXT;
    v_row      public.invoices%ROWTYPE;
    v_count    INTEGER;
    v_table    TEXT;
    v_items    JSONB := jsonb_build_array(
        jsonb_build_object('kind', 'RENT', 'description', 'Aluguel', 'amount', 1000),
        jsonb_build_object('kind', 'CONDOMINIUM', 'description', 'Condomínio', 'amount', 150.5));
    v_head     JSONB;
BEGIN
    INSERT INTO public.profiles (clerk_id) VALUES ('check_invoice_owner') RETURNING id INTO v_owner;
    INSERT INTO public.profiles (clerk_id) VALUES ('check_invoice_other') RETURNING id INTO v_other;
    INSERT INTO public.properties (name, owner_id) VALUES ('Check', v_owner) RETURNING id INTO v_property;
    INSERT INTO public.tenants (user_id, full_name, cpf, property_id, management_type)
    VALUES (v_owner, 'Inquilino Check', '52998224725', v_property, 'SELF_MANAGED') RETURNING id INTO v_tenant;
    INSERT INTO public.leases (user_id, property_id, primary_tenant_id, management_type, start_date, monthly_rent, rent_due_day)
    VALUES (v_owner, v_property, v_tenant, 'SELF_MANAGED', '2026-01-01', 1000, 10) RETURNING id INTO v_lease;

    v_head := jsonb_build_object('lease_id', v_lease, 'property_id', v_property, 'tenant_id', v_tenant,
        'reference_month', '2026-10-01', 'due_date', '2026-10-10', 'blockers', jsonb_build_array('NO_EMAIL'));

    -- 1. Service role only: RLS on, nothing granted to the browser roles.
    FOREACH v_table IN ARRAY ARRAY['billing_settings', 'invoices', 'invoice_items', 'invoice_events'] LOOP
        IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_table)::regclass) THEN
            RAISE EXCEPTION 'FAIL: RLS is off on %', v_table;
        END IF;
        IF has_table_privilege('anon', 'public.' || v_table, 'SELECT') OR has_table_privilege('authenticated', 'public.' || v_table, 'SELECT') THEN
            RAISE EXCEPTION 'FAIL: % is readable by a browser role', v_table;
        END IF;
    END LOOP;
    RAISE NOTICE 'ok: tables are service-role only';

    -- 2. An invoice is created with its items; the amount is their sum; numbering is per owner.
    v_invoice := public.invoice_create(v_owner, v_head, v_items);
    SELECT * INTO v_row FROM public.invoices WHERE id = v_invoice;
    IF v_row.amount <> 1150.5 OR v_row.number <> 1 OR v_row.status <> 'DRAFT' OR v_row.blockers <> ARRAY['NO_EMAIL'] OR length(v_row.public_token) < 40 THEN
        RAISE EXCEPTION 'FAIL: invoice not created as expected (amount %, number %, status %)', v_row.amount, v_row.number, v_row.status;
    END IF;
    SELECT COUNT(*) INTO v_count FROM public.invoice_items WHERE invoice_id = v_invoice;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'FAIL: expected 2 items, got %', v_count;
    END IF;
    RAISE NOTICE 'ok: invoice created with items';

    -- 3. Generating the same lease and month again is a no-op.
    v_again := public.invoice_create(v_owner, v_head, v_items);
    IF v_again IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL: a second live invoice for the same lease and month was created';
    END IF;
    RAISE NOTICE 'ok: one live invoice per lease and month';

    -- 4. A cancelled invoice frees the month.
    UPDATE public.invoices SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = v_invoice;
    v_second := public.invoice_create(v_owner, v_head, v_items);
    SELECT * INTO v_row FROM public.invoices WHERE id = v_second;
    IF v_second IS NULL OR v_row.number <> 2 THEN
        RAISE EXCEPTION 'FAIL: the month was not freed by the cancellation (number %)', v_row.number;
    END IF;
    RAISE NOTICE 'ok: a cancelled invoice can be redone';

    -- 5. Another account cannot invoice this lease.
    BEGIN
        PERFORM public.invoice_create(v_other, v_head || jsonb_build_object('reference_month', '2026-11-01'), v_items);
        RAISE EXCEPTION 'FAIL: an invoice was created on another account''s lease' USING ERRCODE = 'P0001';
    EXCEPTION WHEN no_data_found THEN
        RAISE NOTICE 'ok: the lease must belong to the owner';
    END;

    -- 6. An invoice without items is refused.
    BEGIN
        PERFORM public.invoice_create(v_owner, v_head || jsonb_build_object('reference_month', '2026-11-01'), '[]'::jsonb);
        RAISE EXCEPTION 'FAIL: an invoice without items was created' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: no invoice without items';
    END;

    -- 7. Paying: once, the same payment again, then a different payment for the same invoice.
    v_result := public.invoice_mark_paid(v_owner, v_second, '2026-10-09', 1150.5, 'PIX', 0, 0, 'txid-1', 'INTER');
    IF v_result <> 'PAID' THEN RAISE EXCEPTION 'FAIL: first payment returned %', v_result; END IF;
    v_result := public.invoice_mark_paid(v_owner, v_second, '2026-10-09', 1150.5, 'PIX', 0, 0, 'txid-1', 'INTER');
    IF v_result <> 'ALREADY' THEN RAISE EXCEPTION 'FAIL: the same payment again returned %', v_result; END IF;
    v_result := public.invoice_mark_paid(v_owner, v_second, '2026-10-09', 1150.5, 'CARD', 0, 46.2, 'pi_2', 'STRIPE');
    IF v_result <> 'DUPLICATE' THEN RAISE EXCEPTION 'FAIL: a second payment returned %', v_result; END IF;
    SELECT * INTO v_row FROM public.invoices WHERE id = v_second;
    IF v_row.status <> 'PAID' OR v_row.paid_via <> 'PIX' OR v_row.paid_ref <> 'txid-1' THEN
        RAISE EXCEPTION 'FAIL: the duplicate payment overwrote the first one';
    END IF;
    SELECT COUNT(*) INTO v_count FROM public.invoice_events WHERE invoice_id = v_second AND type = 'DUPLICATE_PAYMENT';
    IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: the duplicate payment left no trace'; END IF;
    RAISE NOTICE 'ok: paid once, repeats recognised, duplicates recorded';

    -- 8. Money for a cancelled invoice is a duplicate too, never a silent revival.
    v_result := public.invoice_mark_paid(v_owner, v_invoice, '2026-10-09', 1150.5, 'BOLETO', 0, 0, 'nn-9', 'INTER');
    IF v_result <> 'DUPLICATE' OR (SELECT status FROM public.invoices WHERE id = v_invoice) <> 'CANCELLED' THEN
        RAISE EXCEPTION 'FAIL: a payment revived a cancelled invoice (%)', v_result;
    END IF;
    RAISE NOTICE 'ok: a cancelled invoice stays cancelled';

    -- 9. The automation cannot be switched on before the owner decides.
    BEGIN
        INSERT INTO public.billing_settings (owner_id, automation_enabled) VALUES (v_owner, true);
        RAISE EXCEPTION 'FAIL: automation switched on without the decisions' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: automation needs the owner''s decisions';
    END;
    INSERT INTO public.billing_settings (owner_id, days_in_advance, fine_pct, interest_pct_month, days_payable_after_due, automation_from_month, automation_enabled)
    VALUES (v_owner, 10, 2, 1, 30, '2026-10-01', true);

    -- 10. Who collects accepts only the three collectors.
    BEGIN
        UPDATE public.leases SET rent_collected_by = 'SOMEONE' WHERE id = v_lease;
        RAISE EXCEPTION 'FAIL: junk accepted in rent_collected_by' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: rent_collected_by is constrained';
    END;
    UPDATE public.leases SET rent_collected_by = 'OWNER' WHERE id = v_lease;
    INSERT INTO public.lease_charges (lease_id, charge_type, responsibility, amount, collected_by)
    VALUES (v_lease, 'CONDOMINIUM', 'TENANT', 150, 'THIRD_PARTY');

    -- 11. A utility can be part of the condominium fee.
    INSERT INTO public.lease_charges (lease_id, charge_type, responsibility) VALUES (v_lease, 'WATER', 'INCLUDED_IN_CONDO');
    BEGIN
        INSERT INTO public.lease_charges (lease_id, charge_type, responsibility) VALUES (v_lease, 'WATER', 'NOBODY');
        RAISE EXCEPTION 'FAIL: junk accepted in responsibility' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: responsibility takes the four answers only';
    END;
END;
$$;

ROLLBACK;
