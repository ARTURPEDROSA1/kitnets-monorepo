-- Behaviour checks for migrations/20260928150000_accounting_bank_posting.sql (run by the db
-- workflow after every migration is applied; one rolled-back transaction).

BEGIN;

DO $$
DECLARE
    v_owner   UUID;
    v_bank    UUID;
    v_expense UUID;
    v_row     UUID;
    v_entry   UUID;
    v_left    UUID;
BEGIN
    INSERT INTO public.profiles (clerk_id) VALUES ('check_bank_owner') RETURNING id INTO v_owner;
    INSERT INTO public.accounting_accounts (owner_id, code, name, account_type, nature, analytic, system_key)
    VALUES (v_owner, '1.1.1.02', 'Bancos', 'ATIVO', 'D', true, 'BANCOS') RETURNING id INTO v_bank;
    INSERT INTO public.accounting_accounts (owner_id, code, name, account_type, nature, analytic, system_key)
    VALUES (v_owner, '4.1.1.02', 'Manutenção', 'DESPESA', 'D', true, 'DESP_MANUTENCAO') RETURNING id INTO v_expense;

    INSERT INTO public.bank_transactions (owner_id, occurred_on, amount, memo, reference, source, destination, account_id, account_option)
    VALUES (v_owner, '2026-09-10', -80, 'Conserto', 'check-1', 'CSV', 'IGNORED', v_expense, 'MANUTENCAO') RETURNING id INTO v_row;

    -- 1. One BANK entry per bank row.
    v_entry := public.accounting_post_entry(v_owner,
        jsonb_build_object('entry_date', '2026-09-10', 'description', 'Extrato: Conserto', 'source', 'BANK', 'source_ref', v_row::text),
        jsonb_build_array(jsonb_build_object('account_id', v_expense, 'debit', 80), jsonb_build_object('account_id', v_bank, 'credit', 80)));
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    BEGIN
        PERFORM public.accounting_post_entry(v_owner,
            jsonb_build_object('entry_date', '2026-09-10', 'description', 'De novo', 'source', 'BANK', 'source_ref', v_row::text),
            jsonb_build_array(jsonb_build_object('account_id', v_expense, 'debit', 80), jsonb_build_object('account_id', v_bank, 'credit', 80)));
        RAISE EXCEPTION 'FAIL: second entry for the same bank row accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'ok: one entry per bank row';
    END;

    -- 2. The answer's account is released when an unused account is deleted.
    DELETE FROM public.journal_entries WHERE id = v_entry;
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    DELETE FROM public.accounting_accounts WHERE id = v_expense;
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    SELECT account_id INTO v_left FROM public.bank_transactions WHERE id = v_row;
    IF v_left IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL: bank row still points to a deleted account';
    END IF;
    RAISE NOTICE 'ok: answer released with the account';

    -- 3. Balance and usage are summed on the database side.
    INSERT INTO public.accounting_accounts (owner_id, code, name, account_type, nature, analytic, system_key)
    VALUES (v_owner, '2.3.1.01', 'Capital', 'PL', 'C', true, 'CAPITAL_SUBSCRITO') RETURNING id INTO v_expense;
    PERFORM public.accounting_post_entry(v_owner,
        jsonb_build_object('entry_date', '2026-01-01', 'description', 'Aporte'),
        jsonb_build_array(jsonb_build_object('account_id', v_bank, 'debit', 1000), jsonb_build_object('account_id', v_expense, 'credit', 1000)));
    PERFORM public.accounting_post_entry(v_owner,
        jsonb_build_object('entry_date', '2026-10-01', 'description', 'Aporte 2'),
        jsonb_build_array(jsonb_build_object('account_id', v_bank, 'debit', 250.5), jsonb_build_object('account_id', v_expense, 'credit', 250.5)));
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    IF public.accounting_account_balance(v_owner, v_bank, '2026-09-30') <> 1000
       OR public.accounting_account_balance(v_owner, v_bank, '2026-10-01') <> 1250.5
       OR public.accounting_account_balance(v_owner, v_expense, '2026-12-31') <> -1250.5 THEN
        RAISE EXCEPTION 'FAIL: account balance';
    END IF;
    IF (SELECT lines FROM public.accounting_account_usage(v_owner) WHERE account_id = v_bank) <> 2 THEN
        RAISE EXCEPTION 'FAIL: account usage';
    END IF;
    RAISE NOTICE 'ok: balance and usage summed in the database';

    -- 4. The start of the books has no default and is always the first day of a month.
    INSERT INTO public.accounting_settings (owner_id) VALUES (v_owner);
    IF (SELECT opening_date FROM public.accounting_settings WHERE owner_id = v_owner) IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL: opening_date got a default';
    END IF;
    BEGIN
        UPDATE public.accounting_settings SET opening_date = '2025-01-15' WHERE owner_id = v_owner;
        RAISE EXCEPTION 'FAIL: opening date mid-month accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: opening date is the owner''s choice, first day of a month';
    END;
    UPDATE public.accounting_settings SET opening_date = '2025-01-01' WHERE owner_id = v_owner;

    -- 5. One reconciliation per date.
    INSERT INTO public.bank_reconciliations (owner_id, as_of, statement_balance, book_balance) VALUES (v_owner, '2026-09-30', 1000, 990);
    BEGIN
        INSERT INTO public.bank_reconciliations (owner_id, as_of, statement_balance, book_balance) VALUES (v_owner, '2026-09-30', 1000, 1000);
        RAISE EXCEPTION 'FAIL: two reconciliations on the same date' USING ERRCODE = 'P0001';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'ok: one reconciliation per date';
    END;
END;
$$;

ROLLBACK;
