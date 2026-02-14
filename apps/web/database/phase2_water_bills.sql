-- ============================================================
-- Phase 2: Water Bills Schema + Historical Seed Data
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. PROPERTIES TABLE — add missing columns
-- (Table already exists from Phase 1 with: id, name, owner_id, created_at, updated_at)
-- ============================================================
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS zip TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS connection_code TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS cadastral_map TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS electronic_id TEXT;

-- RLS (skip if already enabled / policies exist)
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Owners can view own properties"
        ON public.properties FOR SELECT
        USING (owner_id IN (
            SELECT id FROM public.profiles
            WHERE clerk_id = (SELECT auth.jwt() ->> 'sub')
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "Owners can manage own properties"
        ON public.properties FOR ALL
        USING (owner_id IN (
            SELECT id FROM public.profiles
            WHERE clerk_id = (SELECT auth.jwt() ->> 'sub')
        ))
        WITH CHECK (owner_id IN (
            SELECT id FROM public.profiles
            WHERE clerk_id = (SELECT auth.jwt() ->> 'sub')
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- 2. WATER BILLS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.water_bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,

    -- Billing reference
    reference_month TEXT NOT NULL,          -- ISO "2026-01" for sorting

    -- Meter info
    meter_number TEXT,                      -- Physical hydrometer serial
    previous_reading NUMERIC,              -- L. ANTERIOR
    current_reading NUMERIC,               -- L. ATUAL
    consumption_m3 NUMERIC NOT NULL,       -- CONS. REAL (m3)
    billed_consumption_m3 NUMERIC,         -- CONS. FATURADO (m3)

    -- Dates
    reading_date DATE,                     -- Data de leitura
    due_date DATE,                         -- Vencimento

    -- Charges (BRL) — itemized from bill
    water_tariff NUMERIC DEFAULT 0,        -- TARIFA DE AGUA
    sewage_tariff NUMERIC DEFAULT 0,       -- TARIFA DE ESGOTO
    water_basic_fee NUMERIC DEFAULT 0,     -- TBOA
    sewage_basic_fee NUMERIC DEFAULT 0,    -- TBOE
    total_amount NUMERIC NOT NULL,         -- VALOR A PAGAR

    -- Derived: effective rate (auto-calculated)
    effective_rate_per_m3 NUMERIC GENERATED ALWAYS AS (
        CASE WHEN consumption_m3 > 0
             THEN ROUND(total_amount / consumption_m3, 2)
             ELSE NULL
        END
    ) STORED,

    -- Metadata
    occurrence_code TEXT,
    average_consumption_m3 NUMERIC,        -- MEDIA from bill
    bill_pdf_url TEXT,                     -- Stored PDF link
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_bill_per_property_month
        UNIQUE (property_id, reference_month)
);

ALTER TABLE public.water_bills ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Owners can view own bills"
        ON public.water_bills FOR SELECT
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
    CREATE POLICY "Owners can manage own bills"
        ON public.water_bills FOR ALL
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


-- 3. LINK GATEWAYS TO PROPERTIES
-- ============================================================
ALTER TABLE public.gateways
    ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL;


-- 4. INDEX FOR PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_water_bills_property_month
    ON public.water_bills (property_id, reference_month DESC);

CREATE INDEX IF NOT EXISTS idx_water_bills_due_date
    ON public.water_bills (due_date DESC);


-- ============================================================
-- SEED DATA
-- ============================================================

-- 5a. Create the property
INSERT INTO public.properties (
    id, name, address, city, state, zip,
    connection_code, cadastral_map, electronic_id
) VALUES (
    'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    'Vila Jose Lopes 35',
    'RUA CLAUDIONOR IDELFONSO BRAGA, 35 - VILA JOSE LOPES',
    'ITABIRITO',
    'MG',
    '35450-272',
    '22677-9',
    '16 - 02 - 1610',
    '90222677@16'
) ON CONFLICT (id) DO NOTHING;


-- 5b. Link the existing gateway to this property
UPDATE public.gateways
SET property_id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
WHERE id = '587ea104-bca7-4af2-8c47-52b642d51e14';

-- 5b2. Set property owner from gateway owner (required for RLS)
UPDATE public.properties
SET owner_id = (
    SELECT owner_id FROM public.gateways
    WHERE id = '587ea104-bca7-4af2-8c47-52b642d51e14'
)
WHERE id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
  AND owner_id IS NULL;


-- 5c. Seed 12 months of historical water bills
-- Source: SAAE Itabirito — Hidrometro Y21SG1602635
-- ============================================================
INSERT INTO public.water_bills (
    property_id, reference_month, meter_number,
    previous_reading, current_reading,
    consumption_m3, billed_consumption_m3,
    reading_date, due_date,
    water_tariff, sewage_tariff, water_basic_fee, sewage_basic_fee,
    total_amount, occurrence_code
) VALUES

-- Jan 2026 (full itemized breakdown from PDF)
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '2026-01', 'Y21SG1602635',
 520, 573, 53, 53,
 '2026-01-20', '2026-02-18',
 303.83, 182.30, 21.88, 13.13,
 521.14, '33'),

-- Dec 2025
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '2025-12', 'Y21SG1602635',
 480, 520, 40, 40,
 '2025-12-19', '2026-01-18',
 0, 0, 0, 0,
 351.49, '0'),

-- Nov 2025
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '2025-11', 'Y21SG1602635',
 434, 480, 46, 46,
 '2025-11-21', '2025-12-18',
 0, 0, 0, 0,
 428.10, '33'),

-- Oct 2025
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '2025-10', 'Y21SG1602635',
 392, 434, 42, 42,
 '2025-10-23', '2025-11-18',
 0, 0, 0, 0,
 377.03, '33'),

-- Sep 2025
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '2025-09', 'Y21SG1602635',
 363, 392, 29, 29,
 '2025-09-23', '2025-10-18',
 0, 0, 0, 0,
 225.62, '0'),

-- Aug 2025
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '2025-08', 'Y21SG1602635',
 341, 363, 22, 22,
 '2025-08-22', '2025-09-18',
 0, 0, 0, 0,
 154.93, '0'),

-- Jul 2025
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '2025-07', 'Y21SG1602635',
 323, 341, 18, 18,
 '2025-07-23', '2025-08-18',
 0, 0, 0, 0,
 112.45, '3'),

-- Jun 2025
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '2025-06', 'Y21SG1602635',
 295, 323, 28, 28,
 '2025-06-24', '2025-07-18',
 0, 0, 0, 0,
 204.20, '0'),

-- May 2025
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '2025-05', 'Y21SG1602635',
 270, 295, 25, 25,
 '2025-05-22', '2025-06-18',
 0, 0, 0, 0,
 174.24, '0'),

-- Apr 2025
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '2025-04', 'Y21SG1602635',
 243, 270, 27, 27,
 '2025-04-24', '2025-05-18',
 0, 0, 0, 0,
 194.21, '0'),

-- Mar 2025
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '2025-03', 'Y21SG1602635',
 224, 243, 19, 19,
 '2025-03-25', '2025-04-18',
 0, 0, 0, 0,
 180.80, '0'),

-- Feb 2025
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '2025-02', 'Y21SG1602635',
 185, 224, 39, 39,
 '2025-02-24', '2025-03-18',
 0, 0, 0, 0,
 382.79, '33')

ON CONFLICT (property_id, reference_month) DO NOTHING;


-- ============================================================
-- VERIFICATION QUERIES (uncomment and run after seeding)
-- ============================================================

-- SELECT reference_month, consumption_m3, total_amount, effective_rate_per_m3, reading_date
-- FROM water_bills
-- WHERE property_id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
-- ORDER BY reference_month DESC;

-- SELECT * FROM properties WHERE id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

-- SELECT id, label, property_id FROM gateways WHERE id = '587ea104-bca7-4af2-8c47-52b642d51e14';
