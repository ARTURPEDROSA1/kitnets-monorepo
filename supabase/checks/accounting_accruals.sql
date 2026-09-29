-- Behaviour checks for migrations/20260929090000_accounting_accruals.sql (run by the db
-- workflow after every migration is applied; one rolled-back transaction).

BEGIN;

DO $$
DECLARE
    v_owner  UUID;
    v_prop   UUID;
    v_prop2  UUID;
    v_bank   UUID;
    v_ar     UUID;
    v_rent   UUID;
    v_entry  UUID;
    v_new    UUID;
    v_row    RECORD;
BEGIN
    INSERT INTO public.profiles (clerk_id) VALUES ('check_accruals_owner') RETURNING id INTO v_owner;
    INSERT INTO public.properties (name, owner_id) VALUES ('Vale do Sol', v_owner) RETURNING id INTO v_prop;
    INSERT INTO public.properties (name, owner_id) VALUES ('Casa X', v_owner) RETURNING id INTO v_prop2;
    INSERT INTO public.accounting_accounts (owner_id, code, name, account_type, nature, analytic, system_key)
    VALUES (v_owner, '1.1.1.02', 'Bancos', 'ATIVO', 'D', true, 'BANCOS') RETURNING id INTO v_bank;
    INSERT INTO public.accounting_accounts (owner_id, code, name, account_type, nature, analytic, system_key)
    VALUES (v_owner, '1.1.2.01', 'Aluguéis a receber', 'ATIVO', 'D', true, 'ALUGUEIS_A_RECEBER') RETURNING id INTO v_ar;
    INSERT INTO public.accounting_accounts (owner_id, code, name, account_type, nature, analytic, system_key)
    VALUES (v_owner, '3.1.1.01', 'Receita de aluguéis', 'RECEITA', 'C', true, 'RECEITA_ALUGUEL') RETURNING id INTO v_rent;

    -- 1. Standard and measurement model have no default; fair value needs a standard that allows it.
    INSERT INTO public.accounting_settings (owner_id) VALUES (v_owner);
    SELECT accounting_standard, property_measurement INTO v_row FROM public.accounting_settings WHERE owner_id = v_owner;
    IF v_row.accounting_standard IS NOT NULL OR v_row.property_measurement IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL: standard or measurement got a default';
    END IF;
    BEGIN
        UPDATE public.accounting_settings SET property_measurement = 'FAIR_VALUE' WHERE owner_id = v_owner;
        RAISE EXCEPTION 'FAIL: fair value with no standard accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: fair value needs a standard';
    END;
    UPDATE public.accounting_settings SET property_measurement = 'COST' WHERE owner_id = v_owner;
    UPDATE public.accounting_settings SET accounting_standard = 'NBC_TG_COMPLETAS', property_measurement = 'FAIR_VALUE' WHERE owner_id = v_owner;
    RAISE NOTICE 'ok: no default model; cost without a standard, fair value under the full standards';

    -- 2. Trial balance: balance before the period, debits and credits in it.
    PERFORM public.accounting_post_entry(v_owner,
        jsonb_build_object('entry_date', '2026-08-31', 'description', 'Aluguel ago'),
        jsonb_build_array(jsonb_build_object('account_id', v_ar, 'debit', 1000, 'property_id', v_prop), jsonb_build_object('account_id', v_rent, 'credit', 1000, 'property_id', v_prop)));
    PERFORM public.accounting_post_entry(v_owner,
        jsonb_build_object('entry_date', '2026-09-10', 'description', 'Depósito'),
        jsonb_build_array(jsonb_build_object('account_id', v_bank, 'debit', 1000), jsonb_build_object('account_id', v_ar, 'credit', 1000, 'property_id', v_prop)));
    v_entry := public.accounting_post_entry(v_owner,
        jsonb_build_object('entry_date', '2026-09-30', 'description', 'Aluguel set', 'source', 'ACCRUAL', 'source_ref', 'rent:p:-:2026-09'),
        jsonb_build_array(jsonb_build_object('account_id', v_ar, 'debit', 1200, 'property_id', v_prop2), jsonb_build_object('account_id', v_rent, 'credit', 1200, 'property_id', v_prop2)));
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    SELECT * INTO v_row FROM public.accounting_trial_balance(v_owner, '2026-09-01', '2026-09-30') WHERE account_id = v_ar;
    IF v_row.opening <> 1000 OR v_row.debit <> 1200 OR v_row.credit <> 1000 THEN
        RAISE EXCEPTION 'FAIL: trial balance of the receivable (% / % / %)', v_row.opening, v_row.debit, v_row.credit;
    END IF;
    IF (SELECT sum(opening) FROM public.accounting_trial_balance(v_owner, '2026-09-01', '2026-09-30')) <> 0
       OR (SELECT sum(debit) - sum(credit) FROM public.accounting_trial_balance(v_owner, '2026-09-01', '2026-09-30')) <> 0 THEN
        RAISE EXCEPTION 'FAIL: trial balance does not balance';
    END IF;
    RAISE NOTICE 'ok: trial balance summed in the database';

    -- 3. Balances per property tag.
    IF (SELECT balance FROM public.accounting_balances_by_property(v_owner, '2026-09-30', ARRAY[v_ar]) WHERE property_id = v_prop) <> 0
       OR (SELECT balance FROM public.accounting_balances_by_property(v_owner, '2026-09-30', ARRAY[v_ar]) WHERE property_id = v_prop2) <> 1200
       OR (SELECT balance FROM public.accounting_balances_by_property(v_owner, '2026-08-31', ARRAY[v_ar]) WHERE property_id = v_prop) <> 1000 THEN
        RAISE EXCEPTION 'FAIL: balances by property';
    END IF;
    RAISE NOTICE 'ok: balances by property';

    -- 4. An automated entry is replaced in one step, keeping its reference.
    v_new := public.accounting_replace_entry(v_owner, v_entry,
        jsonb_build_object('entry_date', '2026-09-30', 'description', 'Aluguel set (novo valor)', 'source', 'ACCRUAL', 'source_ref', 'rent:p:-:2026-09'),
        jsonb_build_array(jsonb_build_object('account_id', v_ar, 'debit', 1300, 'property_id', v_prop2), jsonb_build_object('account_id', v_rent, 'credit', 1300, 'property_id', v_prop2)));
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE id = v_entry)
       OR (SELECT count(*) FROM public.journal_entries WHERE owner_id = v_owner AND source = 'ACCRUAL' AND source_ref = 'rent:p:-:2026-09') <> 1
       OR (SELECT sum(debit) FROM public.journal_lines WHERE entry_id = v_new) <> 1300 THEN
        RAISE EXCEPTION 'FAIL: replacement';
    END IF;
    RAISE NOTICE 'ok: entry replaced under the same reference';

    -- 5. A replacement that does not balance leaves the old entry in place.
    BEGIN
        PERFORM public.accounting_replace_entry(v_owner, v_new,
            jsonb_build_object('entry_date', '2026-09-30', 'description', 'Desbalanceado', 'source', 'ACCRUAL', 'source_ref', 'rent:p:-:2026-09'),
            jsonb_build_array(jsonb_build_object('account_id', v_ar, 'debit', 1300), jsonb_build_object('account_id', v_rent, 'credit', 1)));
        SET CONSTRAINTS ALL IMMEDIATE;
        RAISE EXCEPTION 'FAIL: unbalanced replacement accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: unbalanced replacement refused';
    END;
    SET CONSTRAINTS ALL DEFERRED;
    IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE id = v_new) THEN
        RAISE EXCEPTION 'FAIL: failed replacement lost the old entry';
    END IF;
    RAISE NOTICE 'ok: failed replacement keeps the old entry';

    -- 6. Nothing is replaced in a closed month; another owner's entry is not found.
    INSERT INTO public.accounting_periods (owner_id, month, status, closed_at) VALUES (v_owner, '2026-09-01', 'CLOSED', now());
    BEGIN
        PERFORM public.accounting_replace_entry(v_owner, v_new,
            jsonb_build_object('entry_date', '2026-09-30', 'description', 'Mês fechado', 'source', 'ACCRUAL', 'source_ref', 'rent:p:-:2026-09'),
            jsonb_build_array(jsonb_build_object('account_id', v_ar, 'debit', 5), jsonb_build_object('account_id', v_rent, 'credit', 5)));
        RAISE EXCEPTION 'FAIL: replacement in a closed month accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: closed month refuses the replacement';
    END;
    BEGIN
        PERFORM public.accounting_replace_entry(gen_random_uuid(), v_new,
            jsonb_build_object('entry_date', '2026-10-31', 'description', 'Outro dono', 'source', 'ACCRUAL', 'source_ref', 'x'),
            jsonb_build_array(jsonb_build_object('account_id', v_ar, 'debit', 5), jsonb_build_object('account_id', v_rent, 'credit', 5)));
        RAISE EXCEPTION 'FAIL: replaced another owner''s entry' USING ERRCODE = 'P0001';
    EXCEPTION WHEN no_data_found THEN
        RAISE NOTICE 'ok: only the owner''s entries are replaced';
    END;
END;
$$;

ROLLBACK;
