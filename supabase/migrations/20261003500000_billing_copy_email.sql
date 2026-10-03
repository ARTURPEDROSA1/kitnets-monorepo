-- Fatura: a copy of every e-mail for the owner.
--
-- When the owner gives an address here, each e-mail that goes out to a tenant — the invoice, the
-- reminder, the overdue notice, the receipt — is followed by a copy to it, marked as a copy (its link
-- does not count as the tenant opening the page). NULL = no copy; nothing is assumed in its place.

ALTER TABLE public.billing_settings
    ADD COLUMN IF NOT EXISTS copy_to_email TEXT;

COMMENT ON COLUMN public.billing_settings.copy_to_email IS 'Where the owner receives a copy of every e-mail sent to tenants; NULL = no copy.';
