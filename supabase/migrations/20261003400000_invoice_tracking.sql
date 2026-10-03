-- Fatura: did the invoice reach the tenant?
--
-- Two signals beyond "the provider accepted the message":
--
--   * what the e-mail provider reports afterwards (its webhook): delivered to the tenant's mailbox,
--     bounced (the address does not take mail), or complained (marked as spam). They are kept on the
--     delivery row; a bounce turns the delivery BOUNCED, which the screens already treat as "did not
--     get there".
--   * the invoice's page being opened (the link in the e-mail): first and last time, and how many
--     times — counted at most once per half hour, never for the owner looking at their own invoice,
--     never for crawlers (the page decides that; this function only counts).
--
-- Written and read by the API with the service role.

ALTER TABLE public.invoice_deliveries
    ADD COLUMN IF NOT EXISTS delivered_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS bounced_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS complained_at TIMESTAMPTZ;

-- the provider's webhook finds the delivery by the message id
CREATE INDEX IF NOT EXISTS idx_invoice_deliveries_provider
    ON public.invoice_deliveries (provider_id) WHERE provider_id IS NOT NULL;

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_viewed_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS view_count      INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.invoices.first_viewed_at IS 'When the invoice''s public page was first opened by someone other than the owner.';
COMMENT ON COLUMN public.invoices.view_count IS 'How many times the public page was opened (at most one per half hour).';

-- Counts a view of the invoice behind a token. Returns the invoice and whether it was the first
-- view; nothing when the token leads nowhere or the last view was less than half an hour ago.
CREATE OR REPLACE FUNCTION public.invoice_record_view(p_token TEXT)
RETURNS TABLE (invoice_id UUID, owner_id UUID, first_view BOOLEAN)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v RECORD;
BEGIN
    SELECT i.id, i.owner_id AS owner, i.first_viewed_at, i.last_viewed_at INTO v
      FROM public.invoices i WHERE i.public_token = p_token FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    IF v.last_viewed_at IS NOT NULL AND v.last_viewed_at > NOW() - INTERVAL '30 minutes' THEN RETURN; END IF;

    UPDATE public.invoices
       SET first_viewed_at = COALESCE(first_viewed_at, NOW()), last_viewed_at = NOW(), view_count = view_count + 1
     WHERE id = v.id;

    invoice_id := v.id;
    owner_id := v.owner;
    first_view := v.first_viewed_at IS NULL;
    RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invoice_record_view(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_record_view(TEXT) TO service_role;
