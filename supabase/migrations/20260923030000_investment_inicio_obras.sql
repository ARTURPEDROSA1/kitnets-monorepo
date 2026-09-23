-- "Início de obras" as a payment kind of its own.
--
-- Off-plan contracts routinely carry a payment tied to the start of construction ("no início de
-- obras"), months or years before the keys. It was landing on OUTROS, which hid it from every
-- reading of the plan; it is not the keys instalment either, and the two can both exist in one
-- contract.
--
-- The kind lists are CHECK constraints created inline with the tables, so their names were assigned
-- by Postgres. They are looked up rather than assumed: a DROP of a guessed name that does not exist
-- would leave the old constraint in place and reject the new value at insert time.

DO $$
DECLARE c RECORD;
BEGIN
    FOR c IN
        SELECT conrelid::regclass AS tbl, conname
        FROM pg_constraint
        WHERE conrelid IN ('public.new_investment_schedules'::regclass, 'public.new_investment_payments'::regclass)
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%kind%'
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
    END LOOP;
END $$;

ALTER TABLE public.new_investment_schedules
    ADD CONSTRAINT new_investment_schedules_kind_check CHECK (kind IN (
        'SINAL', 'ENTRADA', 'PARCELA', 'PARCELA_ANUAL', 'INTERCALADA', 'INICIO_OBRAS',
        'CHAVES', 'AMORTIZACAO', 'CORRECAO', 'TAXAS', 'OUTROS'
    ));

ALTER TABLE public.new_investment_payments
    ADD CONSTRAINT new_investment_payments_kind_check CHECK (kind IN (
        'SINAL', 'ENTRADA', 'PARCELA', 'PARCELA_ANUAL', 'INTERCALADA', 'INICIO_OBRAS',
        'CHAVES', 'AMORTIZACAO', 'CORRECAO', 'TAXAS', 'OUTROS'
    ));
