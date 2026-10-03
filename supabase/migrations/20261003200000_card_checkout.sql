-- Fatura: the card payment (Stripe Checkout on the owner's connected account).
--
-- A card charge is an invoice_charges row of kind CARD_CHECKOUT: a Checkout Session created on the
-- owner's Stripe account, where the tenant types the card. The page the tenant is sent to lives
-- with the row while the session is open, so a second click reuses it instead of opening another;
-- one open session per invoice at a time is the lock, as it is for the boleto. The amount asked is
-- the invoice grossed up by the card fee the owner passes on (net_amount / surcharge_amount already
-- exist from migration 20261003000000).
--
-- The owner's Stripe account itself is a billing_connections row (provider STRIPE): only the
-- account's id and standing are kept — the platform's key with `Stripe-Account` is all the calls
-- need, so there is no secret to seal.

ALTER TABLE public.invoice_charges
    ADD COLUMN IF NOT EXISTS checkout_url TEXT;                 -- Stripe: where the tenant pays, while the session is open

COMMENT ON COLUMN public.invoice_charges.checkout_url IS 'Stripe Checkout: the page the tenant is sent to, kept while the session is open so a second click reuses it.';

-- one card session at a time per invoice: the lock against opening two
CREATE UNIQUE INDEX IF NOT EXISTS invoice_charges_one_live_card
    ON public.invoice_charges (invoice_id) WHERE kind = 'CARD_CHECKOUT' AND status IN ('REQUESTED', 'OPEN');
