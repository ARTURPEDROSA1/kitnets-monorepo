# Property Investment Analysis — Implementation Plan

**Date:** 2026-09-11 · **Status:** proposal · **Scope:** `apps/web` (Next.js + Supabase)

Goal: for every property in *Gestão de Imóveis*, answer four questions with real numbers instead of estimates:

1. **How much have I paid for this property so far** (down payment, closing costs, every mortgage installment and prepayment, renovations)?
2. **How much net income has it generated** (rent actually received minus operating costs actually paid)?
3. **How far along is the payback** (% of invested capital already recovered) and **when will it complete** at the current run rate?
4. **What are the standard real-estate KPIs** (gross/net yield, cap rate, cash-on-cash, IRR, equity multiple, rent per m², break-even occupancy, DSCR)?

---

## 1. Where the app is today

| Piece | State | Consequence for this feature |
|---|---|---|
| Property record | JSON blobs on `profiles.property_details` / `additional_properties`; a `public.properties` row exists per property (UUID) and is already used by water/energy bills and leases | Investment data must hang off `properties.id`, not the JSON index. The cost-center dashboard receives only a JSON index today; `PropertyState.id` is already loaded in `ProfileContent.tsx` (properties fetch around line 539) and just needs to be passed down. |
| Revenue | `leases.monthly_rent` (contracted), `SubUnit.rentValue` (typed), `details.monthlyRentEstimate` (estimate) | No record of rent **received**. Everything is contractual or estimated. |
| Operating costs | `details.iptuMonthly`, `condoMonthly`, `maintenanceMonthly`, `managementFeePercent`, `otherExpensesMonthly` (monthly estimates); `energy_bills.total_amount` and `water_bills.total_amount` (actuals, monthly) | Partial actuals exist for utilities only. |
| Acquisition / financing | Nothing | Purchase price, down payment, ITBI, registry, loan terms and installments are not stored anywhere. |
| DRE chart | `PropertyCostCenterDashboard.tsx` lines 172–190 fabricate six months from the estimate with hard-coded variance | Must be replaced by ledger data. |
| Calculation libs | `lib/mortgage.ts` (SAC/PRICE schedule with extra payments), `lib/indexes.ts` (IPCA/INPC/IGP-M values), `lib/fipezap.ts` (market price index) | Reusable for expected-schedule projection, inflation adjustment and market valuation. |
| Auth pattern | `lib/api-auth.ts` (`requireProfile`, `getOwnedProperty`) on the `fix/auth-holes` branch | All new routes follow it. Build this feature on a branch cut **after** `fix/auth-holes` merges. |
| Tests | none run (`vitest` not installed) | The metrics engine is pure math and is the first thing worth a test runner. |

## 2. What the attachments tell us (worked example: Vale do Sol)

From the Bradesco simulator (contract 906687) and the dedicated-account statement (01/2018 – 09/2021):

| Item | Value | Source |
|---|---|---|
| Contract date | 24/04/2018 | simulator header |
| Property value | R$ 377.000,00 | simulator header |
| Financed | R$ 285.665,16 · SAC · 360 months · 9,06 % a.a. nominal · MIP + DFI + TAC R$ 25/mo | simulator header + row 1 |
| Down payment (derived) | R$ 91.334,84 | 377.000 − 285.665,16 |
| First installment | R$ 3.850,04 on 05/06/2018 (amort. 793,51 + interest 2.935,21 + MIP 62,39 + DFI 33,93 + TAC 25,00) | simulator row 1; matches the statement |
| Total paid to the bank | R$ 329.462,89 in 58 debits, May 2018 → Aug 2021 | statement: 35 `Parc Cred Imob`, 14 `Fin Imobiliario` prepayments (R$ 57,7k in 2019, R$ 174,0k in 2020), 7 `Prest Fin Imob`, 1 `Ant Par Financ` R$ 11.500, 1 `Quitacao Finan` R$ 14.243,23 on 25/08/2021 |
| Interest + insurance + fees (derived) | R$ 43.797,73 | 329.462,89 − 285.665,16 |
| Bank fees on the account | R$ 1.451,82 | `Tarifa Bancaria`, `Cesta`, overdraft |
| Loan paid off | 25/08/2021, 40 months instead of 360 | `Quitacao Finan` |
| Cash cost basis so far (excl. ITBI, registry, renovations) | **≈ R$ 420.800** | 91.334,84 + 329.462,89 |
| Current gross rent / NOI (dashboard) | R$ 2.100 / R$ 1.622 per month | screenshot |

KPIs the feature should reproduce for this property before ITBI, registry and capex are entered:

| KPI | Formula | Value |
|---|---|---|
| Gross yield on price | 12 × rent ÷ purchase price | 25.200 ÷ 377.000 = **6,7 % a.a.** |
| Net yield on cost | 12 × NOI ÷ cash cost basis | 19.464 ÷ 420.800 = **4,6 % a.a.** |
| Simple payback | cash cost basis ÷ annual NOI | **≈ 21,6 years** of NOI at today's rent |
| Payback to date | Σ net income received ÷ cash cost basis | needs rent-received history (entered or imported) |

Two observations that shape the design:

- Every credit in that statement is the owner's own transfer (`Remet. artur da Conceicao`). The account was a pure loan-servicing account, so an importer must classify self-transfers as **funding**, not income.
- The real schedule diverged from the simulator after month 9 because of prepayments. "Expected vs actual" must come from the ledger; `lib/mortgage.ts` is used only to project the *remaining* schedule for properties still financed.

## 3. Metric definitions (single source of truth for the engine)

All amounts in BRL; `t0` = acquisition date; "to date" = up to the selected as-of date.

**Capital invested (cash basis)**
- `acquisitionCost` = purchase price + ITBI + registry/escritura + broker fee + other closing costs
- `financingCost` = Σ interest + Σ MIP/DFI + Σ TAC/fees + Σ prepayment penalties (principal repayments are *not* cost; they convert debt into equity)
- `capex` = Σ renovations / improvements (flagged `CAPEX`, excluded from OPEX)
- `cashInvested` = down payment + closing costs + Σ all mortgage debits (principal + interest + insurance + fees) + capex + Σ months where the owner covered a negative operating cash flow
- `totalCostBasis` = `acquisitionCost` + `financingCost` + `capex` (what the property cost in total, regardless of who financed it)

**Income**
- `grossIncome` = Σ rent received + Σ other income (parking, laundry, solar credits, late fees)
- `opex` = Σ IPTU + condo + maintenance + management fee + insurance + utilities paid by landlord + vacancy-period costs + bank fees on the property account
- `noi` = `grossIncome` − `opex`
- `debtService` = Σ mortgage installments in the period
- `cashFlow` = `noi` − `debtService`
- `netIncomeToDate` = Σ `noi` from t0 to the as-of date

**Payback**
- `paybackPct` = `netIncomeToDate` ÷ `cashInvested`
- `remaining` = `cashInvested` − `netIncomeToDate`
- `paybackForecastDate` = as-of date + `remaining` ÷ (trailing-12-month `noi` ÷ 12), optionally with rent growth from IPCA/IGP-M; also expose months to payback and a discounted variant (NOI discounted at a user-set rate)

**Yields and returns**
- `grossYieldOnPrice` = 12 × current monthly rent ÷ purchase price
- `grossYieldOnValue` = 12 × current monthly rent ÷ current market value
- `capRate` (net yield on value) = trailing-12-month `noi` ÷ current market value
- `netYieldOnCost` = trailing-12-month `noi` ÷ `totalCostBasis`
- `cashOnCash` = trailing-12-month `cashFlow` ÷ `cashInvested`
- `equityMultiple` = (`netIncomeToDate` + current equity) ÷ `cashInvested`, where equity = market value − outstanding loan balance
- `irr` = XIRR over the dated cash-flow series: −(down payment + closing) at t0, −installments/prepayments/capex on their dates, +NOI monthly, terminal +(market value − outstanding balance) at the as-of date. Report as "TIR até hoje (incl. valorização)" and "TIR realizada (sem venda)"
- `appreciation` = market value ÷ purchase price − 1; `totalReturn` = `netIncomeToDate` + appreciation gain
- `rentPerSqm` = rent ÷ built area; `pricePerSqm`; `priceToRent` = purchase price ÷ annual rent
- `breakEvenOccupancy` = (`opex` + `debtService`) ÷ potential gross rent (multi-unit)
- `dscr` = `noi` ÷ `debtService` (only while financed)
- `realNoi` = NOI deflated by IPCA to t0 money (uses `lib/indexes.ts`), for an inflation-adjusted payback

## 4. Data model (new migration `apps/web/database/investment_2026_09.sql`)

All tables carry `owner_id UUID REFERENCES profiles(id)` (denormalised for RLS), `property_id UUID REFERENCES properties(id) ON DELETE CASCADE`, `created_at`/`updated_at`, RLS enabled with an owner policy, and **no** `SECURITY DEFINER` RPCs. Routes use the service role scoped by `requireProfile`.

```sql
-- 4.1 Acquisition (one row per property)
property_acquisitions (
  property_id PK/FK, owner_id,
  acquired_on DATE, purchase_price NUMERIC(14,2),
  itbi NUMERIC(14,2), registry_fees NUMERIC(14,2), broker_fee NUMERIC(14,2), other_closing NUMERIC(14,2),
  down_payment NUMERIC(14,2),
  built_area_m2 NUMERIC(10,2), land_area_m2 NUMERIC(10,2),
  notes TEXT
)

-- 4.2 Financing (0..n per property; supports refinancing)
property_financings (
  id PK, property_id, owner_id,
  lender TEXT, contract_number TEXT, system TEXT CHECK (SAC|PRICE|OTHER),
  contract_date DATE, first_due_date DATE, term_months INT,
  principal NUMERIC(14,2), annual_rate NUMERIC(8,4), index_code TEXT (TR|IPCA|NONE),
  mip_rate NUMERIC(8,6), dfi_rate NUMERIC(8,6), monthly_fee NUMERIC(10,2),
  status TEXT CHECK (ACTIVE|PAID_OFF|REFINANCED), paid_off_on DATE,
  outstanding_balance NUMERIC(14,2)   -- last known, maintained from the ledger
)

-- 4.3 Ledger: every dated cash movement attributable to the property
property_transactions (
  id PK, property_id, owner_id, financing_id NULL,
  occurred_on DATE,
  amount NUMERIC(14,2),               -- signed: + inflow to owner, − outflow
  flow TEXT CHECK (INCOME|OPEX|CAPEX|FINANCING|ACQUISITION|FUNDING|TRANSFER),
  category TEXT,  -- RENT, OTHER_INCOME, IPTU, CONDO, MAINTENANCE, MGMT_FEE, INSURANCE,
                  -- ENERGY, WATER, GAS, INTERNET, BANK_FEE, VACANCY,
                  -- INSTALLMENT, PREPAYMENT, PAYOFF, LOAN_FEE,
                  -- DOWN_PAYMENT, ITBI, REGISTRY, RENOVATION, ...
  principal_part NUMERIC(14,2), interest_part NUMERIC(14,2),
  insurance_part NUMERIC(14,2), fee_part NUMERIC(14,2),   -- split for FINANCING rows; NULL when unknown
  description TEXT, counterparty TEXT,
  status TEXT CHECK (EXPECTED|CONFIRMED) DEFAULT 'CONFIRMED',
  source TEXT CHECK (MANUAL|IMPORT|LEASE|ENERGY_BILL|WATER_BILL|MORTGAGE_SCHEDULE),
  source_ref TEXT,                    -- bill id, lease id + month, import batch id + row hash
  unit_id TEXT NULL,                  -- sub-unit name for multi-family
  UNIQUE (property_id, source, source_ref)
)

-- 4.4 Valuations (market value over time)
property_valuations (
  id PK, property_id, owner_id, valued_on DATE, value NUMERIC(14,2),
  source TEXT CHECK (MANUAL|FIPEZAP|APPRAISAL|LISTING), notes TEXT
)

-- 4.5 Import batches (statement uploads)
property_imports (
  id PK, property_id, owner_id, file_name TEXT, file_hash TEXT,
  format TEXT CHECK (XLS|CSV|OFX|PDF),
  rows_total INT, rows_imported INT, rows_skipped INT, created_at
)

-- 4.6 Monthly rollup (plain VIEW; materialise later if slow)
property_monthly_cashflow AS
  SELECT property_id, date_trunc('month', occurred_on) AS month,
         SUM(amount)  FILTER (WHERE flow = 'INCOME')    AS income,
         SUM(-amount) FILTER (WHERE flow = 'OPEX')      AS opex,
         SUM(-amount) FILTER (WHERE flow = 'CAPEX')     AS capex,
         SUM(-amount) FILTER (WHERE flow = 'FINANCING') AS debt_service,
         SUM(interest_part)  FILTER (WHERE flow = 'FINANCING') AS interest,
         SUM(principal_part) FILTER (WHERE flow = 'FINANCING') AS principal
  FROM property_transactions
  GROUP BY 1, 2;
```

Design notes

- **Signed amounts, one table.** Every KPI is a filtered sum over `property_transactions`; no parallel tables for rent vs costs.
- **`FUNDING` / `TRANSFER` flows** hold the owner's own deposits into the loan account so an imported statement reconciles to zero without being counted as income or cost.
- **Idempotent feeds.** Energy and water bills and lease rent become ledger rows via `source` + `source_ref`, so re-syncing never duplicates. A bill is a landlord cost only when the lease says so (`lease_charges.responsibility` = `LANDLORD` or `INCLUDED`); otherwise it is informational.
- The existing `details.*Monthly` estimate fields stay and become the **forecast defaults** for months without ledger data.

## 5. Calculation engine — `apps/web/src/lib/investment-metrics.ts`

Pure, side-effect-free TypeScript so it can be unit-tested and reused by the API and by a future public calculator:

```ts
computeInvestmentMetrics({
  acquisition, financings, transactions, valuations,
  asOf,
  assumptions: { discountRate, rentGrowthIndex, vacancyPct, marketValueOverride },
}): InvestmentMetrics   // every KPI in §3 + monthly series + payback-curve points
```

Helpers:

- `xirr(cashflows)` — Newton with bisection fallback.
- `trailing12(series)`, `deflate(series, ipcaValues)`.
- `projectRemainingSchedule(financing, ledger)` — wraps `calculateMortgage` from `lib/mortgage.ts`, seeded with the actual outstanding balance and remaining term.
- `classifyStatementRow(description)` — rules table for Bradesco/Caixa/Itaú/Santander histories: `Parc Cred Imob`, `Prest Fin Imob`, `Fin Imobiliario`, `Ant Par Financ`, `Quitacao Finan` → FINANCING; `Tarifa Bancaria`, `Cesta`, `Enc Descob` → OPEX/BANK_FEE; TED/PIX from the owner's own name → FUNDING; anything else → review queue.

Tests (`investment-metrics.test.ts`, vitest): the Vale do Sol case from §2 as a fixture (expected cash basis 420.797,73; 58 financing rows; gross yield 6,68 %), XIRR against a known spreadsheet answer, payback crossing date on a synthetic series, SAC schedule row 1 = 3.850,04.

## 6. API routes (all behind `requireProfile` + `getOwnedProperty`)

| Route | Purpose |
|---|---|
| `GET/PUT /api/properties/[id]/investment` | acquisition + financings + assumptions in one payload |
| `GET/POST /api/properties/[id]/transactions`, `PUT/DELETE …/transactions/[txId]` | ledger CRUD with period/flow/category filters and CSV export |
| `POST /api/properties/[id]/transactions/import` | upload XLS/CSV/OFX, parse server-side (`xlsx` for XLS, small OFX parser), return a classified preview; `?commit=1` writes rows with `source = IMPORT`. PDF statements fall back to the LLM extraction pattern already used by `extract-bill` |
| `POST /api/properties/[id]/transactions/sync` | create rent rows from active leases (one `INCOME` row per month from `start_date`, `status = EXPECTED` until confirmed) and landlord-paid bill rows from `energy_bills` / `water_bills` |
| `GET /api/properties/[id]/metrics?asOf=&discountRate=` | runs the engine; cache per property for 5 min |
| `GET/POST /api/properties/[id]/valuations`, `POST …/valuations/fipezap` | manual/appraisal entries; FipeZap estimate = purchase price × index change for the city since acquisition |
| `GET /api/portfolio/metrics` | roll-up across all owned properties (totals + per-property table) |

## 7. UI

**7.1 Property page (`PropertyCostCenterDashboard`)** — pass `dbId` from `ProfileContent`, add a second KPI row and a new section.

- KPI cards: *Total investido*, *Renda líquida acumulada*, *Payback* (progress bar with % and forecast date), *Yield bruto / líquido*, *Cash-on-cash*, *TIR*. Empty state: "Cadastre a aquisição para ver a análise" with one CTA.
- **Payback curve** (Recharts area + line): cumulative invested as a step line (down payment, installments, capex) vs cumulative net income; shaded gap = remaining; dashed projection to the crossing date; markers for prepayments and payoff.
- **Monthly cash flow** (replaces the fabricated DRE): bars for income / opex / debt service, line for NOI, all from the ledger. Months without data fall back to the estimates and are hatched.
- **Financiamento** card: contract terms, paid vs remaining, interest paid to date, expected vs actual schedule, "Quitado em …" when paid off.
- **Lançamentos** table: inline add/edit, category filter, "Importar extrato" and "Sincronizar aluguéis e contas" buttons, review queue for unclassified imported rows.
- **Configurar investimento** modal (extends *Ajustar Custos*): acquisition fields, financing wizard (type the simulator header values), assumptions (discount rate, rent growth index, vacancy, market value override).

**7.2 Portfolio cards on `/imoveis`** — replace "(Estimativa base)" with real yield and payback % when data exists; add a totals strip (invested, NOI 12 m, blended yield, weighted payback).

**7.3 Dictionary keys** in pt/en/es for every label; pt first.

## 8. Phases

**Delivered ahead of phase 0 (2026-09-11): real income ledger.** `property_income_months` (migration `apps/web/database/property_income_2026_09.sql`), pure helpers in `lib/property-income.ts`, route `/api/properties/[id]/income` (GET / merge-PUT / DELETE), and `PropertyIncomeLedger` inside the cost-center dashboard: editable monthly rows (received, energy portion, other, agency %, derived net and gross rent, status previsto/confirmado), spreadsheet import with column mapping, and the dashboard's revenue, management fee and DRE chart now use the latest confirmed month when data exists. The `properties.id` is now passed into the dashboard, so that part of phase 0 is done. Phase 1's ledger keeps this table as the INCOME source and adds costs, capex and financing; a Banco Inter (Open Finance) integration will write `source = BANK` rows with `bank_reference`.

| Phase | Deliverable | Depends on | Effort |
|---|---|---|---|
| 0 | Add vitest to `apps/web` (move the parser checks in `property-income.ts` into a test) | — | 0.5 d |
| 1 | Migration (§4); engine (§5) with tests; `investment`, `transactions`, `metrics` routes; KPI row, payback curve, config modal, manual ledger | 0 | 3–4 d |
| 2 | Statement import (XLS/CSV/OFX + PDF fallback) with classifier and review queue; lease/bill sync; real monthly cash-flow chart replacing the fake DRE | 1 | 2–3 d |
| 3 | Valuations (manual + FipeZap); IRR, equity multiple, appreciation; IPCA-deflated payback; portfolio roll-up on `/imoveis` | 1 | 2 d |
| 4 | Scenarios ("what if I prepay X", "sell at year N", rent growth by index); PDF/XLSX report export; public "Calculadora de Payback de Imóvel" reusing the engine for SEO | 3 | 2–3 d |

Acceptance for phase 1, using the Vale do Sol attachments: enter the acquisition (R$ 377.000, 24/04/2018, down payment R$ 91.334,84), import the Bradesco XLS, and the page must show cash invested ≈ R$ 420.8k, 58 financing rows, loan status *Quitado em 25/08/2021*, gross yield 6,7 %, and a payback forecast consistent with the NOI entered.

## 9. Risks and decisions to confirm

- **Rent received vs contracted.** Until a tenant-payment feature exists, rent rows come from leases as *expected* and the owner confirms them in bulk ("marcar como recebido"). Decide whether unconfirmed months count in payback (default: yes, with a warning badge).
- **Management-fee estimate** (`managementFeePercent`) should apply only when `leases.management_type` is not `SELF_MANAGED`; today it is always applied.
- **Multi-family.** Ledger rows carry `unit_id`; metrics are property-level in phase 1 and per unit in phase 3.
- **Statement PII.** Imports contain account numbers and the owner's name. Store only the parsed rows, not the file, unless the user opts in, and then in a private bucket per the code review's storage findings.
- **Market value** is an input, not a fact; every KPI that depends on it is labelled "estimado".
