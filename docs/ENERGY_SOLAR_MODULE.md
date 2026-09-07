# Solar Energy & Consumption Management Module

**Version:** 1.0  
**Last updated:** 2026-09-07  
**Author:** Kitnets Engineering  

---

## 1. Overview

The **Solar Energy & Consumption Management Module** enables property owners on Kitnets.com to store, track, and visualize electricity consumption and distributed solar generation (GD / SCEE) per property.

The module is activated whenever **Energia Solar** (`details.solarEnergy: true`) is checked in the property details on `kitnets.com/pt/imoveis` (`PropertyDetailsCard.tsx`).

### Core Features

1. **Zero-Storage AI Extraction**:
   - The landlord uploads an electricity bill (PDF or image) from concessionaires like **CEMIG**.
   - The file is processed directly in memory by **Gemini Vision AI** without ever being stored in persistent cloud storage or buckets.
   - Structured technical and financial metrics are extracted and written directly to Supabase (`public.energy_bills`).
2. **Instant 13-Month Historical Ingestion**:
   - Standard Brazilian electricity bills (such as CEMIG) display a 13-month historical table: `Histórico de Consumo` (`MÊS/ANO`, `Cons. kWh`, `Média kWh/Dia`, `Dias`).
   - From a single invoice upload, the module ingests both the current cycle's full financial breakdown and baseline consumption records for the preceding 12 months (`is_historical_only: true`), instantly generating trend charts.
3. **Solar Metrics Tracking**:
   - **SALDO ATUAL DE GERAÇÃO (kWh)**: Current accumulated solar energy credits stored with the utility company.
   - **Energia Injetada (kWh)**: Solar energy generated on-site and exported to the electrical grid.
   - **Energia Compensada (kWh & R$)**: Injected credits utilized to offset grid consumption.
   - **Custo de Disponibilidade (Taxa Mínima)**: Minimum connection charge (100 kWh for trifásico, 50 kWh for bifásico, 30 kWh for monofásico).
   - **Preço Unitário (R$/kWh)**: Unit tariff including taxes and flags.
4. **Interactive Recharts Visualizations**:
   - Energy Balance: Active Grid Consumption vs. Solar Injected Energy.
   - Evolution of Generation Credit Balance over time.
   - Financial Analysis: Real Bill Paid vs. Theoretical Cost Without Solar vs. Net Savings.
   - Daily Consumption Intensity & Seasonality.

---

## 2. Architecture & File Structure

```
apps/web/src/
├── app/
│   ├── api/
│   │   └── energy-bills/
│   │       ├── extract/
│   │       │   └── route.ts         # Zero-storage Gemini Vision AI bill extractor
│   │       └── route.ts             # Energy bills CRUD API
│   │
│   └── [lang]/
│       └── dashboard/
│           └── energy/
│               └── [propertyId]/
│                   └── page.tsx     # Solar energy & consumption dashboard
│
├── components/
│   ├── energy/
│   │   ├── EnergyCharts.tsx         # Recharts visualizations (balance, credits, savings)
│   │   └── EnergyBillUploadModal.tsx# Zero-storage upload & AI review drawer
│   └── profile/
│       └── PropertyDetailsCard.tsx  # Solar checkbox & direct access button
│
packages/core/database/
└── phase3_energy_bills.sql          # Supabase SQL schema, indexes, RLS, and RPC
```

---

## 3. Database Schema

The `energy_bills` table records monthly cycle information linked to `properties(id)`:

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary Key |
| `property_id` | UUID | Foreign Key to `properties(id)` |
| `consumer_unit` | TEXT | Unidade Consumidora (UC, ex: `2.777.942.018-25`) |
| `utility_company` | TEXT | Concessionária (default: `CEMIG`) |
| `installation_class`| TEXT | ex: `Residencial Trifásico` |
| `tariff_modality` | TEXT | ex: `Convencional B1` |
| `reference_month` | TEXT | Sorting format `YYYY-MM` (ex: `2026-08`) |
| `reference_month_label` | TEXT | Display label (ex: `AGO/2026`) |
| `reading_date_current` | DATE | Data da leitura atual |
| `reading_date_previous` | DATE | Data da leitura anterior |
| `billing_days` | INTEGER | Número de dias de consumo (ex: `30`) |
| `due_date` | DATE | Data de vencimento |
| `grid_consumption_kwh` | NUMERIC | Consumo medido da rede (kWh) |
| `daily_avg_kwh` | NUMERIC | Média diária (kWh/Dia) |
| `monthly_avg_kwh` | NUMERIC | Média histórica mensal (kWh) |
| `solar_injected_kwh` | NUMERIC | Energia solar injetada na rede (kWh) |
| `solar_compensated_kwh` | NUMERIC | Energia compensada no mês (kWh) |
| `generation_balance_kwh` | NUMERIC | **SALDO ATUAL DE GERAÇÃO (kWh)** |
| `unit_price` | NUMERIC | Preço Unitário efetivo (R$/kWh) |
| `availability_cost_kwh` | NUMERIC | Taxa de disponibilidade (100 kWh trifásico) |
| `availability_cost_amount` | NUMERIC | Custo de disponibilidade em R$ |
| `energy_scee_exempt_amount`| NUMERIC | Energia SCEE Isenta em R$ |
| `energy_compensated_amount`| NUMERIC | Energia compensada GD II em R$ |
| `flag_type` | TEXT | Bandeira Tarifária (Verde, Amarela, Vermelha) |
| `flag_amount` | NUMERIC | Adicional de bandeira tarifária |
| `total_amount` | NUMERIC | **Valor total a pagar (R$)** |
| `estimated_savings_amount` | NUMERIC | Economia gerada pela energia solar no mês |
| `solar_coverage_ratio` | NUMERIC | Percentual de cobertura solar (Injetada / Consumo) |
| `is_historical_only` | BOOLEAN | `TRUE` if loaded from 13-month historical table |

---

## 4. Zero-Storage AI Extraction Workflow

1. **Client Upload**: Landlord drops or selects a PDF or image in `EnergyBillUploadModal.tsx`.
2. **In-Memory Preparation**:
   - If PDF, the client renders the document page to an image canvas in memory via `pdfjs-dist`.
   - The image is converted to a Blob and submitted via `FormData` to `/api/energy-bills/extract`.
3. **AI Multimodal Parsing**:
   - In `/api/energy-bills/extract/route.ts`, the file buffer is analyzed with **Gemini Vision AI**.
   - No file is written to local disk or uploaded to Supabase Storage buckets.
   - The AI identifies and parses all billing fields, solar metrics, and the 13 historical rows.
4. **Interactive Verification**:
   - The user inspects the extracted values in a review modal, adjusts fields if needed, and clicks "Confirmar e Gravar".
5. **Database Storage**:
   - The server creates/updates the primary bill and batch-inserts historical baseline records (`is_historical_only: true`) for missing past months.
