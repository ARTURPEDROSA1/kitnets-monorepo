-- The KPIs the module was missing: what the unit is expected to be worth at delivery (the main
-- reason to buy off-plan), how far the works are, and what the handover itself costs.
--
--   area_m2, market_m2_price       valorização by size: the unit's private area and a reference
--                                  market R$/m² typed by the owner (FipeZap here is the national
--                                  series, so it gives the trend, not a city price)
--   estimated_value_at_delivery    the owner's own figure; wins over area × R$/m² when both exist
--   construction_pct               progress of the works as the developer last reported it
--   sim_delivery_costs             ITBI, escritura, registro, mobília — a simulator premise drawn
--                                  as one bar in the keys month and counted in payback and TIR

ALTER TABLE public.new_investments
    ADD COLUMN IF NOT EXISTS area_m2 NUMERIC(10, 2)
        CHECK (area_m2 IS NULL OR area_m2 > 0),
    ADD COLUMN IF NOT EXISTS market_m2_price NUMERIC(14, 2)
        CHECK (market_m2_price IS NULL OR market_m2_price >= 0),
    ADD COLUMN IF NOT EXISTS estimated_value_at_delivery NUMERIC(14, 2)
        CHECK (estimated_value_at_delivery IS NULL OR estimated_value_at_delivery >= 0),
    ADD COLUMN IF NOT EXISTS construction_pct NUMERIC(5, 2)
        CHECK (construction_pct IS NULL OR (construction_pct >= 0 AND construction_pct <= 100)),
    ADD COLUMN IF NOT EXISTS construction_updated_on DATE,
    ADD COLUMN IF NOT EXISTS sim_delivery_costs NUMERIC(14, 2) NOT NULL DEFAULT 0
        CHECK (sim_delivery_costs >= 0);

COMMENT ON COLUMN public.new_investments.area_m2 IS 'Área privativa da unidade, em m².';
COMMENT ON COLUMN public.new_investments.market_m2_price IS 'R$/m² de referência do mercado local, informado pelo dono; com a área, estima o valor na entrega.';
COMMENT ON COLUMN public.new_investments.estimated_value_at_delivery IS 'Valor estimado da unidade na entrega das chaves, informado pelo dono; prevalece sobre área × R$/m².';
COMMENT ON COLUMN public.new_investments.construction_pct IS 'Andamento da obra (0–100), como a construtora informou por último.';
COMMENT ON COLUMN public.new_investments.construction_updated_on IS 'Data do último relatório de andamento da obra.';
COMMENT ON COLUMN public.new_investments.sim_delivery_costs IS 'Premissa do simulador: custos na entrega (ITBI, escritura, registro, mobília), em R$, lançados no mês das chaves.';
