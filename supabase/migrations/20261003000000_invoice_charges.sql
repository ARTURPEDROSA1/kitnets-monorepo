-- Fatura: the charges issued at a payment provider for an invoice.
--
-- An invoice is what the owner asks for; a charge is how the tenant can pay it: today a Banco Inter
-- "boleto com Pix" (one charge gives the boleto's digitable line and the Pix copy-and-paste code at
-- once), later a Stripe card checkout. One live boleto per invoice at a time; a new one may be issued
-- after the previous expired or was cancelled. Everything the provider answered — its reference, the
-- boleto and Pix data, what it says of the charge's state — lives here, so the invoice itself keeps
-- only the four states it always had.
--
-- The provider's own status is kept verbatim in provider_status; `status` is the module's reading
-- of it, refreshed by the webhook and by the owner's "Atualizar". Paid is never set from a webhook
-- payload alone: the charge is read back from the provider first (lib/billing/charges-server.ts).
--
-- Written and read by the API with the service role.

CREATE TABLE IF NOT EXISTS public.invoice_charges (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id       UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    owner_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider         TEXT NOT NULL CHECK (provider IN ('INTER', 'STRIPE')),
    kind             TEXT NOT NULL CHECK (kind IN ('BOLEPIX', 'CARD_CHECKOUT')),
    status           TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'OPEN', 'PAID', 'CANCELLED', 'EXPIRED', 'FAILED')),

    seu_numero       TEXT,                                  -- Inter: our reference on the charge (≤ 15 chars)
    provider_ref     TEXT,                                  -- Inter: codigoSolicitacao · Stripe: the checkout session
    provider_status  TEXT,                                  -- the provider's own word (A_RECEBER, RECEBIDO, EXPIRADO…)
    amount           NUMERIC(12, 2) NOT NULL CHECK (amount > 0),   -- what the charge asks for (the card: grossed up)
    net_amount       NUMERIC(12, 2),                        -- the card: what the owner keeps
    surcharge_amount NUMERIC(12, 2),                        -- the card: the fee passed on to the tenant
    due_date         DATE,
    days_payable_after_due INTEGER,                         -- Inter: numDiasAgenda

    nosso_numero     TEXT,
    barcode          TEXT,
    digitable_line   TEXT,
    pix_txid         TEXT,
    pix_copy_paste   TEXT,
    pdf_path         TEXT,                                  -- in the private invoice-documents bucket
    payment_intent_id TEXT,                                 -- Stripe
    expires_at       TIMESTAMPTZ,                           -- Stripe: the checkout session

    paid_at          TIMESTAMPTZ,
    paid_amount      NUMERIC(12, 2),
    paid_via         TEXT CHECK (paid_via IN ('BOLETO', 'PIX', 'CARD')),

    attempts         INTEGER NOT NULL DEFAULT 0,
    last_error       TEXT,
    last_checked_at  TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- a provider reference leads to exactly one charge (the webhook finds it by this)
CREATE UNIQUE INDEX IF NOT EXISTS invoice_charges_provider_ref
    ON public.invoice_charges (provider, provider_ref) WHERE provider_ref IS NOT NULL;
-- one boleto at a time per invoice: the lock against issuing twice
CREATE UNIQUE INDEX IF NOT EXISTS invoice_charges_one_live_bolepix
    ON public.invoice_charges (invoice_id) WHERE kind = 'BOLEPIX' AND status IN ('REQUESTED', 'OPEN');
CREATE INDEX IF NOT EXISTS idx_invoice_charges_invoice
    ON public.invoice_charges (invoice_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invoice_charges_open
    ON public.invoice_charges (owner_id, status) WHERE status IN ('REQUESTED', 'OPEN');

DROP TRIGGER IF EXISTS trg_invoice_charges_updated_at ON public.invoice_charges;
CREATE TRIGGER trg_invoice_charges_updated_at
    BEFORE UPDATE ON public.invoice_charges
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

ALTER TABLE public.invoice_charges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_charges FROM anon, authenticated;

COMMENT ON TABLE public.invoice_charges IS 'A charge issued at a payment provider for an invoice (Banco Inter boleto com Pix; later a Stripe checkout): the provider''s reference, the boleto and Pix data, its state as last read from the provider.';

-- The boleto PDFs: a tenant's document, private bucket, signed URLs only (the routes use the service role).
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-documents', 'invoice-documents', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
