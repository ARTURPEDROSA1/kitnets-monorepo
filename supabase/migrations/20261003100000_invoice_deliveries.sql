-- Fatura: every e-mail an invoice sends to its tenant, and whether it got there.
--
-- A delivery is one message: the invoice when it is issued (ISSUE), a reminder (REMINDER), the
-- receipt (RECEIPT), or the owner sending it again (RESEND, numbered). A message is never sent twice:
-- the row is claimed before the provider is called (status SENDING with a lock), the provider gets
-- the row's id as an idempotency key, and the (invoice, kind, sequence) key is unique. A failed
-- delivery keeps the reason and is tried again by the daily run; one stuck in SENDING for too long
-- is reported, never resent on its own.
--
-- Written and read by the API with the service role.

CREATE TABLE IF NOT EXISTS public.invoice_deliveries (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id   UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    owner_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL CHECK (kind IN ('ISSUE', 'REMINDER', 'RECEIPT', 'RESEND')),
    sequence     INTEGER NOT NULL DEFAULT 0,
    recipient    TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'BOUNCED')),
    provider_id  TEXT,                                   -- the provider's message id
    attempts     INTEGER NOT NULL DEFAULT 0,
    last_error   TEXT,
    locked_at    TIMESTAMPTZ,
    sent_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (invoice_id, kind, sequence)
);

CREATE INDEX IF NOT EXISTS idx_invoice_deliveries_owner_status
    ON public.invoice_deliveries (owner_id, status) WHERE status IN ('PENDING', 'SENDING', 'FAILED');
CREATE INDEX IF NOT EXISTS idx_invoice_deliveries_invoice
    ON public.invoice_deliveries (invoice_id, created_at);

DROP TRIGGER IF EXISTS trg_invoice_deliveries_updated_at ON public.invoice_deliveries;
CREATE TRIGGER trg_invoice_deliveries_updated_at
    BEFORE UPDATE ON public.invoice_deliveries
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

ALTER TABLE public.invoice_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_deliveries FROM anon, authenticated;

COMMENT ON TABLE public.invoice_deliveries IS 'Each e-mail an invoice sends to its tenant (issue, reminder, receipt, resend) and whether it got there. Claimed before sending; never sent twice.';

-- Claims a delivery for sending: only one caller gets it, and a claim older than ten minutes (a run
-- that died) can be taken over. Returns the row, or nothing when it is not to be sent now.
CREATE OR REPLACE FUNCTION public.invoice_delivery_claim(p_owner UUID, p_delivery UUID)
RETURNS SETOF public.invoice_deliveries
LANGUAGE sql
SET search_path = public
AS $$
    UPDATE public.invoice_deliveries
       SET status = 'SENDING', locked_at = NOW(), attempts = attempts + 1
     WHERE id = p_delivery AND owner_id = p_owner
       AND (status IN ('PENDING', 'FAILED') OR (status = 'SENDING' AND locked_at < NOW() - INTERVAL '10 minutes'))
    RETURNING *;
$$;

REVOKE EXECUTE ON FUNCTION public.invoice_delivery_claim(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_delivery_claim(UUID, UUID) TO service_role;
