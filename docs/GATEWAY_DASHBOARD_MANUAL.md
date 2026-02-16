# Kitnets Gateway Dashboard — Software Manual

**Version:** 2.1  
**Last updated:** 2026-02-16  
**Author:** Kitnets Engineering

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Edge Gateway (`apps/edge-gateway`)](#3-edge-gateway)
   - 3.1 [Technology Stack](#31-technology-stack)
   - 3.2 [Directory Structure](#32-directory-structure)
   - 3.3 [Configuration (`config.ts`)](#33-configuration)
   - 3.4 [Database (`database/db.ts`)](#34-database)
   - 3.5 [Modbus Service (`services/modbus.ts`)](#35-modbus-service)
   - 3.6 [Scheduler (`services/scheduler.ts`)](#36-scheduler)
   - 3.7 [Sync Service (`services/sync.ts`)](#37-sync-service)
   - 3.8 [State Persistence (`services/state.ts`)](#38-state-persistence)
   - 3.9 [API Endpoints (Fastify)](#39-api-endpoints)
   - 3.10 [Local Web Dashboard](#310-local-web-dashboard)
4. [Cloud Ingestion API (`apps/web/src/app/api/gateways/ingest`)](#4-cloud-ingestion-api)
5. [Supabase Database Schema](#5-supabase-database-schema)
6. [Web Dashboard (`apps/web/src/app/[lang]/dashboard`)](#6-web-dashboard)
   - 6.1 [Dashboard Home](#61-dashboard-home)
   - 6.2 [Gateway Detail Page](#62-gateway-detail-page)
   - 6.3 [Billing History Page](#63-billing-history-page)
   - 6.4 [Manual Bill Entry Page](#64-manual-bill-entry-page)
7. [Shared UI Components](#7-shared-ui-components)
8. [Data Flow — End to End](#8-data-flow--end-to-end)
9. [Deployment](#9-deployment)
   - 9.1 [Edge Gateway Deployment](#91-edge-gateway-deployment)
   - 9.2 [Web App Deployment](#92-web-app-deployment)
10. [Troubleshooting](#10-troubleshooting)
11. [Environment Variables](#11-environment-variables)

---

## 1. System Overview

The Kitnets Gateway Dashboard is an **IoT water metering solution** that collects real-time consumption data from physical water meters (via Modbus PLC), stores it locally on an edge device, syncs it to the cloud (Supabase via Vercel API), and visualizes it on a premium web dashboard.

**Key capabilities:**

- Real-time pulse-based water meter reading via Modbus TCP
- Local SQLite storage with daily/monthly aggregation
- Store-and-forward cloud sync (resilient to network outages)
- Self-healing auto-reboot after 10 consecutive sync failures
- Interactive web dashboard with KPIs, charts, date range filters
- Utility bill management (manual entry + OCR/AI extraction from PDF/images)
- Cost estimation based on latest billing rates
- Per-meter cost allocation (equal and proportional split)

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      PHYSICAL LAYER                          │
│                                                              │
│   ┌───────────┐    Modbus TCP    ┌──────────────────────┐   │
│   │  Water     │◄───────────────►│  PLC (e.g. Click)    │   │
│   │  Meters    │   Pulse Counting│  192.168.1.123:502    │   │
│   │  (5x)      │                 └──────────┬───────────┘   │
│   └───────────┘                              │               │
│                                              │               │
│                         ┌────────────────────┘               │
│                         ▼                                    │
│              ┌─────────────────────┐                         │
│              │  Edge Gateway       │                         │
│              │  (Raspberry Pi)     │                         │
│              │                     │                         │
│              │  Node.js + Fastify  │                         │
│              │  SQLite Database    │                         │
│              │  :3000 (Local UI)   │                         │
│              └────────┬────────────┘                         │
│                       │ HTTP POST (every 5 min)              │
└───────────────────────┼──────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│                      CLOUD LAYER                             │
│                                                              │
│   ┌──────────────────────────┐    ┌────────────────────┐    │
│   │ Vercel (Next.js)         │    │ Supabase           │    │
│   │                          │    │                    │    │
│   │ POST /api/gateways/ingest│───►│ meter_readings     │    │
│   │ (x-gateway-token auth)   │    │ gateways           │    │
│   │                          │    │ meters             │    │
│   │ GET /dashboard/gateway/* │◄───│ property_bills     │    │
│   │ GET /dashboard/billing/* │◄───│ profiles           │    │
│   └──────────────────────────┘    └────────────────────┘    │
│                                                              │
│   ┌──────────────────────────┐                               │
│   │ Clerk (Auth)             │                               │
│   │ User authentication      │                               │
│   └──────────────────────────┘                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Edge Gateway

**Location:** `apps/edge-gateway/`

The edge gateway runs on a Raspberry Pi (or any Linux device) connected to the PLC via the local network. It polls Modbus registers, computes consumption, stores data locally, and pushes it to the cloud.

### 3.1 Technology Stack

| Technology   | Purpose                                    |
|--------------|--------------------------------------------|
| Node.js v18+ | Runtime                                    |
| TypeScript   | Language                                   |
| Fastify      | HTTP server (API + static file serving)    |
| modbus-serial| Modbus TCP communication with PLC          |
| SQLite3      | Local persistent storage                   |
| node-cron    | Scheduled tasks (daily/monthly processing) |
| node-fetch   | HTTP client for cloud sync                 |
| dotenv       | Environment variable loading               |

### 3.2 Directory Structure

```
apps/edge-gateway/
├── src/
│   ├── index.ts              # Main server (Fastify routes + startup)
│   ├── config.ts             # Configuration from .env
│   ├── types.ts              # TypeScript interfaces
│   ├── database/
│   │   └── db.ts             # SQLite database (schema + CRUD)
│   ├── services/
│   │   ├── modbus.ts         # Modbus polling & counter management
│   │   ├── scheduler.ts      # Cron jobs (daily/monthly/sync)
│   │   ├── sync.ts           # Store-and-forward cloud sync
│   │   ├── state.ts          # Runtime state persistence (JSON file)
│   │   └── mqtt.ts           # DEPRECATED (replaced by sync.ts)
│   └── utils/
│       └── date.ts           # Date utility (getLocalDateStr)
├── client/                    # Local React dashboard (Vite)
├── data/                      # SQLite database file location
├── .env                       # Configuration
├── install.sh                 # Auto-installer script
├── update.sh                  # Update script
├── kitnets-gateway.service   # systemd unit file
├── MANUAL.md                 # Existing user manual
└── DEPLOY.md                 # Deployment guide
```

### 3.3 Configuration

**File:** `src/config.ts`

```typescript
export const CONFIG = {
    MODBUS: {
        HOST: '192.168.1.123',     // PLC IP address
        PORT: 502,                  // Modbus TCP standard port
        UNIT_ID: 1,                 // Modbus Slave ID
        TIMEOUT: 2000,              // Connection timeout (ms)
        POLL_INTERVAL_MS: 1000,     // Polling frequency
    },
    SERVER: {
        PORT: 3000,                 // Local web dashboard port
        HOST: '0.0.0.0',           // Bind to all interfaces
    }
};
```

All values are overridable via environment variables (`MODBUS_HOST`, `MODBUS_PORT`, etc.).

### 3.4 Database

**File:** `src/database/db.ts`  
**Engine:** SQLite3  
**Location:** `data/kitnets-gateway.db`

#### Tables

| Table               | Purpose                                         |
|---------------------|-------------------------------------------------|
| `system_settings`   | Key-value config (Modbus host, cloud sync URL)  |
| `meter_config`      | Meter definitions (IDs, register addresses, etc)|
| `daily_snapshots`   | End-of-day counter snapshots per meter           |
| `monthly_consumption`| Monthly aggregations (liters + m³)              |
| `readings_queue`    | Store-and-forward queue for cloud sync           |

#### `meter_config` schema

```sql
CREATE TABLE meter_config (
    meter_id TEXT PRIMARY KEY,
    display_name TEXT,
    pulse_volume_liters REAL DEFAULT 10.0,  -- Liters per pulse
    counter_lsb_register INTEGER,           -- Modbus register (LSB)
    counter_msb_register INTEGER,           -- Modbus register (MSB)
    physical_meter_offset_m3 REAL DEFAULT 0.0, -- Physical meter offset
    enabled INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `daily_snapshots` schema

```sql
CREATE TABLE daily_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meter_id TEXT REFERENCES meter_config(meter_id),
    date TEXT,                               -- "2026-02-14"
    counter_value_end_day INTEGER,
    counter_value_prev_day INTEGER,
    delta_pulses INTEGER,
    daily_liters REAL,
    effective_m3 REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(meter_id, date)
);
```

#### `monthly_consumption` schema

```sql
CREATE TABLE monthly_consumption (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meter_id TEXT REFERENCES meter_config(meter_id),
    year INTEGER,
    month INTEGER,
    monthly_liters REAL,
    monthly_m3 REAL,
    source_days_count INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(meter_id, year, month)
);
```

#### `readings_queue` schema

```sql
CREATE TABLE readings_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meter_id TEXT,
    value REAL,          -- Daily liters
    timestamp DATETIME,  -- Date string "YYYY-MM-DD"
    attempts INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Auto-migration

The database auto-migrates on startup:

- Adds `physical_meter_offset_m3` column to `meter_config` if missing
- Adds `effective_m3` column to `daily_snapshots` if missing
- Seeds 5 default meters if the table is empty
- Cleans anomalous readings (>20,000 L/day are deleted as errors)

### 3.5 Modbus Service

**File:** `src/services/modbus.ts`  
**Class:** `ModbusService`

The Modbus service connects to the PLC via TCP, polls configured registers at the configured interval, and maintains in-memory counter values.

#### Key State

| Property                | Type                          | Description                          |
|-------------------------|-------------------------------|--------------------------------------|
| `latestCounters`        | `Record<string, number>`      | Current pulse count per meter        |
| `dailyStartCounters`    | `Record<string, number>`      | Pulse count at start of day          |
| `digitalInputRegisterValue` | `number \| null`         | Digital input state (for diagnostics)|
| `status`                | `GatewayHealth`               | `'HEALTHY'`, `'DEGRADED'`, `'DOWN'`  |

#### Counter 32-bit Assembly

Each meter uses two 16-bit Modbus registers (LSB + MSB) to form a 32-bit counter:

```typescript
const raw32 = (msbValue << 16) | lsbValue;
```

#### Wrap-around Handling

Counters are 32-bit unsigned integers (max 4,294,967,295). The system handles rollover:

```typescript
if (current >= startOfDay) {
    delta = current - startOfDay;
} else {
    delta = (4294967295 - startOfDay) + current + 1;
}
```

#### Health Monitoring

- **HEALTHY:** Successful polls, no failures
- **DEGRADED:** 1-2 consecutive failures; auto-reconnect attempted
- **DOWN:** 3+ consecutive failures

### 3.6 Scheduler

**File:** `src/services/scheduler.ts`

All time-based automation uses `node-cron` (timezone: `America/Sao_Paulo`):

| Schedule         | Description                                                        |
|------------------|--------------------------------------------------------------------|
| `0 0 * * *`      | **Midnight:** Reset daily start counters to current values         |
| `59 23 * * *`    | **23:59:** Run daily processing + monthly aggregation              |
| `1 0 1 * *`      | **1st of month:** Finalize previous month's aggregation (backup)   |
| `*/2 * * * *`    | **Every 2 min:** Enqueue live consumption to sync queue            |
| `*/5 * * * *`    | **Every 5 min:** Process sync queue (push to cloud)                |
| Startup (10s)    | **Catch-up:** Check if yesterday's snapshot is missing; backfill   |

#### Daily Processing (`runDailyProcessing`)

1. For each enabled meter:
   - Gets current counter from Modbus
   - Gets previous end-of-day counter from last snapshot
   - Computes delta (with 32-bit wrap handling)
   - Converts to liters: `delta × pulse_volume_liters`
   - Upserts into `daily_snapshots`

#### Monthly Processing (`runMonthlyProcessing`)

1. Aggregates all daily snapshots for the target month
2. Computes `monthly_liters` and `monthly_m3`
3. Upserts into `monthly_consumption`

#### Startup Catch-up

On boot (after 10s delay to ensure first Modbus poll):

1. Checks if yesterday has a daily snapshot
2. If missing → runs `runDailyProcessing(yesterdayStr)`
3. Resets start-of-day counters to current values

### 3.7 Sync Service

**File:** `src/services/sync.ts`

**Architecture:** Store-and-Forward

Instead of direct MQTT publishing, all readings are queued locally and pushed to the cloud via HTTP POST in batches.

#### Flow

```
Scheduler (every 2 min)
    │
    ▼
syncService.enqueue(meter_id, dailyLiters, dateStr)
    │ INSERT INTO readings_queue
    ▼
Scheduler (every 5 min)
    │
    ▼
syncService.processQueue()
    │ SELECT oldest 50 from queue
    │ POST to https://kitnets.com/api/gateways/ingest
    │   Headers: x-gateway-token
    │   Body: { readings: [...] }
    │
    ▼ On success: DELETE from queue, reset failure count
    ▼ On failure: increment failure count
```

#### Self-Healing Reboot

After **10 consecutive sync failures** (~50 minutes), the system executes:

```bash
sudo reboot
```

This is designed to recover from Wi-Fi/Network connectivity issues on headless Raspberry Pi devices.

### 3.8 State Persistence

**File:** `src/services/state.ts`

Persists `dailyStartCounters` to a JSON file (`data/runtime-state.json`) so that daily consumption tracking survives process restarts.

### 3.9 API Endpoints

**Server:** Fastify (`:3000`)

| Method | Route                         | Description                                     |
|--------|-------------------------------|-------------------------------------------------|
| GET    | `/api/health`                 | Health check (status, uptime, last sync)         |
| GET    | `/api/config`                 | Get system + meter configuration                 |
| PUT    | `/api/settings`               | Update system settings (Modbus, cloud sync)      |
| PUT    | `/api/config`                 | Update meter configurations                      |
| GET    | `/api/dashboard`              | Full dashboard data (aggregations + meter data)  |
| GET    | `/api/meters/:id/daily`       | Daily history for a meter (last 365 days)        |
| GET    | `/api/meters/:id/monthly`     | Monthly history for a meter (last 60 months)     |
| GET    | `/api/history-consolidated/:type` | Consolidated daily/monthly data (all meters)  |
| POST   | `/api/meters/:id/reset`       | Reset a Modbus counter on the PLC                |
| POST   | `/api/meters/poll`            | Force an immediate Modbus poll                   |
| POST   | `/api/restart`                | Restart the gateway service                      |
| POST   | `/api/debug/fix-data-glitch`  | Fix day-end spike glitches                       |
| POST   | `/api/debug/resync-recent`    | Clear queue + re-enqueue last 30 days            |
| POST   | `/api/debug/force-sync`       | Manually trigger queue processing                |
| DELETE | `/api/debug/reset-today`      | Delete today's snapshots + reset counters        |
| DELETE | `/api/debug/reset-monthly`    | Delete ALL monthly history                       |

### 3.10 Local Web Dashboard

**Location:** `apps/edge-gateway/client/`  
**Framework:** React (Vite)

The local dashboard (accessible at `http://<gateway-ip>:3000`) provides:

- Real-time meter readings from the PLC
- Today/Yesterday/Month consumption summary
- Daily and monthly charts
- System settings configuration
- Debug & maintenance tools

---

## 4. Cloud Ingestion API

**File:** `apps/web/src/app/api/gateways/ingest/route.ts`  
**Route:** `POST /api/gateways/ingest`

This is the cloud endpoint that receives readings from edge gateways.

### Authentication

```
Header: x-gateway-token: <GATEWAY_INGEST_KEY>
```

Validated against `process.env.GATEWAY_INGEST_KEY`.

### Request Body

```json
{
  "readings": [
    { "meter_id": "HIDROMETRO35", "value": 1234.5, "timestamp": "2026-02-14" },
    { "meter_id": "HIDROMETRO35A", "value": 567.8, "timestamp": "2026-02-14" }
  ]
}
```

### Processing

1. **Authenticate** via `x-gateway-token` header
2. **Deduplicate** readings within the batch (by `meter_id + timestamp`)
3. **Upsert** into `meter_readings` table using Supabase Admin client
   - Conflict resolution: `ON CONFLICT (meter_id, read_at) DO UPDATE`
   - This makes the API idempotent — re-syncing the same data is safe

### Response

- `200`: `{ "success": true, "count": N }`
- `401`: Invalid or missing token
- `400`: Missing/invalid `readings` array
- `500`: Database error

---

## 5. Supabase Database Schema

### `meter_readings` — Raw readings from edge gateways

```sql
CREATE TABLE meter_readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meter_id TEXT NOT NULL,
    value NUMERIC NOT NULL,           -- Daily liters
    read_at TIMESTAMPTZ NOT NULL,     -- Date of reading
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_reading_per_meter_time UNIQUE (meter_id, read_at)
);
```

### `gateways` — Registered gateway devices

Linked to `profiles` (owners) and `properties`.

Key columns: `id`, `label`, `serial_number`, `status`, `owner_id`, `property_id`

### `meters` — Cloud-side meter definitions

Linked to gateways. Key columns: `id`, `display_name`, `type`, `unit`

### `property_bills` — Utility bill records

Stores digitized water bills (extracted from PDFs or manually entered).

Key columns: `id`, `property_id`, `reference_month`, `meter_number`, `previous_reading`, `current_reading`, `consumption_m3`, `total_amount`, `effective_rate_per_m3`, etc.

### Supabase RPC Functions

| Function                   | Purpose                                           |
|----------------------------|---------------------------------------------------|
| `get_property_details`     | Fetch property info by ID                         |
| `get_property_bills`       | Fetch all bills for a property (ordered by month) |
| `get_latest_billing_rate`  | Get the most recent bill's `effective_rate_per_m3` |

---

## 6. Web Dashboard

**Location:** `apps/web/src/app/[lang]/dashboard/`  
**Framework:** Next.js 14 (App Router)  
**Auth:** Clerk

### 6.1 Dashboard Home

**Route:** `/dashboard`  
**File:** `page.tsx` (Server Component)

Displays:

- Welcome message with user name
- Stats overview: Total properties, occupancy rate, active gateways
- Gateway list with status badges and links to detail pages
- "Add Gateway" and "New Property" CTAs

### 6.2 Gateway Detail Page

**Route:** `/dashboard/gateway/[id]`  
**File:** `gateway/[id]/page.tsx` (Client Component)

This is the **main consumption analytics dashboard**.

#### Features

| Feature                     | Description                                                     |
|-----------------------------|-----------------------------------------------------------------|
| **Header**                  | Gateway label, serial number, status badge (ONLINE/OFFLINE)     |
| **Date Range Picker**       | Preset ranges: Hoje, Últimos 7 dias, Este Mês, Mês Passado, Este Ano, Período (custom) |
| **Billing Cycle Sync**      | Toggle button to align date ranges with utility reading dates (see below) |
| **KPI Cards (5)**           | Consumo Total (L), Média Diária (L/dia), Dia de Pico, vs Período Anterior (%), Custo Estimado (R$) |
| **Consumption Charts**      | Tabbed view: Diário (L), Mensal (m³), Anual (m³) with bar charts |
| **Per-Meter Detail**        | Individual cards for each meter with mini charts                |
| **Cost Allocation**         | Equal split + proportional split per meter                      |
| **Billing Link**            | Link to utility bill history for the linked property            |

#### Data Flow

1. Fetches gateway + meters from Supabase (`gateways` + `meters`)
2. Fetches `meter_readings` for selected date range
3. Fetches previous-period readings for comparison (same duration)
4. Fetches latest billing rate from `get_latest_billing_rate` RPC
5. Computes KPIs client-side:
   - Total consumption = sum of all readings in range
   - Average = total / days in range
   - Peak day = max daily total
   - Period change = ((current - previous) / previous) × 100
   - Estimated cost = (total / 1000) × rate_per_m³

#### Date Range Picker Component

**File:** `components/dashboard/DateRangePicker.tsx`

Pill-style preset buttons in a bordered container with an expandable custom date picker:

```
┌──────────────────────────────────────────────────────────┐
│ Hoje │ Últimos 7 dias │ Este Mês │ Mês Passado │ Este Ano │ 📅 Período │
└──────────────────────────────────────────────────────────┘
  📅 Sincronizar Ciclo de Leitura    07/01 — 16/02

(when Período is selected)
┌──────────────────────────────────────────────────────────┐
│  De:   [  2026-01-01  📅 ]                               │
│  Até:  [  2026-02-14  📅 ]                               │
│  ┌──────────────────────────────────────┐                │
│  │             Aplicar                   │                │
│  └──────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────┘
```

#### Billing Cycle Sync

**Icon:** `CalendarSync` (from `lucide-react`)  
**State:** `syncBilling: boolean`, `readingDates: string[]`

A single toggle button that aligns the selected date range with the utility company's actual meter reading dates (`reading_date_orig` from `property_bills`).

##### Visibility Rules

The sync button only appears when **all** of these are true:

1. The gateway is linked to a property with at least **2 bills** containing reading dates
2. The selected preset is one of:
   - **Este Mês**, **Mês Passado**, **Este Ano** — always shown
   - **Período** (custom) — only if the date range spans **more than 60 days**
3. Hidden for: **Hoje**, **Últimos 7 dias**, and custom periods ≤ 60 days

##### Behavior Per Preset

| Preset         | Sync OFF (calendar dates)      | Sync ON (billing cycle dates)                |
|----------------|--------------------------------|----------------------------------------------|
| **Este Mês**   | 1st of month → today           | Most recent reading date → today             |
| **Mês Passado**| 1st of prev month → end of prev month | 2nd most recent reading → most recent reading |
| **Este Ano**   | Jan 1 → today                  | Earliest reading of year → today + **chart auto-switches to Mensal** |
| **Período**    | Custom start → custom end      | Custom start → custom end (sync has no billing equivalent for custom) |

##### Auto-Disable

When the user switches to a non-syncable preset (e.g., "Hoje") while sync is ON, the sync automatically turns OFF.

##### Data Source

On page load, a separate `useEffect` (independent of the date range) fetches all bills via the `get_property_bills` RPC and extracts `reading_date_orig` (with fallback to `reading_date`). These dates are stored in `readingDates[]` sorted newest-first.

##### "Este Ano" + Monthly Chart

When sync is ON and "Este Ano" is selected, the `ConsumptionTabs` component receives `initialTab="monthly"` and is keyed with `key="monthly"` to force a remount with the Mensal tab active.

### 6.3 Billing History Page

**Route:** `/dashboard/billing/[propertyId]`  
**File:** `billing/[propertyId]/page.tsx` (Client Component)

Displays digitized utility bills for a property.

#### Features

| Feature               | Description                                                   |
|-----------------------|---------------------------------------------------------------|
| **Header**            | Property name, address, connection code (with privacy toggle) |
| **Privacy Toggles**   | Eye/EyeOff buttons to mask address, values                   |
| **Month Filter**      | Preset pills: 12 meses, 2 anos, 3 anos, 4 anos, 5 anos      |
| **Custom Period**     | "Período" button → expands De/Até month inputs (reactive)    |
| **Summary Cards (4)** | Total cost, Monthly average, Total consumption, Highest bill  |
| **Consumption Chart** | Bar chart of monthly consumption in m³                        |
| **Bill Table**        | Expandable rows with full bill details                        |
| **Add Bill CTA**      | "Nova Conta" button → links to manual entry page              |

#### Month Filter Design

The filter matches the `DateRangePicker` component style:

```
┌──────────────────────────────────────────────────────────┐
│ 12 meses │ 2 anos │ 3 anos │ 4 anos │ 5 anos │ 📅 Período │
└──────────────────────────────────────────────────────────┘

(when Período is selected)
┌──────────────────────────────────────────────────────────┐
│  De:   [  January 2025        📅 ]                       │
│  Até:  [  December 2025       📅 ]                       │
└──────────────────────────────────────────────────────────┘
```

- Default: **12 months** (most recent bills)
- Filter applies to **all** data: summary cards, chart, and table
- Header shows `"X de Y contas"` to indicate filtering
- Custom period uses `type="month"` native browser inputs
- The filter is **reactive** — no "Aplicar" button needed; data updates instantly as the user changes inputs

#### Filter Logic

```typescript
const filteredBills = useMemo(() => {
    if (monthsFilter === "custom") {
        return bills.filter((b) =>
            b.reference_month >= customStart && b.reference_month <= customEnd
        );
    }
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - monthsFilter, 1);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
    return bills.filter((b) => b.reference_month >= cutoffStr);
}, [bills, monthsFilter, customStart, customEnd]);
```

### 6.4 Manual Bill Entry Page

**Route:** `/dashboard/billing/[propertyId]/new`  
**File:** `billing/[propertyId]/new/page.tsx` (Client Component)

Allows adding utility bills via:

1. **Manual form entry** — All bill fields with auto-calculated totals
2. **PDF/Image upload** — AI-powered extraction using `@kitnets/core` extraction service
   - Supports PDF files (parsed with `pdfjs-dist`) and images (JPEG, PNG)
   - Uses OpenAI GPT-4o for OCR + structured extraction
   - Auto-fills the form with extracted data

#### Bill Fields

| Field                    | Source                         |
|--------------------------|--------------------------------|
| `referenceMonth`         | Reference period (YYYY-MM)     |
| `meterNumber`            | Physical meter serial number   |
| `previousReading`        | Previous meter reading          |
| `currentReading`         | Current meter reading           |
| `consumptionM3`          | Measured consumption            |
| `billedConsumptionM3`    | Billed consumption (may differ) |
| `readingDate`            | Date of meter reading           |
| `dueDate`                | Payment due date                |
| `waterTariff`            | Water usage charges (R$)        |
| `sewageTariff`           | Sewage charges (R$)             |
| `waterBasicFee`          | Fixed water fee (R$)            |
| `sewageBasicFee`         | Fixed sewage fee (R$)           |
| `totalAmount`            | Total bill amount (R$)          |
| `occurrenceCode`         | Utility occurrence codes        |

---

## 7. Shared UI Components

**Location:** `apps/web/src/components/dashboard/`

### `ConsumptionChart.tsx`

Recharts-based bar chart with:

- Configurable data key, unit, color, height
- Custom tooltip with theming
- Loading state (shimmer skeleton)
- Empty state with dashed border
- Click handler support
- Average reference line

### `ConsumptionTabs.tsx`

Tabbed wrapper around `ConsumptionChart` with three views:

| Tab      | Data           | Unit | Color   | Aggregation         |
|----------|----------------|------|---------|---------------------|
| Diário   | Daily totals   | L    | Blue    | Raw daily data      |
| Mensal   | Monthly totals | m³   | Indigo  | Sum daily → month   |
| Anual    | Yearly by month| m³   | Violet  | Sum daily → month   |

**Exports:** `DailyTotal` (interface), `TabKey` (type: `"daily" | "monthly" | "yearly"`)

**Props:**

| Prop         | Type      | Default    | Description                                    |
|--------------|-----------|------------|------------------------------------------------|
| `dailyData`  | `DailyTotal[]` | required | Array of `{ date, total }` daily consumption  |
| `loading`    | `boolean` | `false`    | Show loading skeleton                          |
| `initialTab` | `TabKey`  | `undefined`| Override the default active tab on mount. Used by billing cycle sync to force "monthly" when "Este Ano" + sync ON. Parent should pass a `key` prop to force remount when this changes. |

### `KPICards.tsx`

Reusable KPI card with:

- Title, value, unit, description
- Icon (water, money, calendar, chart, activity)
- Trend indicator (up/down/neutral with colored arrow)
- Loading state (animated skeleton)

### `DateRangePicker.tsx`

Date range picker with preset ranges + custom period:

- Pill-button style matching the billing filter
- Presets: Hoje, Últimos 7 dias, Este Mês, Mês Passado, Este Ano
- Custom: date inputs with De/Até labels and Aplicar button
- Fires `onChange(start, end, label)` callback

---

## 8. Data Flow — End to End

```
1. PLC reads pulse counters from water meters
          │
2. Edge Gateway polls Modbus registers (every 1s)
          │
3. Counter values stored in memory (latestCounters)
          │
4. Every 2 min: Compute daily liters → enqueue to readings_queue
          │
5. Every 5 min: Process queue → POST to /api/gateways/ingest
          │
6. Ingest API authenticates + upserts to Supabase meter_readings
          │
7. Web Dashboard queries Supabase for date range
          │
8. KPIs computed client-side from readings
          │
9. Charts rendered via Recharts
```

### Daily Processing (23:59)

```
1. For each meter: snapshot counter → daily_snapshots
2. Compute delta × pulse_volume_liters → daily_liters
3. Aggregate daily → monthly_consumption
```

### Midnight Reset (00:00)

```
1. Set dailyStartCounters = current counter values
2. "Today" consumption resets to 0
```

---

## 9. Deployment

### 9.1 Edge Gateway Deployment

**Target:** Raspberry Pi / Ubuntu 24.04 LTS  
**Install directory:** `/opt/kitnets-gateway`

#### Prerequisites

- Node.js v20 LTS
- Internet access
- Access to PLC on local network (port 502)

#### Install

```bash
git clone https://github.com/ARTURPEDROSA1/kitnets-monorepo.git
cd kitnets-monorepo/apps/edge-gateway
chmod +x install.sh
sudo ./install.sh
```

The installer:

1. Installs Node.js dependencies
2. Builds TypeScript backend (`dist/`)
3. Builds React frontend (`client/dist/`)
4. Creates/updates systemd service
5. Auto-migrates the SQLite database

#### Update

```bash
cd ~/kitnets-monorepo
git pull
cd apps/edge-gateway
sudo ./install.sh
```

Configuration and database are preserved during updates.

#### Systemd Service

```ini
[Unit]
Description=Kitnets Smart Meter Gateway
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/kitnets-gateway
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

#### Useful Commands

```bash
# Check status
sudo systemctl status kitnets-gateway

# View logs
sudo journalctl -u kitnets-gateway -f

# Restart
sudo systemctl restart kitnets-gateway
```

### 9.2 Web App Deployment

**Platform:** Vercel  
**Framework:** Next.js (monorepo with Turborepo)

Deployed via Git push to `main` branch. Vercel auto-builds and deploys.

---

## 10. Troubleshooting

### Edge Gateway

| Symptom                      | Cause                                    | Solution                                    |
|------------------------------|------------------------------------------|---------------------------------------------|
| Status: DOWN                 | PLC unreachable                          | Check network, verify PLC IP in settings    |
| Spike in daily consumption   | Counter overflow or restart glitch       | Use "Reset Today's Data" in local dashboard |
| No sync to cloud             | Wrong/missing `GATEWAY_INGEST_KEY`       | Check `.env` file                           |
| Gateway rebooting itself     | 10 consecutive sync failures             | Fix network; gateway auto-recovers          |
| Missing yesterday's data     | Gateway was down at 23:59                | Startup catch-up runs automatically         |
| anomalous >20k L/day reading | Glitch in counter delta                  | Auto-cleaned on startup                     |

### Web Dashboard

| Symptom                      | Cause                                    | Solution                                    |
|------------------------------|------------------------------------------|---------------------------------------------|
| "Carregando dados..." stuck  | No readings in selected date range       | Change date range or check sync status      |
| Custo Estimado shows "-"     | No bills uploaded for this property      | Upload a bill via "Nova Conta"              |
| Chart empty                  | No meter_readings for the date range     | Verify gateway sync is working              |
| Filter shows "0 de N contas" | Filter range excludes all bills          | Widen the filter range                      |

---

## 11. Environment Variables

### Edge Gateway (`.env`)

| Variable              | Required | Description                                 |
|-----------------------|----------|---------------------------------------------|
| `MODBUS_HOST`         | Yes      | PLC IP address (e.g., `192.168.1.123`)      |
| `MODBUS_PORT`         | No       | Modbus TCP port (default: `502`)            |
| `MODBUS_UNIT_ID`      | No       | Modbus slave ID (default: `1`)              |
| `POLL_INTERVAL_MS`    | No       | Polling interval in ms (default: `1000`)    |
| `GATEWAY_INGEST_KEY`  | Yes      | Token for authenticating with cloud API     |
| `PORT`                | No       | Local dashboard port (default: `3000`)      |
| `DB_PATH`             | No       | SQLite database path                        |

### Web App (Vercel)

| Variable              | Required | Description                                 |
|-----------------------|----------|---------------------------------------------|
| `GATEWAY_INGEST_KEY`  | Yes      | Must match edge gateway's token             |
| `NEXT_PUBLIC_SUPABASE_URL`     | Yes | Supabase project URL               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| Yes | Supabase anonymous key              |
| `SUPABASE_SERVICE_ROLE_KEY`    | Yes | Supabase service role key (for admin ops) |
| `OPENAI_API_KEY`      | Yes      | For AI bill extraction (GPT-4o)             |

---

*This manual is maintained alongside the codebase at `docs/GATEWAY_DASHBOARD_MANUAL.md`.*
