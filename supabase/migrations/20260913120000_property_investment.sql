-- Investment side of the property analysis (slice A of docs/INVESTMENT_ANALYSIS_PLAN.md)
--
--   property_investments   one row per property: purchase price / date / area and the
--                          financing header (lender, contract, SAC|PRICE, principal, rate,
--                          term, dates, status).
--   property_transactions  dated cash outflows attributable to the property:
--                          ENTRADA, CUSTOS_AQUISICAO, PRESTACAO, AMORTIZACAO, QUITACAO,
--                          TARIFA, IPTU, UTILIDADES, REFORMA, ENERGIA_SOLAR, OUTROS.
--                          Amounts are positive (they are all money paid by the owner).
--
-- Totals derived in the app:
--   invested (imóvel)  = ENTRADA + CUSTOS_AQUISICAO + PRESTACAO + AMORTIZACAO + QUITACAO + REFORMA
--   custos do imóvel   = TARIFA + IPTU + UTILIDADES + OUTROS
--   energia solar      = ENERGIA_SOLAR (own cost centre, paid back by net energy income)
--
-- Access is through /api/properties/[id]/investment and /transactions (service role,
-- scoped by owner). RLS on, no anon/authenticated access.

CREATE TABLE IF NOT EXISTS public.property_investments (
    property_id       UUID PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
    owner_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    purchase_price    NUMERIC(14, 2) NOT NULL DEFAULT 0,
    acquired_on       DATE,
    built_area_m2     NUMERIC(10, 2),

    lender            TEXT,
    contract_number   TEXT,
    financing_system  TEXT CHECK (financing_system IS NULL OR financing_system IN ('SAC', 'PRICE', 'OTHER')),
    principal         NUMERIC(14, 2),
    annual_rate       NUMERIC(8, 4),
    term_months       INTEGER,
    contract_date     DATE,
    first_due_date    DATE,
    financing_status  TEXT NOT NULL DEFAULT 'NONE' CHECK (financing_status IN ('NONE', 'ACTIVE', 'PAID_OFF')),
    paid_off_on       DATE,

    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT property_investments_non_negative CHECK (
        purchase_price >= 0
        AND (principal IS NULL OR principal >= 0)
        AND (annual_rate IS NULL OR annual_rate >= 0)
        AND (term_months IS NULL OR term_months > 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_property_investments_owner ON public.property_investments (owner_id);

CREATE TABLE IF NOT EXISTS public.property_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    owner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    occurred_on     DATE NOT NULL,
    kind            TEXT NOT NULL CHECK (kind IN (
                        'ENTRADA', 'CUSTOS_AQUISICAO', 'PRESTACAO', 'AMORTIZACAO', 'QUITACAO',
                        'TARIFA', 'IPTU', 'UTILIDADES', 'REFORMA', 'ENERGIA_SOLAR', 'OUTROS'
                    )),
    amount          NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
    interest_part   NUMERIC(14, 2) CHECK (interest_part IS NULL OR interest_part >= 0),
    principal_part  NUMERIC(14, 2) CHECK (principal_part IS NULL OR principal_part >= 0),
    insurance_part  NUMERIC(14, 2) CHECK (insurance_part IS NULL OR insurance_part >= 0),
    comment         TEXT,

    source          TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'IMPORT', 'BANK')),
    bank_reference  TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_transactions_property_date
    ON public.property_transactions (property_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_property_transactions_owner
    ON public.property_transactions (owner_id);

-- updated_at triggers (reuse the income ledger's function)
DROP TRIGGER IF EXISTS trg_property_investments_updated_at ON public.property_investments;
CREATE TRIGGER trg_property_investments_updated_at
    BEFORE UPDATE ON public.property_investments
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

DROP TRIGGER IF EXISTS trg_property_transactions_updated_at ON public.property_transactions;
CREATE TRIGGER trg_property_transactions_updated_at
    BEFORE UPDATE ON public.property_transactions
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

ALTER TABLE public.property_investments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_investments  FROM anon, authenticated;
REVOKE ALL ON public.property_transactions FROM anon, authenticated;

COMMENT ON TABLE public.property_investments  IS 'Acquisition and financing header per property (investment analysis).';
COMMENT ON TABLE public.property_transactions IS 'Dated cash outflows per property: acquisition, financing, capex, running costs, solar. Positive amounts.';
