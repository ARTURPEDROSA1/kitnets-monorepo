-- Novos Investimentos — properties bought off-plan ("na planta"), tracked from the
-- contract until the keys are handed over and the unit starts producing rent.
--
--   new_investments            one row per investment (studio, garage spot, lot…): the
--                              "quadro resumo" of the contract, the delivery dates and the
--                              rent the owner expects once the keys arrive.
--   new_investment_schedules   the payment blocks of that quadro resumo: N instalments of X
--                              starting on a date, with their correction index. They are the
--                              forecast; they are never money paid.
--   new_investment_payments    one row per payment actually made (or planned), with the
--                              receipt stored in the `investment-documents` bucket.
--   new_investment_documents   contract, marketing material, photos, floor plans, receipts.
--
-- When the cycle ends (keys handed over / paid off) the investment is promoted: a
-- `properties` row is created, `promoted_property_id` points at it and the investment
-- moves to COMPLETED. Nothing is deleted — the payment history stays here.
--
-- Access is through /api/investments (service role, scoped by owner). RLS on, no
-- anon/authenticated access, same as every other owner-scoped table.

CREATE TABLE IF NOT EXISTS public.new_investments (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    name                 TEXT NOT NULL,
    description          TEXT,
    developer            TEXT,                  -- construtora / incorporadora
    unit_label           TEXT,                  -- "Studio 204", "Vaga 12"
    kind                 TEXT NOT NULL DEFAULT 'APARTMENT' CHECK (kind IN (
                             'APARTMENT', 'STUDIO', 'HOUSE', 'PARKING', 'LOT', 'COMMERCIAL', 'OTHER'
                         )),

    address              TEXT,
    city                 TEXT,
    state                TEXT,
    zip                  TEXT,

    -- Quadro resumo
    total_price          NUMERIC(14, 2) NOT NULL DEFAULT 0,
    down_payment         NUMERIC(14, 2) NOT NULL DEFAULT 0,
    financed_amount      NUMERIC(14, 2) NOT NULL DEFAULT 0,   -- "valor a parcelar"
    contract_date        DATE,

    -- Delivery: the vertical marker of the cash-flow chart
    keys_expected_on     DATE,
    keys_delivered_on    DATE,

    -- Correction indexes of the contract (before / after the keys)
    index_before_keys    TEXT NOT NULL DEFAULT 'NONE' CHECK (index_before_keys IN ('NONE', 'INCC', 'IGPM', 'IPCA', 'CUB', 'OTHER')),
    index_after_keys     TEXT NOT NULL DEFAULT 'NONE' CHECK (index_after_keys  IN ('NONE', 'INCC', 'IGPM', 'IPCA', 'CUB', 'OTHER')),

    -- Rent assumptions for the simulator (the owner edits them on the dashboard)
    estimated_rent       NUMERIC(12, 2),
    rent_start_on        DATE,                  -- defaults to the month after the keys
    rent_adjustment_pct  NUMERIC(6, 2) NOT NULL DEFAULT 0,    -- % a.a. applied every 12 months
    rent_vacancy_pct     NUMERIC(5, 2) NOT NULL DEFAULT 0,
    rent_costs_pct       NUMERIC(5, 2) NOT NULL DEFAULT 0,    -- condomínio, IPTU, administração as % of the rent

    status               TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'ARCHIVED')),
    promoted_property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
    promoted_at          TIMESTAMPTZ,

    cover_path           TEXT,                  -- object path of the photo shown on the card
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT new_investments_non_negative CHECK (
        total_price >= 0 AND down_payment >= 0 AND financed_amount >= 0
        AND (estimated_rent IS NULL OR estimated_rent >= 0)
        AND rent_vacancy_pct >= 0 AND rent_vacancy_pct < 100
        AND rent_costs_pct >= 0 AND rent_costs_pct < 100
    )
);

CREATE INDEX IF NOT EXISTS idx_new_investments_owner ON public.new_investments (owner_id, status);

CREATE TABLE IF NOT EXISTS public.new_investment_schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investment_id   UUID NOT NULL REFERENCES public.new_investments(id) ON DELETE CASCADE,
    owner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    label           TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'PARCELA' CHECK (kind IN (
                        'SINAL', 'ENTRADA', 'PARCELA', 'PARCELA_ANUAL', 'INTERCALADA',
                        'CHAVES', 'AMORTIZACAO', 'CORRECAO', 'TAXAS', 'OUTROS'
                    )),
    installments    INTEGER NOT NULL DEFAULT 1 CHECK (installments > 0 AND installments <= 600),
    amount          NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    first_due_on    DATE NOT NULL,
    periodicity     TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (periodicity IN ('SINGLE', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL')),
    index_code      TEXT NOT NULL DEFAULT 'NONE' CHECK (index_code IN ('NONE', 'INCC', 'IGPM', 'IPCA', 'CUB', 'OTHER')),
    position        INTEGER NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_new_investment_schedules_investment
    ON public.new_investment_schedules (investment_id, position);

CREATE TABLE IF NOT EXISTS public.new_investment_payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investment_id       UUID NOT NULL REFERENCES public.new_investments(id) ON DELETE CASCADE,
    owner_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    due_on              DATE NOT NULL,
    paid_on             DATE,
    kind                TEXT NOT NULL DEFAULT 'PARCELA' CHECK (kind IN (
                            'SINAL', 'ENTRADA', 'PARCELA', 'PARCELA_ANUAL', 'INTERCALADA',
                            'CHAVES', 'AMORTIZACAO', 'CORRECAO', 'TAXAS', 'OUTROS'
                        )),
    amount              NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    -- the index correction charged on top of the contracted instalment, kept apart so the
    -- dashboard can show how much of what was paid is INCC/IGP-M and not principal
    correction_amount   NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (correction_amount >= 0),
    installment_number  INTEGER CHECK (installment_number IS NULL OR installment_number > 0),
    status              TEXT NOT NULL DEFAULT 'PAID' CHECK (status IN ('PLANNED', 'PAID')),

    receipt_path        TEXT,
    receipt_name        TEXT,

    notes               TEXT,
    source              TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'SCHEDULE', 'IMPORT')),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT new_investment_payments_paid_has_date CHECK (status <> 'PAID' OR paid_on IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_new_investment_payments_investment
    ON public.new_investment_payments (investment_id, due_on);
CREATE INDEX IF NOT EXISTS idx_new_investment_payments_owner
    ON public.new_investment_payments (owner_id);

CREATE TABLE IF NOT EXISTS public.new_investment_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investment_id   UUID NOT NULL REFERENCES public.new_investments(id) ON DELETE CASCADE,
    owner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    kind            TEXT NOT NULL DEFAULT 'OTHER' CHECK (kind IN ('CONTRACT', 'MARKETING', 'PHOTO', 'LAYOUT', 'RECEIPT', 'OTHER')),
    storage_path    TEXT NOT NULL,
    file_name       TEXT,
    mime_type       TEXT,
    size_bytes      BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_new_investment_documents_investment
    ON public.new_investment_documents (investment_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS uq_new_investment_documents_path
    ON public.new_investment_documents (storage_path);

-- updated_at triggers (reuse the income ledger's function, as property_investments does)
DROP TRIGGER IF EXISTS trg_new_investments_updated_at ON public.new_investments;
CREATE TRIGGER trg_new_investments_updated_at
    BEFORE UPDATE ON public.new_investments
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

DROP TRIGGER IF EXISTS trg_new_investment_schedules_updated_at ON public.new_investment_schedules;
CREATE TRIGGER trg_new_investment_schedules_updated_at
    BEFORE UPDATE ON public.new_investment_schedules
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

DROP TRIGGER IF EXISTS trg_new_investment_payments_updated_at ON public.new_investment_payments;
CREATE TRIGGER trg_new_investment_payments_updated_at
    BEFORE UPDATE ON public.new_investment_payments
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

ALTER TABLE public.new_investments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.new_investment_schedules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.new_investment_payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.new_investment_documents  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.new_investments          FROM anon, authenticated;
REVOKE ALL ON public.new_investment_schedules FROM anon, authenticated;
REVOKE ALL ON public.new_investment_payments  FROM anon, authenticated;
REVOKE ALL ON public.new_investment_documents FROM anon, authenticated;

-- Contracts, receipts, marketing material and floor plans. Private: every read is a signed URL.
INSERT INTO storage.buckets (id, name, public)
VALUES ('investment-documents', 'investment-documents', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

COMMENT ON TABLE public.new_investments          IS 'Off-plan property investments tracked until the keys are handed over (Novos Investimentos).';
COMMENT ON TABLE public.new_investment_schedules IS 'Payment blocks of the contract quadro resumo: N instalments of X from a date. Forecast only.';
COMMENT ON TABLE public.new_investment_payments  IS 'Payments made (or planned) for an off-plan investment, one receipt each.';
COMMENT ON TABLE public.new_investment_documents IS 'Contract, marketing material, photos, floor plans and receipts of an off-plan investment.';
