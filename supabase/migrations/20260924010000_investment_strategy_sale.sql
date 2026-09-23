-- Projetos beyond the off-plan unit: what kind of project it is, how it is meant to end, and the
-- sale when it ends that way.
--
--   strategy    NA_PLANTA (the only one the import understands today) · TERRENO (land + build) ·
--               REFORMA (buy, refurbish) · LEILAO (auction purchase). Switches labels and the
--               default cost kinds; the ledger and the simulator are the same machinery.
--   exit_plan   ALUGAR (finish with "Mover para Imóveis") · VENDER (finish with "Registrar venda").
--   sold_on / sale_price / sale_costs   the sale, when registered: the project's status becomes
--               SOLD and the realized gain and TIR are computed from what was actually paid.
--
-- The status list is a CHECK created inline with the table, so its name was assigned by Postgres
-- and is looked up rather than guessed (see 20260923030000).

ALTER TABLE public.new_investments
    ADD COLUMN IF NOT EXISTS strategy TEXT NOT NULL DEFAULT 'NA_PLANTA'
        CHECK (strategy IN ('NA_PLANTA', 'TERRENO', 'REFORMA', 'LEILAO')),
    ADD COLUMN IF NOT EXISTS exit_plan TEXT NOT NULL DEFAULT 'ALUGAR'
        CHECK (exit_plan IN ('ALUGAR', 'VENDER')),
    ADD COLUMN IF NOT EXISTS sold_on DATE,
    ADD COLUMN IF NOT EXISTS sale_price NUMERIC(14, 2)
        CHECK (sale_price IS NULL OR sale_price >= 0),
    ADD COLUMN IF NOT EXISTS sale_costs NUMERIC(14, 2) NOT NULL DEFAULT 0
        CHECK (sale_costs >= 0);

DO $$
DECLARE c RECORD;
BEGIN
    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.new_investments'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE public.new_investments DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;

ALTER TABLE public.new_investments
    ADD CONSTRAINT new_investments_status_check CHECK (status IN ('ACTIVE', 'COMPLETED', 'SOLD', 'ARCHIVED'));

COMMENT ON COLUMN public.new_investments.strategy IS 'Modalidade do projeto: NA_PLANTA, TERRENO (terreno + construção), REFORMA, LEILAO.';
COMMENT ON COLUMN public.new_investments.exit_plan IS 'Como o projeto termina: ALUGAR (vira imóvel da carteira) ou VENDER (registra a venda).';
COMMENT ON COLUMN public.new_investments.sold_on IS 'Data da venda, quando registrada; o status passa a SOLD.';
COMMENT ON COLUMN public.new_investments.sale_price IS 'Preço de venda bruto.';
COMMENT ON COLUMN public.new_investments.sale_costs IS 'Custos da venda (corretagem, certidões, imposto de renda sobre o ganho), em R$.';
