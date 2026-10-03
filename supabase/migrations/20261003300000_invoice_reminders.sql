-- Fatura: the reminders and the receipt (step 7).
--
-- Two more decisions of the owner in billing_settings, NULL until made — nothing is sent in their
-- place: how many days before the due date the tenant is reminded, and how many days after it an
-- unpaid invoice gets an overdue notice. Each goes out once per invoice (invoice_deliveries kind
-- REMINDER, sequence 0 = before, 1 = overdue; the unique key is the lock). The receipt goes out when
-- an invoice is paid (kind RECEIPT), unless the owner switches it off.
--
-- Written and read by the API with the service role.

ALTER TABLE public.billing_settings
    ADD COLUMN IF NOT EXISTS reminder_days_before INTEGER CHECK (reminder_days_before BETWEEN 1 AND 15),   -- NULL = no reminder
    ADD COLUMN IF NOT EXISTS overdue_notice_days  INTEGER CHECK (overdue_notice_days BETWEEN 1 AND 30),    -- NULL = no overdue notice
    ADD COLUMN IF NOT EXISTS send_receipts        BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.billing_settings.reminder_days_before IS 'Days before the due date the tenant is reminded of an unpaid invoice; NULL = the owner has not decided, no reminder.';
COMMENT ON COLUMN public.billing_settings.overdue_notice_days IS 'Days after the due date an unpaid invoice gets an overdue notice; NULL = the owner has not decided, no notice.';
COMMENT ON COLUMN public.billing_settings.send_receipts IS 'E-mail a receipt to the tenant when an invoice is paid.';
