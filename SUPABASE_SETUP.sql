-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Index Metadata Table
CREATE TABLE IF NOT EXISTS public.economic_indexes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE, -- IPCA, IGPM, INPC, IVAR, FIPEZAP
    name TEXT NOT NULL,
    source TEXT NOT NULL, -- IBGE, FGV, FIPE
    frequency TEXT DEFAULT 'monthly',
    category TEXT NOT NULL CHECK (category IN ('inflation', 'rent', 'market')),
    is_official BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.economic_indexes IS 'Static metadata for economic indexes (IPCA, IGPM, etc.)';

-- 2. Index Values Table
CREATE TABLE IF NOT EXISTS public.economic_index_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    index_id UUID NOT NULL REFERENCES public.economic_indexes(id) ON DELETE CASCADE,
    year INT NOT NULL,
    month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    reference_date DATE NOT NULL, -- e.g. 2024-06-01
    value_percent NUMERIC NOT NULL, -- e.g. 0.0042 = 0.42%. Using NUMERIC type for flexible precision vs numeric(6,4) to avoid rounding errors on high precision indices.
    accumulated_12m NUMERIC, -- optional
    is_projection BOOLEAN DEFAULT false,
    source_url TEXT,
    published_at DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_index_year_month UNIQUE (index_id, year, month)
);

COMMENT ON TABLE public.economic_index_values IS 'Time-series data for index values. Unique per index/year/month.';

-- 3. Revision Handling
CREATE TABLE IF NOT EXISTS public.economic_index_revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    index_value_id UUID NOT NULL REFERENCES public.economic_index_values(id) ON DELETE CASCADE,
    previous_value NUMERIC,
    revised_value NUMERIC,
    revision_date DATE DEFAULT CURRENT_DATE,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.economic_index_revisions IS 'Audit trail for revised index values.';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_economic_index_values_index_id ON public.economic_index_values(index_id);
CREATE INDEX IF NOT EXISTS idx_economic_index_values_year_month ON public.economic_index_values(year, month);
CREATE INDEX IF NOT EXISTS idx_economic_index_values_reference_date ON public.economic_index_values(reference_date);
CREATE INDEX IF NOT EXISTS idx_economic_indexes_code ON public.economic_indexes(code);

-- RLS Policies
ALTER TABLE public.economic_indexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.economic_index_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.economic_index_revisions ENABLE ROW LEVEL SECURITY;

-- Policy 1: Everyone can read indexes and values
CREATE POLICY "Public Read Access Indexes" ON public.economic_indexes
    FOR SELECT USING (true);

CREATE POLICY "Public Read Access Values" ON public.economic_index_values
    FOR SELECT USING (true);

CREATE POLICY "Public Read Access Revisions" ON public.economic_index_revisions
    FOR SELECT USING (true);

-- Policy 2: Only Service Role/Admins can Insert/Update/Delete
-- Note: Service Role bypasses RLS automatically. These policies are for authenticated users if you implement admin login.
-- Adjust role name if necessary. Assuming no specific admin role yet, we leave write access restricted to service_role (implicit).

-- Function to automatically update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
CREATE TRIGGER update_economic_indexes_modtime
    BEFORE UPDATE ON public.economic_indexes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_economic_index_values_modtime
    BEFORE UPDATE ON public.economic_index_values
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Seed Initial Metadata
INSERT INTO public.economic_indexes (code, name, source, frequency, category, is_official)
VALUES 
    ('IPCA', 'Índice Nacional de Preços ao Consumidor Amplo', 'IBGE', 'monthly', 'inflation', true),
    ('IGPM', 'Índice Geral de Preços do Mercado', 'FGV', 'monthly', 'rent', true),
    ('INPC', 'Índice Nacional de Preços ao Consumidor', 'IBGE', 'monthly', 'inflation', true),
    ('IVAR', 'Índice de Variação de Aluguéis Residenciais', 'FGV', 'monthly', 'rent', true),
    ('FIPEZAP', 'Índice FipeZAP', 'FIPE', 'monthly', 'market', true),
    ('SELIC', 'Taxa Selic', 'Banco Central', 'monthly', 'market', true),
    ('CDI', 'Certificado de Depósito Interbancário', 'B3', 'monthly', 'market', true)
ON CONFLICT (code) DO NOTHING;

-- Example View: Latest Values for Dashboard
CREATE OR REPLACE VIEW public.vw_latest_indices AS
SELECT DISTINCT ON (i.id)
    i.code,
    i.name,
    v.value_percent,
    v.accumulated_12m,
    v.reference_date,
    v.is_projection
FROM public.economic_indexes i
JOIN public.economic_index_values v ON v.index_id = i.id
ORDER BY i.id, v.year DESC, v.month DESC;
