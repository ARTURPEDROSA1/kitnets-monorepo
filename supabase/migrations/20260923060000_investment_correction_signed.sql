-- The index correction of a payment may be negative.
--
-- The ledger now takes what was actually paid — the figure on the receipt — and derives the
-- correction from it: correção = valor pago − valor da parcela. That is positive when CUB/INCC has
-- accrued, and negative when the developer discounts an anticipated instalment, which is the usual
-- reason to pay one early in the first place. The old CHECK (>= 0) would reject exactly that.
--
-- `amount` stays non-negative: it is the contracted instalment, not a movement.
--
-- The constraint was created inline with the table, so its name was assigned by Postgres and is
-- looked up rather than assumed.

DO $$
DECLARE c RECORD;
BEGIN
    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.new_investment_payments'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%correction_amount%'
    LOOP
        EXECUTE format('ALTER TABLE public.new_investment_payments DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;

COMMENT ON COLUMN public.new_investment_payments.correction_amount IS
    'Valor pago menos o valor contratado da parcela: positivo quando houve correção (CUB/INCC), negativo quando houve desconto por antecipação.';
