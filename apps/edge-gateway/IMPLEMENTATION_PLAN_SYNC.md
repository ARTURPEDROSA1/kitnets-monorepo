# Implementation Plan: Edge-Gateway Store-and-Forward Sync

## Objective

Transition the architecture from **MQTT-based** real-time messaging to a robust **Store-and-Forward** model via an HTTP Ingestion API. This ensures data integrity for billing by storing readings locally (SQLite) before syncing to the cloud (Supabase), safeguarding against internet outages.

## Architecture Overview

1. **Edge Gateway**: Capture meter readings locally in SQLite.
2. **Sync Service**: Periodically (configurable) push unsynced readings to the Cloud API.
3. **Ingestion API (Next.js)**: Receive readings, validate security token, and insert into Supabase.
4. **Supabase**: Permanent storage for billing and reporting.

---

## Phase 1: Web Application (Ingestion API)

*Goal: Create the secure endpoint to receive data.*

### 1.1 Database Schema (Supabase)

* Table: `meter_readings`
  * `id`: uuid (primary key)
  * `meter_id`: string/int (indexed)
  * `value`: numeric (the counter value)
  * `read_at`: service timestamp (when the gateway read it)
  * `created_at`: default now()

### 1.2 API Endpoint (`apps/web`)

* **Path**: `/api/gateways/ingest`
* **Method**: `POST`
* **Security**: Validate `x-gateway-token` header against an environment variable (e.g., `GATEWAY_INGEST_KEY`).
* **Logic**:
  * Accepts an array of readings.
  * Validates payload structure.
  * Inserts into `meter_readings` table.
  * Returns `200 OK` only on successful DB commit.

---

## Phase 2: Edge Gateway (Data & Configuration)

*Goal: specific logic for local storage and configuration.*

### 2.1 Database Update (`src/database/db.ts`)

* Create a new table `readings_queue`:
  * `id`: INTEGER PRIMARY KEY AUTOINCREMENT
  * `value`: REAL (The meter reading)
  * `timestamp`: TEXT (ISO string when reading was taken)
  * `synced`: INTEGER (0 = false, 1 = true, default 0)

### 2.2 Configuration Updates (`config.ts` & Types)

* **Remove**: `mqttBroker`, `mqttTopic`, `mqttUsername`, `mqttPassword`.
* **Add**:
  * `ingestionApiUrl`: string (e.g., `https://kitnets.com/api/gateways/ingest`)
  * `gatewayToken`: string (Secret key for auth)
  * `syncIntervalMinutes`: number (Default: 5)

### 2.3 UI Updates (`client/src/components/Config.tsx`)

* **Remove**: All MQTT-related input fields.
* **Add**:
  * Input: "Ingestion API URL"
  * Input: "Gateway Token"
  * Input: "Sync Frequency (Minutes)"
* **Maintenance**: Ensure these settings persist to `config.json`.

---

## Phase 3: Edge Gateway (Logic & Service)

*Goal: Implement the "Store and Forward" mechanism.*

### 3.1 New Sync Service (`src/services/sync.ts`)

* **`captureReading()`**:
  * Reads current counter from `ModbusService`.
  * Inserts row into `readings_queue` with `synced=0`.
* **`pushData()`**:
  * Selects all rows where `synced=0` (limit 50 or 100 per batch).
  * Sends HTTP POST to `ingestionApiUrl`.
  * On `200 OK`: Updates those specific rows to `synced=1`.
  * On Error: Logs error, does nothing (retries next time implicitly).
* **`pruneOldData()`**:
  * (Optional) Daily job to delete `synced=1` rows older than 30 days to save SD card space.

### 3.2 Scheduler Updates (`src/services/scheduler.ts`)

* **Initialize**: Load `syncIntervalMinutes` from config.
* **Schedule**:
  * Use `setInterval` keyed to `syncIntervalMinutes`.
  * Execute `syncService.captureReading()` followed by `syncService.pushData()`.
* **Cleanup**: Remove any existing MQTT publish loops.

### 3.3 Main Entry cleanup (`src/index.ts`)

* Remove `mqtt` client initialization.
* Initialize `SyncService`.

---

## Phase 4: Migration Steps

1. **Stop Service**: `sudo systemctl stop kitnets-gateway`
2. **Deploy Code**: Pull new code to Raspberry Pi.
3. **Update Config**: access UI (or edit file) to set API URL and Token.
4. **Start Service**: `sudo systemctl start kitnets-gateway`
5. **Verify**: Check Ingestion API logs and Supabase table for incoming data.

## Verification Plan

1. Disconnect Internet on Gateway.
2. Wait 15 minutes (should accumulate ~3 readings).
3. Reconnect Internet.
4. Verify all 3 readings appear in Supabase shortly after reconnection.
