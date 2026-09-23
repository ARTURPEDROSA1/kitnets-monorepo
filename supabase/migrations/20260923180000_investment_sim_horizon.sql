-- The cash-flow simulator's horizon is one of its assumptions, and the only one that was not
-- stored: every other field survived a reload, this one snapped back to ten years. Now the
-- simulator saves each field as it changes, so all of them need a column.

ALTER TABLE public.new_investments
    ADD COLUMN IF NOT EXISTS sim_horizon_months INTEGER NOT NULL DEFAULT 120
        CHECK (sim_horizon_months >= 12 AND sim_horizon_months <= 480);

COMMENT ON COLUMN public.new_investments.sim_horizon_months IS
    'Horizonte do simulador de fluxo de caixa, em meses de aluguel a partir do primeiro.';
