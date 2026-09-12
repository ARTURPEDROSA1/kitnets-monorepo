-- Meter Readings Table
CREATE TABLE IF NOT EXISTS public.meter_readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meter_id TEXT NOT NULL,
    value NUMERIC NOT NULL, -- The counter reading
    read_at TIMESTAMPTZ NOT NULL, -- When the gateway took the reading
    synced_at TIMESTAMPTZ DEFAULT NOW(), -- When it reached the cloud
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Optional: Link to a gateway device if you have a devices table
    -- gateway_id UUID REFERENCES gateways(id)
    
    -- Constraint to prevent duplicate readings for the same timestamp?
    -- Maybe just an index for now.
    CONSTRAINT unique_reading_per_meter_time UNIQUE (meter_id, read_at)
);

COMMENT ON TABLE public.meter_readings IS 'Raw meter readings synced from Edge Gateways.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meter_readings_meter_id ON public.meter_readings(meter_id);
CREATE INDEX IF NOT EXISTS idx_meter_readings_read_at ON public.meter_readings(read_at);

-- RLS
ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;

-- Policy: Only Service Role can insert/update/delete.
-- Public read access? Probably not. Maybe specific users.
-- For now, restrictive.

-- Allow Service Role full access (implicit)
