-- Contábil & Fiscal › competência e fechamento (Fase 1, Etapa 3).
--
-- 1. The standard and the measurement model of the rented properties are decisions of the
--    owner with the contador, like the start of the books: no default, NULL until chosen.
--    Depreciation / fair-value entries are only generated once they are chosen and the
--    decision is recorded. Rows saved before this migration without a recorded decision
--    (policies_decided_on) go back to "not decided".
-- 2. Sums the closing needs, on the database side (the API caps a select at 1000 rows):
--      accounting_trial_balance(owner, from, to)        per account: balance before `from`,
--                                                      debits and credits between the dates
--      accounting_balances_by_property(owner, as_of, accounts)
--                                                      balance per account and property tag
-- 3. accounting_replace_entry(owner, old, entry, lines): the automated entries of an open month
--    (rent by competência, depreciation, fair value, financing interest) are recomputed from the
--    owner's records; one that changed is swapped for the new version in a single transaction,
--    so the books never lose it half-way.

ALTER TABLE public.accounting_settings ALTER COLUMN accounting_standard DROP DEFAULT;
ALTER TABLE public.accounting_settings ALTER COLUMN accounting_standard DROP NOT NULL;
ALTER TABLE public.accounting_settings ALTER COLUMN property_measurement DROP DEFAULT;
ALTER TABLE public.accounting_settings ALTER COLUMN property_measurement DROP NOT NULL;

ALTER TABLE public.accounting_settings DROP CONSTRAINT IF EXISTS accounting_settings_fair_value_needs_full_standard;
ALTER TABLE public.accounting_settings
    ADD CONSTRAINT accounting_settings_fair_value_needs_full_standard
    CHECK (property_measurement IS DISTINCT FROM 'FAIR_VALUE' OR (accounting_standard IS NOT NULL AND accounting_standard <> 'NBC_TG_1002'));

UPDATE public.accounting_settings
   SET accounting_standard = NULL, property_measurement = NULL
 WHERE policies_decided_on IS NULL;

COMMENT ON COLUMN public.accounting_settings.accounting_standard IS 'Accounting standard chosen with the contador; NULL until decided.';
COMMENT ON COLUMN public.accounting_settings.property_measurement IS 'Measurement model of the rented properties (COST = depreciation, FAIR_VALUE = CPC 28); NULL until decided — nothing model-dependent is posted before.';

CREATE OR REPLACE FUNCTION public.accounting_trial_balance(p_owner UUID, p_from DATE, p_to DATE)
RETURNS TABLE (account_id UUID, opening NUMERIC, debit NUMERIC, credit NUMERIC)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT l.account_id,
           COALESCE(SUM(l.debit - l.credit) FILTER (WHERE e.entry_date < p_from), 0) AS opening,
           COALESCE(SUM(l.debit)  FILTER (WHERE e.entry_date BETWEEN p_from AND p_to), 0) AS debit,
           COALESCE(SUM(l.credit) FILTER (WHERE e.entry_date BETWEEN p_from AND p_to), 0) AS credit
      FROM public.journal_lines l
      JOIN public.journal_entries e ON e.id = l.entry_id
     WHERE l.owner_id = p_owner AND e.entry_date <= p_to
     GROUP BY l.account_id;
$$;

CREATE OR REPLACE FUNCTION public.accounting_balances_by_property(p_owner UUID, p_as_of DATE, p_accounts UUID[])
RETURNS TABLE (account_id UUID, property_id UUID, balance NUMERIC)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT l.account_id, l.property_id, SUM(l.debit - l.credit)
      FROM public.journal_lines l
      JOIN public.journal_entries e ON e.id = l.entry_id
     WHERE l.owner_id = p_owner AND e.entry_date <= p_as_of AND l.account_id = ANY (p_accounts)
     GROUP BY l.account_id, l.property_id;
$$;

-- p_old NULL: a plain post. The period lock refuses both halves in a closed month.
CREATE OR REPLACE FUNCTION public.accounting_replace_entry(p_owner UUID, p_old UUID, p_entry JSONB, p_lines JSONB)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF p_old IS NOT NULL THEN
        DELETE FROM public.journal_entries WHERE id = p_old AND owner_id = p_owner;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Lançamento a substituir não encontrado' USING ERRCODE = 'no_data_found';
        END IF;
    END IF;
    RETURN public.accounting_post_entry(p_owner, p_entry, p_lines);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accounting_trial_balance(UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accounting_balances_by_property(UUID, DATE, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accounting_replace_entry(UUID, UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_trial_balance(UUID, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.accounting_balances_by_property(UUID, DATE, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.accounting_replace_entry(UUID, UUID, JSONB, JSONB) TO service_role;
