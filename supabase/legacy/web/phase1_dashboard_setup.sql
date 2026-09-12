-- Phase 1 Dashboard Setup
-- 1. Create Properties Table
CREATE TABLE IF NOT EXISTS public.properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for Properties
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Read Properties" ON public.properties FOR SELECT USING (true); -- For now, or restrict to owner
CREATE POLICY "Owners can manage properties" ON public.properties USING (auth.uid() IN (SELECT clerk_id FROM profiles WHERE id = owner_id));

-- 2. Enhance Meters Table
ALTER TABLE public.meters 
ADD COLUMN IF NOT EXISTS gateway_id UUID REFERENCES public.gateways(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'water',
ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'L',
ADD COLUMN IF NOT EXISTS is_main_meter BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pulse_factor NUMERIC DEFAULT 1.0;

-- 3. Create Anomalies Table (Placeholder for Phase 1.5)
CREATE TABLE IF NOT EXISTS public.meter_anomalies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meter_id TEXT REFERENCES public.meters(id) ON DELETE CASCADE,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    severity TEXT CHECK (severity IN ('low', 'medium', 'high')),
    type TEXT,
    description TEXT,
    resolved BOOLEAN DEFAULT false
);

-- 4. Create Hourly Readings Table (For Phase 1.5 Sync)
CREATE TABLE IF NOT EXISTS public.meter_readings_hourly (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meter_id TEXT REFERENCES public.meters(id) ON DELETE CASCADE,
    value NUMERIC NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_hourly_reading UNIQUE (meter_id, start_time)
);
