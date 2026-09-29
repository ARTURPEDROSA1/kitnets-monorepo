-- Contábil & Fiscal › motor de lançamentos do extrato (Fase 1, Etapa 2).
--
-- Every bank_transactions row becomes one journal entry (source 'BANK', source_ref = the
-- row id; one per row thanks to journal_entries_owner_source_ref). When the automation
-- cannot tell what a row is, it asks the owner in plain language; the answer is stored
-- here so it is posted and remembered for rows that look alike:
--   account_option  the plain-language option picked (lib/accounting-bank-posting.ts)
--   account_id      the counterpart account (the option's account, or one chosen by the contador)
--
-- bank_reconciliations: the statement balance at a date against the book balance of the
-- bank account, kept as a record of each conferência.

ALTER TABLE public.bank_transactions
    ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounting_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS account_option TEXT;

COMMENT ON COLUMN public.bank_transactions.account_id IS 'Counterpart account of the journal entry, as answered by the owner/contador (null = decided by the rules).';
COMMENT ON COLUMN public.bank_transactions.account_option IS 'Plain-language option picked for the row (lib/accounting-bank-posting.ts BANK_OPTIONS).';

CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
    owner_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    as_of              DATE NOT NULL,
    statement_balance  NUMERIC(14, 2) NOT NULL,
    book_balance       NUMERIC(14, 2) NOT NULL,
    unposted_rows      INTEGER NOT NULL DEFAULT 0 CHECK (unposted_rows >= 0),
    note               TEXT,
    created_by         TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (owner_id, as_of)
);

DROP TRIGGER IF EXISTS trg_bank_reconciliations_updated_at ON public.bank_reconciliations;
CREATE TRIGGER trg_bank_reconciliations_updated_at
    BEFORE UPDATE ON public.bank_reconciliations
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_reconciliations FROM anon, authenticated;

COMMENT ON TABLE public.bank_reconciliations IS 'Bank reconciliation records: statement balance vs book balance of the bank account at a date.';

-- Sums on the database side: the API caps a select at 1000 rows, and an account's history
-- (the bank account above all) grows past that.
CREATE OR REPLACE FUNCTION public.accounting_account_balance(p_owner UUID, p_account UUID, p_as_of DATE)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT COALESCE(SUM(l.debit - l.credit), 0)
      FROM public.journal_lines l
      JOIN public.journal_entries e ON e.id = l.entry_id
     WHERE l.owner_id = p_owner AND l.account_id = p_account AND e.entry_date <= p_as_of;
$$;

CREATE OR REPLACE FUNCTION public.accounting_account_usage(p_owner UUID)
RETURNS TABLE (account_id UUID, lines BIGINT)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT l.account_id, count(*) FROM public.journal_lines l WHERE l.owner_id = p_owner GROUP BY l.account_id;
$$;

REVOKE EXECUTE ON FUNCTION public.accounting_account_balance(UUID, UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accounting_account_usage(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_account_balance(UUID, UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.accounting_account_usage(UUID) TO service_role;
