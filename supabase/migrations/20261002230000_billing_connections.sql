-- Fatura: each owner's own connection to a payment provider.
--
-- The invoices of an owner are issued through the owner's own bank integration (Banco Inter: client id,
-- client secret, certificate and private key of the integration the owner creates in the Internet
-- Banking PJ) and, later, the owner's own Stripe account. One row per owner and provider.
--
-- Secrets never sit here in the clear: secret_ciphertext is AES-256-GCM, sealed by the application with
-- a master key that lives only in the server's environment (lib/secret-box.ts) and bound to the owner
-- and provider, so a dump of this table — or a ciphertext copied onto another owner's row — opens
-- nothing. secret_key_id says which master key sealed it (rotation). The API never returns a secret:
-- what the screens show comes from `metadata` (the account, the tail of the client id, the
-- certificate's subject, the scopes the bank granted).
--
-- Written and read by the API with the service role.

CREATE TABLE IF NOT EXISTS public.billing_connections (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider               TEXT NOT NULL CHECK (provider IN ('INTER', 'STRIPE')),
    status                 TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONNECTED', 'ERROR')),
    environment            TEXT NOT NULL DEFAULT 'PRODUCTION' CHECK (environment IN ('PRODUCTION', 'SANDBOX')),

    metadata               JSONB NOT NULL DEFAULT '{}',          -- nothing secret
    external_account_id    TEXT,                                 -- Stripe: acct_…
    credential_fingerprint TEXT,                                 -- hash of the provider's public identifier (Inter: the client id)

    secret_ciphertext      TEXT,
    secret_key_id          TEXT,
    token_ciphertext       TEXT,                                 -- the provider's access token, sealed the same way
    token_expires_at       TIMESTAMPTZ,
    cert_expires_at        TIMESTAMPTZ,                          -- Inter: the integration's certificate lasts one year

    webhook_key_hash       TEXT,                                 -- SHA-256 of the secret in the provider's webhook URL
    webhook_registered_at  TIMESTAMPTZ,

    configured_at          TIMESTAMPTZ,
    last_checked_at        TIMESTAMPTZ,
    last_error             TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (owner_id, provider),
    CONSTRAINT billing_connections_secret_has_key CHECK ((secret_ciphertext IS NULL) = (secret_key_id IS NULL)),
    CONSTRAINT billing_connections_token_has_expiry CHECK (token_ciphertext IS NULL OR token_expires_at IS NOT NULL)
);

-- One bank integration (or one Stripe account) belongs to one owner: a second account cannot register it,
-- and a webhook secret leads to exactly one connection.
CREATE UNIQUE INDEX IF NOT EXISTS billing_connections_fingerprint
    ON public.billing_connections (provider, environment, credential_fingerprint) WHERE credential_fingerprint IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS billing_connections_external_account
    ON public.billing_connections (provider, external_account_id) WHERE external_account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS billing_connections_webhook
    ON public.billing_connections (webhook_key_hash) WHERE webhook_key_hash IS NOT NULL;

DROP TRIGGER IF EXISTS trg_billing_connections_updated_at ON public.billing_connections;
CREATE TRIGGER trg_billing_connections_updated_at
    BEFORE UPDATE ON public.billing_connections
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

ALTER TABLE public.billing_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_connections FROM anon, authenticated;

COMMENT ON TABLE public.billing_connections IS 'One row per owner and payment provider (Banco Inter, Stripe): the owner''s own credentials, sealed by the application, and what the bank answered when they were last tested.';
COMMENT ON COLUMN public.billing_connections.secret_ciphertext IS 'AES-256-GCM, sealed by the application with a master key kept only in the server environment and bound to owner and provider. Never returned by the API.';
COMMENT ON COLUMN public.billing_connections.metadata IS 'What the screens may show: account, tail of the client id, certificate subject, scopes granted. Nothing secret.';
