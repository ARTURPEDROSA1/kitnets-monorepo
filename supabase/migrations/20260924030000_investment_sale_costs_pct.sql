-- Custos da venda as a % of the sale price, not R$: corretagem is 5–6% of the price, and that is
-- the figure the owner knows (same correction as 20260923230000 for the delivery costs). A sale
-- already registered with a R$ figure keeps its share.

ALTER TABLE public.new_investments
    ADD COLUMN IF NOT EXISTS sale_costs_pct NUMERIC(5, 2) NOT NULL DEFAULT 0
        CHECK (sale_costs_pct >= 0 AND sale_costs_pct <= 100);

UPDATE public.new_investments
SET sale_costs_pct = LEAST(100, ROUND(sale_costs / sale_price * 100, 2))
WHERE sale_price IS NOT NULL AND sale_price > 0 AND sale_costs > 0;

ALTER TABLE public.new_investments
    DROP COLUMN IF EXISTS sale_costs;

COMMENT ON COLUMN public.new_investments.sale_costs_pct IS 'Custos da venda (corretagem, certidões, IR sobre o ganho) como % do preço de venda.';
