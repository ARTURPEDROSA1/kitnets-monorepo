---
description: Comprehensive implementation plan for the Kitnets Water Consumption Dashboard (v1.0).
---

# Water Consumption Dashboard - Implementation Plan (v1.0)

## Objective

Provide landlords and property operators with a clear, auditable, and multi-granularity view of water consumption, derived from main utility meters and unit-level submeters.

## Phasing Strategy

- **Phase 1 (Current Focus)**: Dashboard UI/UX, Granular Visualization (Daily/Monthly/Yearly), KPI Cards.
- **Phase 1.5 (Hourly Granularity)**: Implement Hourly Sync on Gateway and Hourly Visualization on Dashboard.
- **Phase 2 (Next)**: Billing & Cost Allocation (Manual Bill Entry, Cost Calculation).
- **Phase 3 (Future)**: Permissions (RLS) & Multi-Tenancy.

---

# Phase 1: Dashboard UI & Visualization (Mandatory)

## 1. Database Schema Alignment

Ensure the database supports the new dashboard requirements (grouping by property, meter types, etc.).

**SQL Updates needed:**

```sql
-- 1. Enhance 'meters' table for hierarchy and metadata
ALTER TABLE public.meters 
ADD COLUMN IF NOT EXISTS gateway_id UUID REFERENCES public.gateways(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE, -- To link meters to properties
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'water', -- 'water', 'electricity', 'gas'
ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'L', -- 'L' or 'm3'
ADD COLUMN IF NOT EXISTS is_main_meter BOOLEAN DEFAULT false, -- True if this is the utility company meter
ADD COLUMN IF NOT EXISTS pulse_factor NUMERIC DEFAULT 1.0; -- NOT NEEDED for calculation, but good for auditing hardware config.

-- 2. Create 'properties' table if not exists (for Property Selector)
CREATE TABLE IF NOT EXISTS public.properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Hourly Readings Table (Phase 1.5)
CREATE TABLE IF NOT EXISTS public.meter_readings_hourly (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meter_id TEXT REFERENCES public.meters(id) ON DELETE CASCADE,
    value NUMERIC NOT NULL, -- Incremental consumption for this hour
    start_time TIMESTAMPTZ NOT NULL, -- e.g. 2026-01-26 14:00:00
    end_time TIMESTAMPTZ NOT NULL,   -- e.g. 2026-01-26 15:00:00
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_hourly_reading UNIQUE (meter_id, start_time)
);
```

## 2. UI Components & Layout (New Features)

### 2.1 Navigation & Scope Selectors (Top Bar)

- **Property Selector**: Dropdown to filter downstream data by Property ID.
- **Meter Selector**:
  - "Main Meter" (Utility)
  - "All Units" (Aggregated)
  - Individual Unit Meters
- **Date Range Picker**:
  - Presets: "Today", "Last 7 Days", "This Month", "Last Month", "This Year".
  - Custom Range: Calendar input.

### 2.2 KPI Cards (Reactive)

Create a `KPIGrid` component containing:

1. **Total Consumption**: Value in L or m³ (auto-switch based on magnitude).
2. **Estimated Cost**: Phase 1 Placeholder.
3. **Average per Day**: `Total / Days`.
4. **Peak Day**: Date & Value of highest usage.
5. **Baseline vs Previous**: % change vs previous period.

### 2.3 Visualization Tabs (Charts)

Create a `ConsumptionTabs` component using `recharts` and `shadcn/ui` Tabs:

- **Tab A - Daily (Default)**:
  - Bar Chart: Daily totals.
  - Tooltip: L/m³.
- **Tab B - Monthly**:
  - Bar Chart: Monthly totals.
  - Trend line.
- **Tab C - Yearly**:
  - Bar Chart: 12 months.
- **Tab D - Hourly (Phase 1.5)**:
  - Source: `meter_readings_hourly`.
  - 24h Bar Chart.
  - Clock View (Radial).

---

# Phase 1.5: Hourly Sync Implementation (Gateway -> Supabase)

1. **Gateway Logic**: Modification of `scheduler.ts` to accumulate pulses into 1-hour buckets (00:00-01:00, etc.) in a local SQLite table `hourly_queue`.
2. **Sync Service**: Every 5 minutes, push completed hourly buckets to Supabase `meter_readings_hourly`.
3. **Supabase**: Store in the new table.

---

# Phase 2: Billing & Allocation (Next)

- **Schema**: Tables for `utility_bills`.
- **UI**: "Bill Upload" form.
- **Logic**: Calculate `Effective Rate`.

# Phase 3: Permissions

- RLS Policies.
