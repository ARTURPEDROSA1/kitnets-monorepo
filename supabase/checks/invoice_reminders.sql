-- Behaviour checks for migrations/20261003300000_invoice_reminders.sql (run by the db workflow after
-- every migration is applied; one rolled-back transaction).

BEGIN;

DO $$
DECLARE
    v_owner UUID;
    v_count INTEGER;
BEGIN
    INSERT INTO public.profiles (clerk_id) VALUES ('check_reminder_owner') RETURNING id INTO v_owner;

    -- 1. The reminder decisions start undecided; the receipt starts on.
    INSERT INTO public.billing_settings (owner_id) VALUES (v_owner);
    SELECT COUNT(*) INTO v_count FROM public.billing_settings WHERE owner_id = v_owner AND reminder_days_before IS NULL AND overdue_notice_days IS NULL AND send_receipts;
    IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: reminders should start undecided and the receipt on'; END IF;
    RAISE NOTICE 'ok: reminders undecided, receipt on, until the owner says otherwise';

    -- 2. The windows are bounded.
    UPDATE public.billing_settings SET reminder_days_before = 3, overdue_notice_days = 5, send_receipts = false WHERE owner_id = v_owner;
    BEGIN
        UPDATE public.billing_settings SET reminder_days_before = 0 WHERE owner_id = v_owner;
        RAISE EXCEPTION 'FAIL: a zero-day reminder was accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: the reminder is at least a day before';
    END;
    BEGIN
        UPDATE public.billing_settings SET overdue_notice_days = 31 WHERE owner_id = v_owner;
        RAISE EXCEPTION 'FAIL: a 31-day overdue notice was accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: the overdue notice is within a month';
    END;

    -- 3. The automation CHECK does not depend on the reminders (they are optional).
    UPDATE public.billing_settings
       SET days_in_advance = 10, fine_pct = 2, interest_pct_month = 1, days_payable_after_due = 30, automation_from_month = '2026-11-01',
           reminder_days_before = NULL, overdue_notice_days = NULL, automation_enabled = true
     WHERE owner_id = v_owner;
    RAISE NOTICE 'ok: the automation runs without reminders decided';
END;
$$;

ROLLBACK;
