-- Contábil & Fiscal › base contábil da holding (Fase 1, Etapa 1).
--
--   accounting_settings  one row per owner: the holding's identity for the books, the
--                        responsible contador and the accounting policies he decides
--                        (standard, measurement model of the rented properties, useful
--                        life, tax basis, reimbursements).
--   accounting_accounts  the holding's chart of accounts, seeded by the app from
--                        lib/accounting/chart-template.ts; system_key is the stable handle
--                        the automation posts to, referential_code the Receita's Plano
--                        Referencial (filled when the ECD/ECF are generated).
--   journal_entries      double-entry journal; journal_lines are the debit/credit lines.
--   accounting_periods   months closed by the owner/contador; absence of a row = open.
--
-- Rules enforced here, not only in the app:
--   * every entry balances (Σ debit = Σ credit > 0) with at least two lines — checked by
--     deferred constraint triggers at commit, so an entry and its lines are posted in one
--     transaction through accounting_post_entry();
--   * lines only hit analytic accounts of the same owner (and active ones when created);
--   * nothing is inserted, changed or deleted in a closed month; corrections are made by
--     reversal (accounting_reverse_entry) dated in an open month. Cascades from a profile
--     or property deletion (trigger depth > 1) are let through.
--
-- Service role only (RLS on, no policies), like the other ledgers.

-- ---------------------------------------------------------------------------
-- Settings and policies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_settings (
    owner_id                    UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,

    legal_nature                TEXT CHECK (legal_nature IS NULL OR legal_nature IN ('SLU', 'LTDA', 'SA', 'EI', 'OUTRA')),
    company_size                TEXT CHECK (company_size IS NULL OR company_size IN ('ME', 'EPP', 'DEMAIS')),
    nire                        TEXT,
    tax_regime                  TEXT NOT NULL DEFAULT 'LUCRO_PRESUMIDO' CHECK (tax_regime IN ('LUCRO_PRESUMIDO', 'LUCRO_REAL')),
    tax_basis                   TEXT CHECK (tax_basis IS NULL OR tax_basis IN ('COMPETENCIA', 'CAIXA')),

    -- NBC TG 1002 (microentidade) has no fair-value option (Seção 17); the full NBCs TG
    -- (CPC 28) let the entity choose cost or fair value for investment property.
    accounting_standard         TEXT NOT NULL DEFAULT 'NBC_TG_1002'
                                CHECK (accounting_standard IN ('NBC_TG_1002', 'NBC_TG_1001', 'NBC_TG_1000', 'NBC_TG_COMPLETAS')),
    property_measurement        TEXT NOT NULL DEFAULT 'COST' CHECK (property_measurement IN ('COST', 'FAIR_VALUE')),
    building_useful_life_years  NUMERIC(5, 2) NOT NULL DEFAULT 25 CHECK (building_useful_life_years > 0 AND building_useful_life_years <= 100),
    useful_life_basis           TEXT NOT NULL DEFAULT 'RFB' CHECK (useful_life_basis IN ('RFB', 'ESTIMATIVA')),
    reimbursements_policy       TEXT CHECK (reimbursements_policy IS NULL OR reimbursements_policy IN ('RECEITA', 'REPASSE')),
    first_adoption_deemed_cost  BOOLEAN,
    opening_date                DATE NOT NULL DEFAULT DATE '2026-01-01',

    accountant_name             TEXT,
    accountant_crc              TEXT,
    accountant_crc_uf           TEXT CHECK (accountant_crc_uf IS NULL OR accountant_crc_uf ~ '^[A-Z]{2}$'),
    accountant_email            TEXT,
    -- Fase 1: the contador decides outside the platform; the owner records who and when.
    policies_decided_by         TEXT,
    policies_decided_on         DATE,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT accounting_settings_fair_value_needs_full_standard
        CHECK (property_measurement = 'COST' OR accounting_standard <> 'NBC_TG_1002')
);

DROP TRIGGER IF EXISTS trg_accounting_settings_updated_at ON public.accounting_settings;
CREATE TRIGGER trg_accounting_settings_updated_at
    BEFORE UPDATE ON public.accounting_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

COMMENT ON TABLE public.accounting_settings IS 'Holding accounting identity and policies (standard, property measurement model, useful life, tax basis) and the responsible contador.';

-- ---------------------------------------------------------------------------
-- Chart of accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_accounts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    code              TEXT NOT NULL CHECK (code ~ '^[0-9]+(\.[0-9]+)*$'),
    name              TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    account_type      TEXT NOT NULL CHECK (account_type IN ('ATIVO', 'PASSIVO', 'PL', 'RECEITA', 'DESPESA')),
    nature            TEXT NOT NULL CHECK (nature IN ('D', 'C')),
    analytic          BOOLEAN NOT NULL DEFAULT false,
    system_key        TEXT,
    referential_code  TEXT,
    active            BOOLEAN NOT NULL DEFAULT true,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT accounting_accounts_owner_code UNIQUE (owner_id, code),
    CONSTRAINT accounting_accounts_id_owner UNIQUE (id, owner_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS accounting_accounts_owner_system_key
    ON public.accounting_accounts (owner_id, system_key) WHERE system_key IS NOT NULL;

DROP TRIGGER IF EXISTS trg_accounting_accounts_updated_at ON public.accounting_accounts;
CREATE TRIGGER trg_accounting_accounts_updated_at
    BEFORE UPDATE ON public.accounting_accounts
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

COMMENT ON TABLE public.accounting_accounts IS 'Holding chart of accounts. system_key = stable handle for automated postings; referential_code = Plano Referencial (ECD/ECF).';

-- ---------------------------------------------------------------------------
-- Journal
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    entry_date         DATE NOT NULL,
    description        TEXT NOT NULL CHECK (length(btrim(description)) > 0),
    source             TEXT NOT NULL DEFAULT 'MANUAL'
                       CHECK (source IN ('MANUAL', 'OPENING', 'BANK', 'ACCRUAL', 'DEPRECIATION', 'FAIR_VALUE', 'TAX', 'CLOSING', 'REVERSAL')),
    source_ref         TEXT,                               -- id of what generated it (bank row, month, …): one entry per source
    reverses_entry_id  UUID,
    created_by         TEXT,

    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT journal_entries_id_owner UNIQUE (id, owner_id),
    CONSTRAINT journal_entries_reverses_same_owner
        FOREIGN KEY (reverses_entry_id, owner_id) REFERENCES public.journal_entries (id, owner_id)
        DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT journal_entries_reversal_has_origin
        CHECK ((source = 'REVERSAL') = (reverses_entry_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_owner_source_ref
    ON public.journal_entries (owner_id, source, source_ref) WHERE source_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_single_reversal
    ON public.journal_entries (reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS journal_entries_owner_date
    ON public.journal_entries (owner_id, entry_date DESC);

DROP TRIGGER IF EXISTS trg_journal_entries_updated_at ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_updated_at
    BEFORE UPDATE ON public.journal_entries
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

CREATE TABLE IF NOT EXISTS public.journal_lines (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id     UUID NOT NULL,
    owner_id     UUID NOT NULL,
    line_no      SMALLINT NOT NULL CHECK (line_no > 0),
    account_id   UUID NOT NULL,
    debit        NUMERIC(14, 2) NOT NULL DEFAULT 0,
    credit       NUMERIC(14, 2) NOT NULL DEFAULT 0,
    property_id  UUID REFERENCES public.properties(id) ON DELETE SET NULL,
    unit_id      TEXT,                                     -- sub-unit id from the property profile JSON
    memo         TEXT,

    CONSTRAINT journal_lines_entry
        FOREIGN KEY (entry_id, owner_id) REFERENCES public.journal_entries (id, owner_id) ON DELETE CASCADE,
    -- Deferred: when a profile is deleted, its accounts and its entries (and, through them,
    -- the lines) go in the same cascade; the check must wait for the lines to be gone.
    CONSTRAINT journal_lines_account
        FOREIGN KEY (account_id, owner_id) REFERENCES public.accounting_accounts (id, owner_id)
        DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT journal_lines_one_side
        CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
    CONSTRAINT journal_lines_entry_line UNIQUE (entry_id, line_no)
);

CREATE INDEX IF NOT EXISTS journal_lines_account ON public.journal_lines (account_id);
CREATE INDEX IF NOT EXISTS journal_lines_owner_property ON public.journal_lines (owner_id, property_id) WHERE property_id IS NOT NULL;

COMMENT ON TABLE public.journal_entries IS 'Holding double-entry journal. Balanced, locked in closed months, corrected by reversal.';
COMMENT ON TABLE public.journal_lines IS 'Debit/credit lines of journal_entries, optionally tagged with the property and unit.';

-- ---------------------------------------------------------------------------
-- Periods
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_periods (
    owner_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    month          DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
    status         TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
    closed_at      TIMESTAMPTZ,
    closed_note    TEXT,
    reopened_at    TIMESTAMPTZ,
    reopen_reason  TEXT,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (owner_id, month),
    CONSTRAINT accounting_periods_reopen_reason
        CHECK (reopened_at IS NULL OR length(btrim(coalesce(reopen_reason, ''))) > 0)
);

DROP TRIGGER IF EXISTS trg_accounting_periods_updated_at ON public.accounting_periods;
CREATE TRIGGER trg_accounting_periods_updated_at
    BEFORE UPDATE ON public.accounting_periods
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

COMMENT ON TABLE public.accounting_periods IS 'Months closed for posting. No row or OPEN = open; reopening requires a reason.';

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounting_month_closed(p_owner UUID, p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.accounting_periods
        WHERE owner_id = p_owner AND month = date_trunc('month', p_date)::date AND status = 'CLOSED'
    );
$$;

-- Entries: no insert/update/delete touching a closed month.
CREATE OR REPLACE FUNCTION public.journal_entries_period_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN   -- cascade from a profile/property deletion
        RETURN COALESCE(NEW, OLD);
    END IF;
    IF TG_OP <> 'INSERT' THEN
        IF public.accounting_month_closed(OLD.owner_id, OLD.entry_date) THEN
            RAISE EXCEPTION 'O mês de % está fechado: lançamentos não podem ser alterados nem excluídos (faça um estorno em um mês aberto)',
                to_char(OLD.entry_date, 'MM/YYYY') USING ERRCODE = 'check_violation';
        END IF;
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        IF NEW.owner_id <> OLD.owner_id THEN
            RAISE EXCEPTION 'O dono de um lançamento não pode mudar' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF public.accounting_month_closed(NEW.owner_id, NEW.entry_date) THEN
        RAISE EXCEPTION 'O mês de % está fechado: não é possível lançar nele', to_char(NEW.entry_date, 'MM/YYYY')
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_period_lock ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_period_lock
    BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
    FOR EACH ROW EXECUTE FUNCTION public.journal_entries_period_lock();

-- Lines: same lock (through the entry date), analytic/active account, property of the owner.
CREATE OR REPLACE FUNCTION public.journal_lines_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_date      DATE;
    v_analytic  BOOLEAN;
    v_active    BOOLEAN;
BEGIN
    IF pg_trigger_depth() > 1 THEN   -- cascade from the entry, a profile or a property
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT entry_date INTO v_date FROM public.journal_entries WHERE id = OLD.entry_id;
        IF v_date IS NOT NULL AND public.accounting_month_closed(OLD.owner_id, v_date) THEN
            RAISE EXCEPTION 'O mês de % está fechado: linhas não podem ser alteradas nem excluídas', to_char(v_date, 'MM/YYYY')
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    SELECT entry_date INTO v_date FROM public.journal_entries WHERE id = NEW.entry_id;
    IF v_date IS NOT NULL AND public.accounting_month_closed(NEW.owner_id, v_date) THEN
        RAISE EXCEPTION 'O mês de % está fechado: não é possível lançar nele', to_char(v_date, 'MM/YYYY')
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT analytic, active INTO v_analytic, v_active
    FROM public.accounting_accounts WHERE id = NEW.account_id AND owner_id = NEW.owner_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conta contábil não encontrada' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NOT v_analytic THEN
        RAISE EXCEPTION 'Conta sintética não recebe lançamentos: use uma conta analítica' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT v_active AND (TG_OP = 'INSERT' OR NEW.account_id IS DISTINCT FROM OLD.account_id) THEN
        RAISE EXCEPTION 'Conta contábil inativa' USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.property_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.properties WHERE id = NEW.property_id AND owner_id = NEW.owner_id
    ) THEN
        RAISE EXCEPTION 'Imóvel não encontrado' USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_lines_guard ON public.journal_lines;
CREATE TRIGGER trg_journal_lines_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
    FOR EACH ROW EXECUTE FUNCTION public.journal_lines_guard();

-- Balance, checked at commit: an entry that still exists has ≥ 2 lines and Σ debit = Σ credit.
CREATE OR REPLACE FUNCTION public.journal_entry_assert_balanced(p_entry UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_lines   INTEGER;
    v_debit   NUMERIC;
    v_credit  NUMERIC;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE id = p_entry) THEN
        RETURN;
    END IF;
    SELECT count(*), COALESCE(sum(debit), 0), COALESCE(sum(credit), 0)
      INTO v_lines, v_debit, v_credit
      FROM public.journal_lines WHERE entry_id = p_entry;
    IF v_lines < 2 THEN
        RAISE EXCEPTION 'Um lançamento precisa de pelo menos duas linhas' USING ERRCODE = 'check_violation';
    END IF;
    IF v_debit <> v_credit THEN
        RAISE EXCEPTION 'Lançamento desbalanceado: débitos % ≠ créditos %', v_debit, v_credit USING ERRCODE = 'check_violation';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.journal_lines_balance_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.journal_entry_assert_balanced(OLD.entry_id);
        RETURN NULL;
    END IF;
    PERFORM public.journal_entry_assert_balanced(NEW.entry_id);
    IF TG_OP = 'UPDATE' THEN
        IF OLD.entry_id <> NEW.entry_id THEN
            PERFORM public.journal_entry_assert_balanced(OLD.entry_id);
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_lines_balance ON public.journal_lines;
CREATE CONSTRAINT TRIGGER trg_journal_lines_balance
    AFTER INSERT OR UPDATE OR DELETE ON public.journal_lines
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.journal_lines_balance_check();

-- An entry inserted without lines is caught too.
CREATE OR REPLACE FUNCTION public.journal_entries_balance_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    PERFORM public.journal_entry_assert_balanced(NEW.id);
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_balance ON public.journal_entries;
CREATE CONSTRAINT TRIGGER trg_journal_entries_balance
    AFTER INSERT ON public.journal_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.journal_entries_balance_check();

-- ---------------------------------------------------------------------------
-- Posting API (one transaction per call, so the deferred checks see the whole entry)
-- ---------------------------------------------------------------------------
-- p_entry: { entry_date, description, source?, source_ref?, created_by? }
-- p_lines: [{ account_id, debit?, credit?, property_id?, unit_id?, memo? }, …]
CREATE OR REPLACE FUNCTION public.accounting_post_entry(p_owner UUID, p_entry JSONB, p_lines JSONB)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_id    UUID;
    v_line  JSONB;
    v_no    INTEGER := 0;
BEGIN
    IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) < 2 THEN
        RAISE EXCEPTION 'Um lançamento precisa de pelo menos duas linhas' USING ERRCODE = 'check_violation';
    END IF;
    IF COALESCE(p_entry->>'source', 'MANUAL') = 'REVERSAL' THEN
        RAISE EXCEPTION 'Estornos são feitos por accounting_reverse_entry' USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.journal_entries (owner_id, entry_date, description, source, source_ref, created_by)
    VALUES (
        p_owner,
        (p_entry->>'entry_date')::date,
        btrim(p_entry->>'description'),
        COALESCE(p_entry->>'source', 'MANUAL'),
        NULLIF(btrim(p_entry->>'source_ref'), ''),
        NULLIF(btrim(p_entry->>'created_by'), '')
    )
    RETURNING id INTO v_id;

    FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
        v_no := v_no + 1;
        INSERT INTO public.journal_lines (entry_id, owner_id, line_no, account_id, debit, credit, property_id, unit_id, memo)
        VALUES (
            v_id,
            p_owner,
            v_no,
            (v_line->>'account_id')::uuid,
            COALESCE(NULLIF(v_line->>'debit', '')::numeric, 0),
            COALESCE(NULLIF(v_line->>'credit', '')::numeric, 0),
            NULLIF(v_line->>'property_id', '')::uuid,
            NULLIF(btrim(v_line->>'unit_id'), ''),
            NULLIF(btrim(v_line->>'memo'), '')
        );
    END LOOP;

    RETURN v_id;
END;
$$;

-- Reversal: a new entry, dated p_date (an open month), with every line mirrored.
CREATE OR REPLACE FUNCTION public.accounting_reverse_entry(p_owner UUID, p_entry UUID, p_date DATE, p_description TEXT, p_created_by TEXT)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_orig  public.journal_entries%ROWTYPE;
    v_id    UUID;
BEGIN
    SELECT * INTO v_orig FROM public.journal_entries WHERE id = p_entry AND owner_id = p_owner;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lançamento não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_orig.source = 'REVERSAL' THEN
        RAISE EXCEPTION 'Um estorno não pode ser estornado: lance de novo o valor correto' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE reverses_entry_id = p_entry) THEN
        RAISE EXCEPTION 'Este lançamento já foi estornado' USING ERRCODE = 'unique_violation';
    END IF;

    INSERT INTO public.journal_entries (owner_id, entry_date, description, source, reverses_entry_id, created_by)
    VALUES (
        p_owner,
        COALESCE(p_date, CURRENT_DATE),
        COALESCE(NULLIF(btrim(p_description), ''), 'Estorno: ' || v_orig.description),
        'REVERSAL',
        p_entry,
        NULLIF(btrim(p_created_by), '')
    )
    RETURNING id INTO v_id;

    INSERT INTO public.journal_lines (entry_id, owner_id, line_no, account_id, debit, credit, property_id, unit_id, memo)
    SELECT v_id, p_owner, line_no, account_id, credit, debit, property_id, unit_id, memo
      FROM public.journal_lines WHERE entry_id = p_entry;

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounting_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_periods  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_settings, public.accounting_accounts, public.journal_entries,
              public.journal_lines, public.accounting_periods FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.accounting_month_closed(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.journal_entry_assert_balanced(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accounting_post_entry(UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accounting_reverse_entry(UUID, UUID, DATE, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_month_closed(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.journal_entry_assert_balanced(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.accounting_post_entry(UUID, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.accounting_reverse_entry(UUID, UUID, DATE, TEXT, TEXT) TO service_role;
