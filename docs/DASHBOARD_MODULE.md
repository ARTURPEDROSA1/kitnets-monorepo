# Dashboard (`/dashboard`)

**Version:** 1.0
**Last updated:** 2026-09-25
**Author:** Kitnets Engineering

---

## 1. Overview

The dashboard is the owner's landing page after signing in: the whole portfolio in one panel. It shows the
headline figures of the carteira, a Google map of the rental properties, the live projects and the agencies
with a contract in force, an "Atenção" list merged from every module, one card per module with that
module's own figures, and — only for the pilot accounts — the IoT gateways.

Every number is the number the module's own hub shows: the dashboard's maths (`lib/dashboard-hub.ts`) is
built on the hubs' pure modules (`lease-dashboard`, `tenant-dashboard`, `agent-dashboard`,
`agency-dashboard`, `energy-hub`, `water-hub`, `condominium-hub`, `project-hub`, `property-taxes`).
Strings are hard-coded pt-BR like every hub; `lang` only builds links.

The gateways ("Meus Gateways") are a founder-only pilot, not a product of Kitnets.com: the block is
rendered only for the accounts in `GATEWAY_PILOT_EMAILS` (default `pedrosa.ac@gmail.com`).

## 2. Files

```
apps/web/src/app/[lang]/dashboard/
  page.tsx                          # server: requireProfile() → loadDashboard() → <DashboardContent initial>
  DashboardContent.tsx              # client: the bundle, today, the pure figures, the one-off geocoding call
apps/web/src/components/dashboard/
  DashboardHub.tsx                  # the page: headline Tiles, map + Atenção, one card per module, gateways
  PortfolioMap.tsx                  # Google map (@vis.gl/react-google-maps) with legend and popups; a list without a key
  GatewaysSection.tsx               # the pilot's gateway cards (the old dashboard's)
apps/web/src/lib/
  dashboard-views.ts                # DashboardView (types only)
  dashboard-views-server.ts         # loadDashboard(), loadMapPins(), loadIncomeSnapshots(), loadTaxRowsByOwner()
  dashboard-hub.ts (+ test)         # occupancyOf, incomeFigures, taxFigures, dashboardTotals, dashboardAttention (pure)
  project-hub.ts (+ test)           # projectHubTotals, mappableProjects (pure; shared with Projetos)
  property-entries-server.ts (+ test) # the profile JSON's properties paired with `properties` rows (address, units, photos)
  geocode.ts (+ test)               # address keys, geocoder query, adapters, attachGeocodes, pinBounds (pure)
  geocode-server.ts                 # the `geocodes` cache, Google Geocoding / BrasilAPI CEP
  gateways-access.ts                # the pilot allowlist
apps/web/src/app/api/dashboard/route.ts   # GET: the bundle
apps/web/src/app/api/geocode/route.ts     # POST: geocode up to 25 missing addresses, return the pins
supabase/migrations/20260925190000_geocodes.sql
docs/DASHBOARD_MODULE.md
```

## 3. The page

### 3.1 Headline (six `Tile`s, each with the "?" explanation)

| Tile | Value | Source |
|---|---|---|
| Imóveis | properties; units and occupancy in the hint | `PropertyEntry[]`, `occupancyOf` |
| Receita do mês | Σ of each property's latest confirmed ledger month; NOI, margin and the month in the hint | `loadIncomeSnapshots` (the same maths as `GET /api/properties/income-summary`), `incomeFigures` |
| Aluguel contratado | Σ monthly rent of the contracts in force (ACTIVE / EXPIRING_SOON); next end in the hint | `hubTotals` |
| Pessoas abrigadas | distinct people (titular, co-tenants, occupants) on contracts in force | `TenantListView.leases` |
| Empregos apoiados | active corretores; those with a contract and the agencies with a contract in force in the hint | `agentHubTotals`, `agencyRows` |
| Impostos pagos em {ano} | IPTU + ITBI/outros paid by the owner from January to this month, in the month paid; "federais em breve" | `taxFigures` (no TaxScope: at portfolio level property + condominium IPTU add up to what the owner paid once) |

**Occupancy** = units with a contract in force ÷ rentable units. A multi-unit property counts each unit
named by a lease once, plus one per lease that names no unit (saved before leases pointed to units, or on
the whole building), never more than its units; a single-family property counts one; an entry without a
`properties` row cannot have leases yet. This differs from the property page's
"Ocupação" (lifetime months with rent) on purpose: the dashboard answers "how full is it today".

### 3.2 Map

`PortfolioMap` draws three kinds of pins: rental properties (emerald), live projects (amber: status
ACTIVE and not promoted to a property) and agencies with at least one contract in force (violet). The
legend toggles kinds; a pin opens a popup with the address and a link. The view fits the shown pins
(street level for one, the country for none). Without `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` the same pins are
listed instead.

Coordinates come from the `geocodes` cache, keyed by the normalized address (`normalizeAddressKey`:
lowercase, accent-free parts, CEP digits, country) — not by entity, because a property that lives only in
the profile JSON has no row and `properties.address` is a one-time copy. The page reads the cache only;
addresses it does not know are reported as `map.pending` and the client calls `POST /api/geocode` (up to
three batches per visit, stopping when nothing is left or nothing could be asked), which geocodes up to 25 of them with Google's Geocoding API (`GOOGLE_MAPS_SERVER_KEY`) or, without a
server key, BrasilAPI's CEP coordinates (CEP-level), writes them and returns the pins. Positive results
are permanent; negatives are retried after 30 days; a BrasilAPI result is upgraded the first time a Google
key exists — and keeps its CEP position when Google finds nothing better. Pins that share a position (a
CEP-level answer covers a street or a small town) are spread on a small circle so each can be clicked. The
legend is a Google map control and the notes about the addresses sit under the map, so the Google logo and
controls are never covered.

### 3.3 Atenção

`dashboardAttention` merges the modules' own lists (`attentionItems`, `tenantAttention`,
`agentAttention`, `agencyAttention`, `energyAttention`, `waterAttention`, `condoAttention`) plus the
projects' overdue instalments (rose) and instalments due within 7 days (amber), each tagged with its module
and linked to the record. Order: rose, amber, sky, emerald, slate; modules in their order within a tone.
The panel shows six and "ver todos".

### 3.4 Module cards

One card per module (Imóveis, Contratos, Inquilinos, Corretores, Imobiliárias, Energia, Água, Condomínio,
Projetos, Tributos) with four figures each, taken from the module's hub totals (`hubTotals`,
`tenantHubTotals`, `agentHubTotals`, `agencyHubTotals`, `energyHubTotals` over the rental units only,
`waterHubTotals`, `condoHubTotals`, `projectHubTotals`, `taxFigures`). "Economia potencial" on the Imóveis
card is the agencies' accumulated fee from the income ledger (`summarize().totalFee`), the SaaS value
proposition. The Projetos money figures are the hub's "Em andamento" slice (ACTIVE / ARCHIVED); sold projects
only add to the realized gain. A loader that failed shows "Não foi possível carregar" on its card and "—"
with "… indisponíveis" on the headline tiles that depend on it, never zeros.

### 3.5 Empty and new accounts

A brand-new account lands on `/dashboard` right after signing up, sometimes before its profile row
exists: `requireProfile()` answers 403, the page renders the unseeded client, which calls
`POST /api/profiles/create` and then `GET /api/dashboard`. With nothing registered the page shows the
first steps (cadastrar imóvel, importar contrato, novo projeto) above the zeros. "Importar contrato" opens
`/contratos?importar=1`, where the import of current contracts starts on arrival.

The old page's write-on-GET behaviours (relinking a profile by an unverified e-mail, nulling legacy
`property_*` columns) were not kept: the create route relinks by verified e-mail only, and the dashboard
counts properties through the same pairing the Imóveis page uses.

## 4. Data

`loadDashboard(supabase, profileId, userId)` runs every loader in parallel and records failures in
`failed` instead of throwing: `loadPropertyEntries`, `loadTaxRowsByOwner`, `loadLeaseRows`,
`loadTenantList`, `loadAgentList`, `loadAgencyList`, `getOwnerPropertiesSummary(userId)`,
`getOwnerWaterPropertiesSummary(userId)`, `loadCondominiumList`, `loadInvestmentList` (metrics computed
without signing photos), then `loadIncomeSnapshots`, the gateways (pilot only) and the map pins. The
energy and water loaders take the Clerk `userId` and, like the hubs, create `properties` rows for
profile-JSON properties still without one — so they run one after the other on a single energy result
(`getOwnerWaterPropertiesSummary(userId, energy)`): two concurrent runs would both insert the missing row.
The income snapshot applies the condominium's IPTU scope to properties with sub-units, like
`GET /api/properties/income-summary`.

`GET /api/dashboard` returns the same bundle; `POST /api/geocode` takes no body (the addresses come from the
account's own registers) and is limited to 10 calls per user per hour.

## 5. Environment

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | browser | Maps JavaScript API key, HTTP-referrer restricted (kitnets.com, the Vercel previews, localhost). Empty = the pins are listed instead of mapped. |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | browser | Cloud-console Map ID for advanced markers; Google's demo id when empty. |
| `GOOGLE_MAPS_SERVER_KEY` | server | Geocoding API key, IP/API restricted. Empty = BrasilAPI CEP coordinates. |
| `GATEWAY_PILOT_EMAILS` | server | comma-separated accounts that see the gateways block; the founder's when empty. |

All optional: previews and local builds do not need them. `NEXT_PUBLIC_*` values are inlined at build
time, so adding them in Vercel needs a redeploy.

**Before setting `GOOGLE_MAPS_SERVER_KEY`, put a daily request quota on the Geocoding API in the Google Cloud
console.** The per-user limit (10 calls × 25 addresses per hour) bounds one account, not the total across
accounts; only the quota caps the bill.

The gateways gate compares `profiles.email` exactly (case aside) with the list. That column is writable by
the owner, so the gate is cosmetic — it hides a block and guards no data (the gateway queries are
owner-scoped); never gate data on it.

## 6. Design decisions

- **Tiles, not the hubs' `Item`.** The dashboard is a set of figures to explain, not a strip above a
  filterable list, so it uses `components/properties/Tile` with the "?" popup like every entity dashboard.
- **Cache keyed by address.** See §3.2. An edited address is a new key; nothing needs invalidating.
- **No federal-tax estimate.** The calculators' formulas need a regime the profile does not store; the tile
  says "em breve, via Contábil & Fiscal" until that module produces real figures.
- **Rental units only for Energia.** The owner's own home or a relative's consumer unit is not a portfolio
  cost; the Energia hub keeps showing them.

## 7. Changelog

- **2026-09-25 (v1.0, review)** — Energy and water loaders run in sequence on one result (no duplicate `properties`
  rows); occupancy counts every unit-less lease; Projetos figures follow the hub's slices; taxes YTD stop at
  this month; unavailable figures read "—"; map legend as a Google control, notes under the map, overlapping pins
  spread, a CEP position kept when Google finds nothing, up to three geocoding batches per visit, 10 calls/hour;
  gateways fallback to other accounts' readings removed; `?importar=1` on Contratos.
- **2026-09-25 (v1.0)** — The dashboard rebuilt: headline Tiles, Google map with geocode cache, merged
  Atenção, one card per module, gateways gated to the pilot accounts; `lib/dashboard-hub.ts`,
  `project-hub.ts`, `property-entries-server.ts`, `geocode.ts` with tests; `GET /api/dashboard`,
  `POST /api/geocode`; migration `20260925190000_geocodes`.
