-- Behaviour checks for migrations/20261002200000_invoice_ledger.sql (run by the db workflow after
-- every migration is applied; one rolled-back transaction).

BEGIN;

DO $$
DECLARE
    v_owner    UUID;
    v_other    UUID;
    v_house    UUID;   -- a self-managed house: rent and charges by invoice
    v_kitnets  UUID;   -- a multi-unit property: the agency collects the rent, the owner the condominium
    v_tenant   UUID;
    v_tenant_b UUID;
    v_lease    UUID;
    v_lease_b  UUID;
    v_invoice  UUID;
    v_next     UUID;
    v_result   TEXT;
    v_count    INTEGER;
    v_row      public.property_income_months%ROWTYPE;
BEGIN
    INSERT INTO public.profiles (clerk_id) VALUES ('check_ledger_owner') RETURNING id INTO v_owner;
    INSERT INTO public.profiles (clerk_id) VALUES ('check_ledger_other') RETURNING id INTO v_other;
    INSERT INTO public.properties (name, owner_id) VALUES ('Casa', v_owner) RETURNING id INTO v_house;
    INSERT INTO public.properties (name, owner_id) VALUES ('Kitnets', v_owner) RETURNING id INTO v_kitnets;
    INSERT INTO public.tenants (user_id, full_name, cpf, property_id, management_type)
    VALUES (v_owner, 'Inquilino Casa', '52998224725', v_house, 'SELF_MANAGED') RETURNING id INTO v_tenant;
    INSERT INTO public.tenants (user_id, full_name, cpf, property_id, management_type)
    VALUES (v_owner, 'Inquilino 35C', '11144477735', v_kitnets, 'AGENCY') RETURNING id INTO v_tenant_b;
    INSERT INTO public.leases (user_id, property_id, primary_tenant_id, management_type, start_date, monthly_rent, rent_due_day)
    VALUES (v_owner, v_house, v_tenant, 'SELF_MANAGED', '2026-01-01', 1200, 10) RETURNING id INTO v_lease;
    INSERT INTO public.leases (user_id, property_id, unit_id, unit_name, primary_tenant_id, management_type, start_date, monthly_rent, rent_due_day)
    VALUES (v_owner, v_kitnets, 'u35c', 'Kitnet 35C', v_tenant_b, 'AGENCY', '2026-01-01', 1000, 20) RETURNING id INTO v_lease_b;

    -- 1. An invoice announces itself in the ledger: an expected month, made by the invoice.
    v_invoice := public.invoice_create(v_owner,
        jsonb_build_object('lease_id', v_lease, 'property_id', v_house, 'tenant_id', v_tenant, 'reference_month', '2026-10-01', 'due_date', '2026-10-10'),
        jsonb_build_array(
            jsonb_build_object('kind', 'RENT', 'description', 'Aluguel', 'amount', 1200),
            jsonb_build_object('kind', 'CONDOMINIUM', 'description', 'Condomínio', 'amount', 150),
            jsonb_build_object('kind', 'IPTU', 'description', 'IPTU', 'amount', 80),
            jsonb_build_object('kind', 'INTERNET', 'description', 'Internet', 'amount', 20),
            jsonb_build_object('kind', 'ELECTRICITY', 'description', 'Energia elétrica', 'amount', 60)));
    SELECT * INTO v_row FROM public.property_income_months WHERE property_id = v_house AND month = '2026-10-01' AND unit_id IS NULL;
    IF NOT FOUND OR v_row.status <> 'EXPECTED' OR v_row.source <> 'INVOICE' OR NOT v_row.condo_direct OR v_row.condo_amount <> 150
       OR v_row.received_amount <> 0 OR v_row.direct_rent + v_row.direct_condo + v_row.direct_energy + v_row.direct_other <> 0 THEN
        RAISE EXCEPTION 'FAIL: the open invoice did not leave an expected, empty month in the ledger';
    END IF;
    RAISE NOTICE 'ok: an open invoice is an expected month';

    -- 2. Paid: each item lands in its column; the late fee stays out; the month is confirmed on the payment date.
    v_result := public.invoice_mark_paid(v_owner, v_invoice, '2026-10-12', 1540, 'MANUAL', 30, 0, NULL, 'OWNER');
    SELECT * INTO v_row FROM public.property_income_months WHERE property_id = v_house AND month = '2026-10-01' AND unit_id IS NULL;
    IF v_result <> 'PAID' OR v_row.direct_rent <> 1200 OR v_row.direct_condo <> 150 OR v_row.direct_energy <> 60 OR v_row.direct_other <> 100
       OR v_row.received_amount <> 0 OR v_row.status <> 'CONFIRMED' OR v_row.received_on <> '2026-10-12' THEN
        RAISE EXCEPTION 'FAIL: the paid invoice did not reach the ledger (rent %, condo %, energy %, other %, status %)',
            v_row.direct_rent, v_row.direct_condo, v_row.direct_energy, v_row.direct_other, v_row.status;
    END IF;
    RAISE NOTICE 'ok: a paid invoice lands item by item, without the late fee';

    -- 3. The sync recomputes, it does not add: running it again changes nothing.
    PERFORM public.invoice_sync_ledger(v_owner, v_house, '2026-10-01', NULL);
    PERFORM public.invoice_sync_property(v_owner, v_house);
    SELECT * INTO v_row FROM public.property_income_months WHERE property_id = v_house AND month = '2026-10-01' AND unit_id IS NULL;
    IF v_row.direct_rent <> 1200 OR v_row.direct_other <> 100 THEN
        RAISE EXCEPTION 'FAIL: the sync is not idempotent (rent %, other %)', v_row.direct_rent, v_row.direct_other;
    END IF;
    RAISE NOTICE 'ok: the sync is idempotent';

    -- 4. A paid invoice cannot be cancelled, and its money stays in the ledger.
    v_result := public.invoice_cancel(v_owner, v_invoice, 'engano');
    IF v_result <> 'PAID' OR (SELECT direct_rent FROM public.property_income_months WHERE property_id = v_house AND month = '2026-10-01') <> 1200 THEN
        RAISE EXCEPTION 'FAIL: a paid invoice was cancelled (%)', v_result;
    END IF;
    RAISE NOTICE 'ok: a paid invoice is not cancelled';

    -- 5. An open invoice cancelled: the month it had made goes away with it.
    v_next := public.invoice_create(v_owner,
        jsonb_build_object('lease_id', v_lease, 'property_id', v_house, 'tenant_id', v_tenant, 'reference_month', '2026-11-01', 'due_date', '2026-11-10'),
        jsonb_build_array(jsonb_build_object('kind', 'RENT', 'description', 'Aluguel', 'amount', 1200)));
    v_result := public.invoice_cancel(v_owner, v_next, 'valor errado');
    SELECT COUNT(*) INTO v_count FROM public.property_income_months WHERE property_id = v_house AND month = '2026-11-01';
    IF v_result <> 'CANCELLED' OR v_count <> 0 THEN
        RAISE EXCEPTION 'FAIL: the cancelled invoice left its month behind (%, % rows)', v_result, v_count;
    END IF;
    SELECT COUNT(*) INTO v_count FROM public.invoice_events WHERE invoice_id = v_next AND type = 'CANCELLED';
    IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: the cancellation left no trace'; END IF;
    RAISE NOTICE 'ok: a cancelled open invoice takes its month with it';

    -- 6. Kitnet 35C: the agency's deposit is in the ledger already; the invoice adds the condominium and
    --    says it is not inside the deposit, without touching what the owner recorded.
    INSERT INTO public.property_income_months (owner_id, property_id, month, unit_id, unit_name, received_amount, agency_fee_pct, condo_amount, status, source, notes)
    VALUES (v_owner, v_kitnets, '2026-10-01', 'u35c', 'Kitnet 35C', 900, 10, 150, 'CONFIRMED', 'MANUAL', 'repasse da imobiliária');
    v_invoice := public.invoice_create(v_owner,
        jsonb_build_object('lease_id', v_lease_b, 'property_id', v_kitnets, 'unit_id', 'u35c', 'unit_name', 'Kitnet 35C', 'tenant_id', v_tenant_b, 'reference_month', '2026-10-01', 'due_date', '2026-10-20'),
        jsonb_build_array(jsonb_build_object('kind', 'CONDOMINIUM', 'description', 'Condomínio', 'amount', 150)));
    SELECT * INTO v_row FROM public.property_income_months WHERE property_id = v_kitnets AND month = '2026-10-01' AND unit_id = 'u35c';
    IF NOT v_row.condo_direct OR v_row.direct_condo <> 0 OR v_row.received_amount <> 900 OR v_row.source <> 'MANUAL' OR v_row.status <> 'CONFIRMED' THEN
        RAISE EXCEPTION 'FAIL: the invoice disturbed the owner''s row before it was paid';
    END IF;
    PERFORM public.invoice_mark_paid(v_owner, v_invoice, '2026-10-19', 150, 'PIX', 0, 0, 'txid-35c', 'INTER');
    SELECT * INTO v_row FROM public.property_income_months WHERE property_id = v_kitnets AND month = '2026-10-01' AND unit_id = 'u35c';
    IF v_row.direct_condo <> 150 OR v_row.received_amount <> 900 OR v_row.source <> 'MANUAL' OR v_row.notes <> 'repasse da imobiliária' OR v_row.received_on IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL: Kitnet 35C did not get the condominium next to the deposit (direct %, deposit %)', v_row.direct_condo, v_row.received_amount;
    END IF;
    SELECT COUNT(*) INTO v_count FROM public.property_income_months WHERE property_id = v_kitnets AND month = '2026-10-01';
    IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: the unit''s month was duplicated (% rows)', v_count; END IF;
    RAISE NOTICE 'ok: Kitnet 35C keeps the deposit and gains the condominium';

    -- 7. The owner deletes the month by hand: the next sync puts the invoice's money back.
    DELETE FROM public.property_income_months WHERE property_id = v_kitnets AND month = '2026-10-01';
    IF public.invoice_sync_property(v_owner, v_kitnets) <> 1 THEN RAISE EXCEPTION 'FAIL: the property sync missed its key'; END IF;
    SELECT * INTO v_row FROM public.property_income_months WHERE property_id = v_kitnets AND month = '2026-10-01' AND unit_id = 'u35c';
    IF NOT FOUND OR v_row.direct_condo <> 150 OR v_row.source <> 'INVOICE' OR v_row.status <> 'CONFIRMED' OR v_row.unit_name <> 'Kitnet 35C' THEN
        RAISE EXCEPTION 'FAIL: the deleted month did not come back from the invoice';
    END IF;
    RAISE NOTICE 'ok: a month deleted by hand comes back from its invoice';

    -- 8. A month the invoice made takes the agency's terms of the unit's previous month.
    INSERT INTO public.property_income_months (owner_id, property_id, month, unit_id, received_amount, agency_fee_pct, fee_on_condo, status, source)
    VALUES (v_owner, v_kitnets, '2026-11-01', 'u35c', 900, 8, true, 'CONFIRMED', 'MANUAL');
    PERFORM public.invoice_create(v_owner,
        jsonb_build_object('lease_id', v_lease_b, 'property_id', v_kitnets, 'unit_id', 'u35c', 'unit_name', 'Kitnet 35C', 'tenant_id', v_tenant_b, 'reference_month', '2026-12-01', 'due_date', '2026-12-20'),
        jsonb_build_array(jsonb_build_object('kind', 'CONDOMINIUM', 'description', 'Condomínio', 'amount', 150)));
    SELECT * INTO v_row FROM public.property_income_months WHERE property_id = v_kitnets AND month = '2026-12-01' AND unit_id = 'u35c';
    IF v_row.agency_fee_pct <> 8 OR NOT v_row.fee_on_condo THEN
        RAISE EXCEPTION 'FAIL: the new month did not inherit the unit''s agency terms (% %%)', v_row.agency_fee_pct;
    END IF;
    RAISE NOTICE 'ok: a new month inherits the unit''s agency terms';

    -- 9. Nobody syncs another account's property.
    PERFORM public.invoice_sync_ledger(v_other, v_kitnets, '2026-10-01', 'u35c');
    IF (SELECT owner_id FROM public.property_income_months WHERE property_id = v_kitnets AND month = '2026-10-01') <> v_owner THEN
        RAISE EXCEPTION 'FAIL: another account wrote to the ledger';
    END IF;
    IF public.invoice_sync_property(v_other, v_kitnets) <> 0 THEN RAISE EXCEPTION 'FAIL: another account synced the property'; END IF;
    RAISE NOTICE 'ok: the sync is scoped to the owner';

    -- 10. The ledger knows the new origin and still refuses junk.
    BEGIN
        UPDATE public.property_income_months SET source = 'SOMETHING' WHERE property_id = v_house;
        RAISE EXCEPTION 'FAIL: junk accepted as a ledger source' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: the ledger source is constrained';
    END;
    BEGIN
        UPDATE public.property_income_months SET direct_rent = -1 WHERE property_id = v_house;
        RAISE EXCEPTION 'FAIL: a negative direct amount was accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: direct amounts are never negative';
    END;
END;
$$;

ROLLBACK;
