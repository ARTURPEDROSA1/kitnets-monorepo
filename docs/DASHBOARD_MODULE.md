# Dashboard (`/dashboard`)

**Version:** 2.0
**Last updated:** 2026-10-12
**Author:** Kitnets Engineering

---

## 1. Overview

The dashboard is the owner's landing page after signing in, and it answers one question first: **did this
month's rent come in?** A four-part strip (esperado, recebido, a vencer, vencido) sits over the month's rents,
shown as a board (a spreadsheet in due-date order) or as a calendar; beside it the month's bills and
instalments, the contract dates ahead and the result of the last closed month; under it the portfolio
(occupancy, contracted rent, the potential saving of self-management). Receipts posted since the owner's last
visit stay lit for the visit. The page only reads: every row and card opens its own hub.

Every number is the number the hubs and the ledger show: the maths (`lib/dashboard-hub.ts`) is built on
`lease-dashboard`, `property-income`, `invoice-hub`, `energy-hub`, `water-hub` and `property-taxes`. Strings
are hard-coded pt-BR like every hub; `lang` only builds links. Product context for design work lives in
`apps/web/PRODUCT.md`; the page's direction contract in `apps/web/.impeccable/surfaces/`.

The gateways ("Meus Gateways") are a founder-only pilot at the bottom of `/proprietario`
(`GATEWAY_PILOT_EMAILS`); see `docs/GATEWAY_DASHBOARD_MANUAL.md`.

## 2. Files

```
apps/web/src/app/[lang]/dashboard/
  page.tsx                          # server: requireProfile() → loadDashboard() → <DashboardContent initial>; skeleton fallback
  DashboardContent.tsx              # client: the bundle, today, the month shown, board/calendar (view:dashboard), seen:dashboard
apps/web/src/components/dashboard/
  DashboardHub.tsx                  # the page: header, strip, side column, portfolio cards, "?" dialog
  RentBoard.tsx                     # the board (spreadsheet machinery: sort, filter, hide, cell sums)
  RentCalendar.tsx                  # the calendar; an agenda list on phones
  ink.ts                            # the status text colours (CSS variables --dash-* in globals.css)
apps/web/src/lib/
  dashboard-views.ts                # DashboardView (types only)
  dashboard-views-server.ts         # loadDashboard(), loadDashboardLedger(), loadTaxRowsByOwner()
  dashboard-hub.ts (+ test)         # monthRents, rentTotals, freshRentIds, monthOutflows, contractDates, monthResult, occupancyOf… (pure)
  map-pins-server.ts                # the portfolio's map pins (POST /api/geocode); no page draws them since v2.0
apps/web/src/app/api/dashboard/route.ts   # GET: the bundle
docs/DASHBOARD_MODULE.md
```

## 3. The page

### 3.1 Header

"Aluguéis de {mês}" with ‹ › to walk back through the last twelve months; "Hoje, dd/mm" and how many receipts
are new since the last visit; the Quadro | Calendário switch (remembered in the account as `view:dashboard`)
and the "?" with how to read the page.

### 3.2 The strip

| Part | Figure | Rule |
|---|---|---|
| Esperado em {mês} | Σ contract rent of every contract that owes rent in the month | `monthRents` + `rentTotals` |
| Recebido | Σ gross rent the ledger confirmed (or a paid invoice); the net under it | `received.gross` / `received.net` |
| A vencer | Σ contract rent not in yet, due date today or ahead; the next date | `status = a_vencer` |
| Vencido | Σ contract rent not in yet, due date passed; since when | `status = vencido` |

A thin bar along its bottom splits recebido / a vencer / vencido.

**Who owes rent in a month** (`owesRentIn`): never a draft or a cancelled contract, never in the contract's
first month (its first rent falls due the month after, the ledger's rule), a closed contract until its end, a
contract in force with a tenant's notice until the move-out day; a contract in force past its term keeps
paying. The due date is the contract's due day in the month (the month's last day when shorter), or the
month's Kitnets invoice due date when the owner bills it.

**What came in** is read from the income ledger (`property_income_months`, confirmed rows): a unit's contract
reads that unit's rows; a whole-property contract reads the rows saved without a unit, or every row of the
property when it is the only contract paying there that month. A paid Kitnets invoice counts even before the
ledger shows it. Without a receipt a rent past its due date is **vencido**, and the board says "sem lançamento"
unless an invoice is late: until the bank statement sync is live, vencido may also mean a deposit nobody posted
yet. When the ledger has nothing for the previous month, an amber note says so.

### 3.3 Board and calendar

**Quadro** (`RentBoard`, table key `dashboard-rents`): Venc. (a dot in the status colour), Contrato (the unit
first, the building and the tenant under it), Situação (recebido dd/mm, vence em N dias, vencido há N dias,
the invoice number when unpaid), Aluguel, Recebido, Líquido, Gestão (with the agency's %). Sums at the bottom;
sorted by due date in the current month a "hoje, dd/mm" line splits what fell due from what is ahead.

**Calendário** (`RentCalendar`): Sunday first; each rent on its due day coloured by status, three or more
rents of one property on one day folded into one chip, except an overdue rent, which always keeps its own
chip; the month's bills, instalments, adjustments and contract ends beside them. A day whose rents all came in
turns emerald, a day with an overdue rent rose; today is outlined. Below `md` it is the list of the days that
have something.

**Novo**: the preference `seen:dashboard` keeps the newest ledger change a visit has seen (`newestLedgerChange`,
saved four seconds into the visit, this device's copy and the account's). Receipts whose row changed after it
are lit (`freshRentIds`) for the whole visit; a first visit lights nothing.

### 3.4 Side column

Beside the board from 85rem, under it below that. **Contas e parcelas** (current month only): the newest
energy bill of each rental unit and the newest water bill of each property due in the month, the projects'
next instalment due in the month and the projects with instalments already late. **Datas dos contratos**: the
adjustments and ends of the contracts in force in the next 60 days (in the month, for a past month); no
adjustment after a term still running out. **Resultado de {mês}**: the last closed month (or the month shown,
when past) from the confirmed ledger rows with the owner's IPTU of the month as a cost — NOI, margin, and one
bar of the revenue split into the agencies' fee, other costs and the result.

### 3.5 A carteira

Ocupação (units with a contract in force, one square per unit up to 60; people housed), Aluguel contratado
(Σ rent in force split by management), Economia potencial com autogestão (the agencies' fee over every
confirmed month, the last twelve beside it — the SaaS value proposition).

### 3.6 Empty, loading and failures

A brand-new account may land before its profile row exists: the unseeded client calls
`POST /api/profiles/create` and then `GET /api/dashboard`. With nothing registered the page shows "Comece pela
carteira" with a link to Imóveis. Loading draws the strip, board and side column as shapes. A loader that fails
is listed under the page; the strip reads the failure instead of zeros when contracts or the ledger are down.

## 4. Data

`loadDashboard(supabase, profileId, userId)` runs the loaders in parallel and records failures in `failed`:
`loadPropertyEntries`, `loadTaxRowsByOwner`, `loadLeaseRows`, `loadTenantList` (only the count of people
housed is kept), the energy then water summaries (in sequence on one energy result: two concurrent runs would
both create the missing `properties` row), `loadInvestmentList` (metrics without signing photos),
`loadInvoiceRows` and `loadDashboardLedger`. The ledger loader pages through every confirmed row (for the
all-time and twelve-month agency fee, per property like the property cards) and the expected rows of the
window, and ships the last twelve months of rows with `updated_at`.

## 5. Design decisions

- **Money first.** The owner chose (2026-10-12) "did the money arrive?" as the page's first answer, a layout
  for landlords at large, and the app's look kept. Map, Atenção list, social figures and module cards were not
  required to survive; the board and the calendar won the layout round.
- **No accusation without evidence.** "Vencido" means the ledger has no receipt; the board says "sem
  lançamento" unless a Kitnets invoice is late.
- **Colours from variables.** Tailwind's `dark:` follows the system while the app's theme is a class; the
  status text colours come from `--dash-*` so they follow the theme.
- **The map is parked.** `PortfolioMap`, the geocode cache and `POST /api/geocode` stay in the code for
  whichever page shows the pins next; the dashboard no longer calls them.

## 6. Changelog

- **2026-10-12 (v2.0)** — Redesigned money first: strip + board / calendar of the month's rents, side column
  (bills and instalments, contract dates, the closed month's result), portfolio cards, "novo" since the last
  visit (`seen:` preference kind), month navigation over twelve months. Map, Atenção, headline tiles and module
  cards removed; agents, agencies and condominium loaders dropped; map pins moved to `lib/map-pins-server.ts`.
- **2026-10-04 (v1.1)** — Header actions removed; "Meus Gateways" moved to `/proprietario`.
- **2026-09-25 (v1.0)** — Portfolio panel: headline Tiles, Google map with geocode cache, merged Atenção, one
  card per module.
