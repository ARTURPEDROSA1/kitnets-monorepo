-- Behaviour checks for migrations/20260928090000_accounting_base.sql.
--
-- The db workflow runs this after `supabase db start` has applied every migration:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/checks/accounting_base.sql
-- Everything runs in one transaction that is rolled back. Deferred balance checks are
-- forced with SET CONSTRAINTS ALL IMMEDIATE right after each posting.

BEGIN;

DO $$
DECLARE
    v_owner      UUID;
    v_other      UUID;
    v_prop       UUID;
    v_other_prop UUID;
    v_bank       UUID;
    v_rent       UUID;
    v_expense    UUID;
    v_group      UUID;
    v_inactive   UUID;
    v_foreign    UUID;
    v_entry      UUID;
    v_reversal   UUID;
    v_count      INTEGER;
    v_debit      NUMERIC;
    v_credit     NUMERIC;
BEGIN
    INSERT INTO public.profiles (clerk_id) VALUES ('check_accounting_owner') RETURNING id INTO v_owner;
    INSERT INTO public.profiles (clerk_id) VALUES ('check_accounting_other') RETURNING id INTO v_other;
    INSERT INTO public.properties (name, owner_id) VALUES ('Prédio teste', v_owner) RETURNING id INTO v_prop;
    INSERT INTO public.properties (name, owner_id) VALUES ('Prédio de outro', v_other) RETURNING id INTO v_other_prop;

    INSERT INTO public.accounting_accounts (owner_id, code, name, account_type, nature, analytic)
    VALUES (v_owner, '1.1.1', 'Disponível', 'ATIVO', 'D', false) RETURNING id INTO v_group;
    INSERT INTO public.accounting_accounts (owner_id, code, name, account_type, nature, analytic, system_key)
    VALUES (v_owner, '1.1.1.02', 'Bancos', 'ATIVO', 'D', true, 'BANCOS') RETURNING id INTO v_bank;
    INSERT INTO public.accounting_accounts (owner_id, code, name, account_type, nature, analytic, system_key)
    VALUES (v_owner, '3.1.1.01', 'Receita de aluguéis', 'RECEITA', 'C', true, 'RECEITA_ALUGUEL') RETURNING id INTO v_rent;
    INSERT INTO public.accounting_accounts (owner_id, code, name, account_type, nature, analytic, system_key)
    VALUES (v_owner, '4.1.1.02', 'Manutenção', 'DESPESA', 'D', true, 'DESP_MANUTENCAO') RETURNING id INTO v_expense;
    INSERT INTO public.accounting_accounts (owner_id, code, name, account_type, nature, analytic, active)
    VALUES (v_owner, '1.1.5.01', 'Imóveis para revenda', 'ATIVO', 'D', true, false) RETURNING id INTO v_inactive;
    INSERT INTO public.accounting_accounts (owner_id, code, name, account_type, nature, analytic)
    VALUES (v_other, '1.1.1.02', 'Bancos de outro', 'ATIVO', 'D', true) RETURNING id INTO v_foreign;

    -- 1. A balanced entry posts.
    v_entry := public.accounting_post_entry(v_owner,
        jsonb_build_object('entry_date', '2026-09-10', 'description', 'Aluguel setembro'),
        jsonb_build_array(
            jsonb_build_object('account_id', v_bank, 'debit', 1500, 'property_id', v_prop, 'unit_id', 'u1'),
            jsonb_build_object('account_id', v_rent, 'credit', 1500, 'property_id', v_prop, 'unit_id', 'u1')));
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    RAISE NOTICE 'ok: balanced entry posted';

    -- 2. An unbalanced entry is rejected at commit.
    BEGIN
        PERFORM public.accounting_post_entry(v_owner,
            jsonb_build_object('entry_date', '2026-09-11', 'description', 'Desbalanceado'),
            jsonb_build_array(
                jsonb_build_object('account_id', v_bank, 'debit', 100),
                jsonb_build_object('account_id', v_rent, 'credit', 90)));
        SET CONSTRAINTS ALL IMMEDIATE;
        RAISE EXCEPTION 'FAIL: unbalanced entry accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: unbalanced entry rejected';
    END;
    SET CONSTRAINTS ALL DEFERRED;

    -- 3. Fewer than two lines is rejected.
    BEGIN
        PERFORM public.accounting_post_entry(v_owner,
            jsonb_build_object('entry_date', '2026-09-11', 'description', 'Uma linha'),
            jsonb_build_array(jsonb_build_object('account_id', v_bank, 'debit', 100)));
        RAISE EXCEPTION 'FAIL: single-line entry accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: single-line entry rejected';
    END;

    -- 4. A line with both sides (or none) is rejected.
    BEGIN
        PERFORM public.accounting_post_entry(v_owner,
            jsonb_build_object('entry_date', '2026-09-11', 'description', 'Dois lados'),
            jsonb_build_array(
                jsonb_build_object('account_id', v_bank, 'debit', 100, 'credit', 100),
                jsonb_build_object('account_id', v_rent, 'credit', 0)));
        RAISE EXCEPTION 'FAIL: two-sided line accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: two-sided line rejected';
    END;

    -- 5. Synthetic, inactive and foreign accounts are rejected.
    BEGIN
        PERFORM public.accounting_post_entry(v_owner,
            jsonb_build_object('entry_date', '2026-09-11', 'description', 'Sintética'),
            jsonb_build_array(
                jsonb_build_object('account_id', v_group, 'debit', 10),
                jsonb_build_object('account_id', v_rent, 'credit', 10)));
        RAISE EXCEPTION 'FAIL: synthetic account accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: synthetic account rejected';
    END;
    BEGIN
        PERFORM public.accounting_post_entry(v_owner,
            jsonb_build_object('entry_date', '2026-09-11', 'description', 'Inativa'),
            jsonb_build_array(
                jsonb_build_object('account_id', v_inactive, 'debit', 10),
                jsonb_build_object('account_id', v_rent, 'credit', 10)));
        RAISE EXCEPTION 'FAIL: inactive account accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: inactive account rejected';
    END;
    BEGIN
        PERFORM public.accounting_post_entry(v_owner,
            jsonb_build_object('entry_date', '2026-09-11', 'description', 'Conta de outro'),
            jsonb_build_array(
                jsonb_build_object('account_id', v_foreign, 'debit', 10),
                jsonb_build_object('account_id', v_rent, 'credit', 10)));
        RAISE EXCEPTION 'FAIL: foreign account accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE 'ok: foreign account rejected';
    END;
    BEGIN
        PERFORM public.accounting_post_entry(v_owner,
            jsonb_build_object('entry_date', '2026-09-11', 'description', 'Imóvel de outro'),
            jsonb_build_array(
                jsonb_build_object('account_id', v_bank, 'debit', 10, 'property_id', v_other_prop),
                jsonb_build_object('account_id', v_rent, 'credit', 10)));
        RAISE EXCEPTION 'FAIL: foreign property accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE 'ok: foreign property rejected';
    END;

    -- 6. Editing lines of an existing entry out of balance is caught at commit.
    BEGIN
        UPDATE public.journal_lines SET debit = 1400 WHERE entry_id = v_entry AND line_no = 1;
        SET CONSTRAINTS ALL IMMEDIATE;
        RAISE EXCEPTION 'FAIL: unbalancing update accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: unbalancing update rejected';
    END;
    SET CONSTRAINTS ALL DEFERRED;

    -- 7. A closed month is locked for insert, update and delete.
    INSERT INTO public.accounting_periods (owner_id, month, status, closed_at) VALUES (v_owner, '2026-09-01', 'CLOSED', now());
    BEGIN
        UPDATE public.journal_entries SET description = 'Alterado' WHERE id = v_entry;
        RAISE EXCEPTION 'FAIL: update in closed month accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: update in closed month rejected';
    END;
    BEGIN
        DELETE FROM public.journal_entries WHERE id = v_entry;
        RAISE EXCEPTION 'FAIL: delete in closed month accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: delete in closed month rejected';
    END;
    BEGIN
        UPDATE public.journal_lines SET memo = 'x' WHERE entry_id = v_entry;
        RAISE EXCEPTION 'FAIL: line update in closed month accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: line update in closed month rejected';
    END;
    BEGIN
        PERFORM public.accounting_post_entry(v_owner,
            jsonb_build_object('entry_date', '2026-09-30', 'description', 'No mês fechado'),
            jsonb_build_array(
                jsonb_build_object('account_id', v_expense, 'debit', 10),
                jsonb_build_object('account_id', v_bank, 'credit', 10)));
        RAISE EXCEPTION 'FAIL: posting into closed month accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: posting into closed month rejected';
    END;

    -- 8. Correction by reversal in an open month mirrors every line.
    v_reversal := public.accounting_reverse_entry(v_owner, v_entry, '2026-10-02', NULL, 'check');
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    SELECT count(*), sum(debit), sum(credit) INTO v_count, v_debit, v_credit
      FROM public.journal_lines WHERE entry_id = v_reversal;
    IF v_count <> 2 OR v_debit <> 1500 OR v_credit <> 1500 THEN
        RAISE EXCEPTION 'FAIL: reversal lines wrong (% lines, D %, C %)', v_count, v_debit, v_credit;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.journal_lines WHERE entry_id = v_reversal AND account_id = v_bank AND credit = 1500 AND unit_id = 'u1') THEN
        RAISE EXCEPTION 'FAIL: reversal did not mirror the bank line';
    END IF;
    RAISE NOTICE 'ok: reversal mirrors the original';

    BEGIN
        PERFORM public.accounting_reverse_entry(v_owner, v_entry, '2026-10-03', NULL, NULL);
        RAISE EXCEPTION 'FAIL: second reversal accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'ok: second reversal rejected';
    END;
    BEGIN
        PERFORM public.accounting_reverse_entry(v_owner, v_reversal, '2026-10-03', NULL, NULL);
        RAISE EXCEPTION 'FAIL: reversal of a reversal accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: reversal of a reversal rejected';
    END;
    BEGIN
        PERFORM public.accounting_reverse_entry(v_other, v_entry, '2026-10-03', NULL, NULL);
        RAISE EXCEPTION 'FAIL: reversal by another owner accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN no_data_found THEN
        RAISE NOTICE 'ok: reversal by another owner rejected';
    END;

    -- 9. Reopening needs a reason; afterwards the month is editable again.
    BEGIN
        UPDATE public.accounting_periods SET status = 'OPEN', reopened_at = now() WHERE owner_id = v_owner AND month = '2026-09-01';
        RAISE EXCEPTION 'FAIL: reopen without reason accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: reopen without reason rejected';
    END;
    UPDATE public.accounting_periods SET status = 'OPEN', reopened_at = now(), reopen_reason = 'Ajuste do contador'
     WHERE owner_id = v_owner AND month = '2026-09-01';
    UPDATE public.journal_entries SET description = 'Aluguel setembro (u1)' WHERE id = v_entry;
    RAISE NOTICE 'ok: reopened month editable';

    -- 10. Fair value needs a standard other than NBC TG 1002.
    BEGIN
        INSERT INTO public.accounting_settings (owner_id, property_measurement) VALUES (v_owner, 'FAIR_VALUE');
        RAISE EXCEPTION 'FAIL: fair value under NBC TG 1002 accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: fair value under NBC TG 1002 rejected';
    END;
    INSERT INTO public.accounting_settings (owner_id, accounting_standard, property_measurement)
    VALUES (v_owner, 'NBC_TG_COMPLETAS', 'FAIR_VALUE');

    -- 11. An account with lines cannot be deleted; an entry in an open month can.
    BEGIN
        DELETE FROM public.accounting_accounts WHERE id = v_rent;
        SET CONSTRAINTS ALL IMMEDIATE;
        RAISE EXCEPTION 'FAIL: used account deleted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE 'ok: used account cannot be deleted';
    END;
    SET CONSTRAINTS ALL DEFERRED;
    PERFORM public.accounting_post_entry(v_owner,
        jsonb_build_object('entry_date', '2026-11-05', 'description', 'Manutenção', 'source_ref', 'm-1'),
        jsonb_build_array(
            jsonb_build_object('account_id', v_expense, 'debit', 80),
            jsonb_build_object('account_id', v_bank, 'credit', 80)));
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    BEGIN
        PERFORM public.accounting_post_entry(v_owner,
            jsonb_build_object('entry_date', '2026-11-05', 'description', 'Manutenção de novo', 'source_ref', 'm-1'),
            jsonb_build_array(
                jsonb_build_object('account_id', v_expense, 'debit', 80),
                jsonb_build_object('account_id', v_bank, 'credit', 80)));
        RAISE EXCEPTION 'FAIL: duplicate source_ref accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'ok: one entry per source reference';
    END;
    DELETE FROM public.journal_entries WHERE owner_id = v_owner AND source_ref = 'm-1';
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    RAISE NOTICE 'ok: entry in an open month deleted with its lines';

    -- 12. Deleting the owner cascades through a closed month.
    INSERT INTO public.accounting_periods (owner_id, month, status, closed_at) VALUES (v_owner, '2026-10-01', 'CLOSED', now());
    DELETE FROM public.profiles WHERE id = v_owner;
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    SELECT count(*) INTO v_count FROM public.journal_entries WHERE owner_id = v_owner;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'FAIL: % entries survived the owner deletion', v_count;
    END IF;
    RAISE NOTICE 'ok: owner deletion cascades';
END;
$$;

ROLLBACK;
