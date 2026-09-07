-- ============================================================
-- Phase 3: Solar Energy Bills & Consumption History Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. ENERGY BILLS TABLE
CREATE TABLE IF NOT EXISTS public.energy_bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,

    -- Concessionaire & Consumer Unit
    utility_company TEXT DEFAULT 'CEMIG',
    consumer_unit TEXT NOT NULL,                   -- N.º da Unidade Consumidora (ex: 2.777.942.018-25)
    installation_class TEXT,                       -- ex: Residencial Trifásico, Bifásico, Monofásico
    tariff_modality TEXT,                          -- ex: Convencional B1

    -- Cycle Dates & Timing
    reference_month TEXT NOT NULL,                 -- Format "YYYY-MM" for sorting (ex: 2026-08)
    reference_month_label TEXT,                    -- Display label (ex: AGO/2026)
    reading_date_current DATE,                     -- Leitura Atual (ex: 2026-08-29)
    reading_date_previous DATE,                    -- Leitura Anterior (ex: 2026-07-30)
    reading_date_next DATE,                        -- Próxima Leitura (ex: 2026-09-29)
    billing_days INTEGER DEFAULT 30,               -- Nº de dias de faturamento (ex: 30)
    due_date DATE,                                 -- Vencimento (ex: 2026-09-17)

    -- Active Grid Consumption (Consumo da Rede)
    meter_number TEXT,                             -- Número do Medidor (ex: PRB212101622)
    grid_reading_previous NUMERIC,                 -- Leitura Anterior (ex: 4011)
    grid_reading_current NUMERIC,                  -- Leitura Atual (ex: 4149)
    grid_consumption_kwh NUMERIC NOT NULL,         -- Consumo medido no mês (ex: 138 kWh)
    daily_avg_kwh NUMERIC,                         -- Média kWh/Dia (ex: 4.60)
    monthly_avg_kwh NUMERIC,                       -- Média móvel histórica (ex: 730 kWh)

    -- Solar Distributed Generation (GD / SCEE)
    injected_reading_previous NUMERIC,             -- Leitura Anterior Injetada (ex: 702)
    injected_reading_current NUMERIC,              -- Leitura Atual Injetada (ex: 919)
    solar_injected_kwh NUMERIC DEFAULT 0,          -- Energia Injetada no mês (ex: 217 kWh)
    solar_compensated_kwh NUMERIC DEFAULT 0,       -- Energia Compensada GD II (ex: 46 kWh)
    generation_balance_kwh NUMERIC DEFAULT 0,      -- SALDO ATUAL DE GERAÇÃO (ex: 441.24 kWh)

    -- Financial Items (Itemização da Fatura)
    unit_price NUMERIC,                            -- Preço Unitário efetivo (ex: 1.18002201 R$/kWh)
    availability_cost_kwh NUMERIC DEFAULT 100,     -- Custo de Disponibilidade em kWh (Trifásico=100, Bifásico=50, Monofásico=30)
    availability_cost_amount NUMERIC DEFAULT 0,    -- Custo de Disponibilidade em R$ (ex: 117.98)
    energy_scee_exempt_amount NUMERIC DEFAULT 0,   -- Energia SCEE ISENTA (ex: 28.70)
    energy_compensated_amount NUMERIC DEFAULT 0,   -- Energia compensada GD II (ex: -21.29)
    availability_adjustment_amount NUMERIC DEFAULT 0, -- Ajuste Custo Disponibilidade (ex: -7.40)
    bonus_discounts_amount NUMERIC DEFAULT 0,      -- Bônus Itaipu / descontos (ex: -8.21)
    flag_type TEXT DEFAULT 'Verde',                -- Bandeira Tarifária: Verde, Amarela, Vermelha 1, Vermelha 2
    flag_amount NUMERIC DEFAULT 0,                 -- Custo adicional de bandeira (ex: 2.24)
    taxes_icms NUMERIC DEFAULT 0,                  -- ICMS retido (ex: 21.23)
    taxes_pis_cofins NUMERIC DEFAULT 0,            -- PIS/COFINS (ex: 4.54)
    total_amount NUMERIC NOT NULL DEFAULT 0,       -- VALOR A PAGAR (ex: 109.78)

    -- Solar Performance & Economic Insights
    estimated_savings_amount NUMERIC GENERATED ALWAYS AS (
        ROUND(COALESCE(solar_injected_kwh, 0) * COALESCE(unit_price, 0), 2)
    ) STORED,
    solar_coverage_ratio NUMERIC GENERATED ALWAYS AS (
        CASE WHEN grid_consumption_kwh > 0
             THEN ROUND((COALESCE(solar_injected_kwh, 0) / grid_consumption_kwh) * 100, 1)
             ELSE NULL
        END
    ) STORED,

    -- Ingestion Metadata
    is_historical_only BOOLEAN DEFAULT FALSE,      -- TRUE if generated from historical 13-month table
    historical_consumption_raw JSONB DEFAULT '[]'::jsonb, -- Raw snapshot of the 13-month table
    items_breakdown JSONB DEFAULT '[]'::jsonb,     -- Full line item list from invoice
    extraction_confidence NUMERIC,
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_energy_bill_per_property_month
        UNIQUE (property_id, reference_month)
);

-- 2. INDEXES
CREATE INDEX IF NOT EXISTS idx_energy_bills_property_month
    ON public.energy_bills (property_id, reference_month DESC);
CREATE INDEX IF NOT EXISTS idx_energy_bills_consumer_unit
    ON public.energy_bills (consumer_unit);
CREATE INDEX IF NOT EXISTS idx_energy_bills_due_date
    ON public.energy_bills (due_date DESC);

-- 3. RLS POLICIES
ALTER TABLE public.energy_bills ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Owners can view own energy bills"
        ON public.energy_bills FOR SELECT
        USING (property_id IN (
            SELECT id FROM public.properties
            WHERE owner_id IN (
                SELECT id FROM public.profiles
                WHERE clerk_id = (SELECT auth.jwt() ->> 'sub')
            )
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "Owners can manage own energy bills"
        ON public.energy_bills FOR ALL
        USING (property_id IN (
            SELECT id FROM public.properties
            WHERE owner_id IN (
                SELECT id FROM public.profiles
                WHERE clerk_id = (SELECT auth.jwt() ->> 'sub')
            )
        ))
        WITH CHECK (property_id IN (
            SELECT id FROM public.properties
            WHERE owner_id IN (
                SELECT id FROM public.profiles
                WHERE clerk_id = (SELECT auth.jwt() ->> 'sub')
            )
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. RPC FUNCTIONS
CREATE OR REPLACE FUNCTION get_property_energy_bills(p_property_id UUID)
RETURNS SETOF public.energy_bills
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT * FROM public.energy_bills
    WHERE property_id = p_property_id
    ORDER BY reference_month DESC;
$$;
