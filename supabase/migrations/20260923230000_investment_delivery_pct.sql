-- Two corrections from the first day of use of the KPI batch (20260923210000):
--
--   sim_delivery_costs_pct   the handover costs as a % of the total cost instead of a R$ figure —
--                            ITBI is 2–3% of the value and escritura + registro about 1%, so a
--                            percentage is what the owner knows; the R$ column had nothing typed
--                            in it yet and goes away
--   expected_appreciation_pct  "the unit will be worth X% more at delivery" — the third way to
--                            state the delivery value (after a typed value and area × R$/m²),
--                            and the one the owner reached for first

ALTER TABLE public.new_investments
    ADD COLUMN IF NOT EXISTS sim_delivery_costs_pct NUMERIC(5, 2) NOT NULL DEFAULT 0
        CHECK (sim_delivery_costs_pct >= 0 AND sim_delivery_costs_pct <= 100),
    ADD COLUMN IF NOT EXISTS expected_appreciation_pct NUMERIC(7, 2)
        CHECK (expected_appreciation_pct IS NULL OR (expected_appreciation_pct >= 0 AND expected_appreciation_pct <= 1000)),
    DROP COLUMN IF EXISTS sim_delivery_costs;

COMMENT ON COLUMN public.new_investments.sim_delivery_costs_pct IS
    'Premissa do simulador: custos na entrega (ITBI, escritura, registro) como % do custo total, lançados no mês das chaves.';
COMMENT ON COLUMN public.new_investments.expected_appreciation_pct IS
    'Valorização esperada até a entrega, % sobre o custo total; usada quando não há valor na entrega nem área × R$/m².';
