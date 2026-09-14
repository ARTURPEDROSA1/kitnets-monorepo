-- Holding-level bank ledger (Contábil & Fiscal › Contas bancárias).
--
-- Every statement row the owner imports (OFX / CSV / PDF today, the Banco
-- Inter API later) lands here once, keyed by the bank's own id (OFX FITID) or
-- a content hash, and records where it was routed:
--   destination INVESTMENT → property_transactions (source BANK)
--               INCOME     → property_income_months (source BANK)
--               IGNORED    → kept for the accounting side only
-- This table is the raw material for the holding's DRE, balanço and taxes.

CREATE TABLE IF NOT EXISTS public.bank_transactions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    occurred_on  DATE NOT NULL,
    amount       NUMERIC(14, 2) NOT NULL,                 -- signed: negative = money out
    memo         TEXT NOT NULL DEFAULT '',
    reference    TEXT NOT NULL,                           -- bank id (FITID) or content hash
    source       TEXT NOT NULL DEFAULT 'OFX' CHECK (source IN ('OFX', 'CSV', 'PDF', 'API')),
    bank         TEXT,

    destination  TEXT NOT NULL DEFAULT 'IGNORED' CHECK (destination IN ('INVESTMENT', 'INCOME', 'IGNORED')),
    property_id  UUID REFERENCES public.properties(id) ON DELETE SET NULL,
    kind         TEXT,                                    -- property_transactions.kind when INVESTMENT
    linked_id    UUID,                                    -- id of the ledger row created

    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (owner_id, reference)
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_owner_date
    ON public.bank_transactions (owner_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_property
    ON public.bank_transactions (property_id);

DROP TRIGGER IF EXISTS trg_bank_transactions_updated_at ON public.bank_transactions;
CREATE TRIGGER trg_bank_transactions_updated_at
    BEFORE UPDATE ON public.bank_transactions
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_transactions FROM anon, authenticated;

COMMENT ON TABLE public.bank_transactions IS 'Holding bank ledger: every imported statement row once, with where it was routed (property investment, property income or ignored).';
