# Novos Investimentos (Off-Plan Investments) Module

**Version:** 1.0
**Last updated:** 2026-09-22
**Author:** Kitnets Engineering

---

## 1. Overview

An off-plan unit ("comprado na planta") is not a property yet. For two to four years it is a
payment plan: a *quadro resumo* in a contract, a stack of monthly receipts, an INCC-M correction
nobody tracks, and a delivery date that keeps moving. Nothing in Imóveis fits it — there is no
rent, no tenant and no IPTU, so an income ledger has nothing to show.

**Novos Investimentos** is the incubator for those units. It answers four questions:

1. How much of this unit have I already paid, and how much of it is index correction?
2. What is due next, and is anything overdue?
3. When do the keys arrive, and what does the cash flow look like once rent starts?
4. When does it stop being a plan and become a property?

When the answer to (4) is "now", **Mover para Imóveis** creates the property and the rest of the
app — income ledger, lease, taxes, investment analysis — takes over. The investment stays here as
the record of what the unit cost to buy.

## 2. File structure

```
supabase/migrations/20260922180000_new_investments.sql   tables + investment-documents bucket

apps/web/src/lib/
  new-investments.ts               types, payment kinds, schedule expansion, matching (pure)
  new-investment-metrics.ts        the KPIs of a card and of the dashboard (pure)
  new-investment-cashflow.ts       the simulator behind the chart (pure)
  new-investment-extract.ts        AI prompt + normaliser for a purchase contract (pure)
  new-investment-upload-client.ts  browser side of the signed-URL uploads
  new-investments-server.ts        ownership, bundle reads, uploads, promotion
  schemas/new-investment.ts        zod input schemas

apps/web/src/app/api/investments/
  route.ts                         GET list (+ card summaries) · POST create
  [id]/route.ts                    GET bundle + metrics · PATCH · DELETE
  [id]/payments/route.ts           POST a ledger line
  [id]/payments/[paymentId]/route.ts   PATCH a cell · DELETE the line
  [id]/documents/route.ts          GET signed URLs · POST adopt a staged upload
  [id]/documents/[docId]/route.ts  DELETE
  [id]/promote/route.ts            POST → creates the property
  upload-url/route.ts              POST → signed upload URL
  extract/route.ts                 POST → reads the contract with AI

apps/web/src/app/[lang]/novos-investimentos/   page + list content
apps/web/src/components/investments/           card, dashboard, table, simulator, files, form,
                                               schedule editor (shared), plan dialog (the gear)
```

## 3. Data model

| Table | What it holds |
|---|---|
| `new_investments` | One row per unit: the quadro resumo header (price, entrada, valor a parcelar), the delivery dates, the correction indexes before and after the keys, the rent assumptions of the simulator, and `promoted_property_id` once it becomes a property. |
| `new_investment_schedules` | The payment **blocks** of the contract: "36 parcelas de R$ 3.547,50 a partir de 20/10/2026, mensal, INCC-M". Forecast only — never money paid. |
| `new_investment_payments` | One row per payment made (or planned), with `correction_amount` kept apart from `amount` and the receipt's object path. |
| `new_investment_documents` | Contract, marketing material, photos, floor plans, receipts. |

All four carry `owner_id` and have RLS on with no anon/authenticated grants; the routes use the
service role scoped by `requireProfile`, the same as every other owner-scoped table.

The `investment-documents` bucket is private: a read is always a signed URL.

### Editing the plan after the fact

Creation reads the quadro resumo from the contract once, but a plan does not stay still: the
delivery slips, the developer renegotiates, a block is read wrong, the contract is amended. The
gear on the dashboard (`InvestmentPlanModal`) is where that is fixed, and it is the only way to
change the forecast. It edits the contract header (price, entrada, valor a parcelar, dates,
indexes) and the blocks together, because they are one table in the contract.

`InvestmentScheduleEditor` is the block table itself, shared by the creation form and the gear, so
the two can never drift apart. The dialog mounts its form only while open and seeds state from
props once — a cancelled edit dies with the unmount, instead of being synced back by an effect.

Blocks are replaced wholesale (`PATCH` with `schedules`), never patched one by one. Recorded
payments are untouched: the instalments they already answer drop out of the forecast by month and
kind, as always.

### The payment table

Built on the shared table machinery, so it behaves like Receitas de Aluguel and the condominium
ledger rather than being its own thing:

| Piece | What it gives |
|---|---|
| `useColumnFilters` + `ColumnHeaders` / `FilterChips` / `ColumnMenu` | sort and filter from each header (dates by range, Tipo and Situação as checkbox lists with counts, values by min–max) |
| `useColumnVisibility` + `ColumnVisibilityMenu` | right-click a header to hide or show columns; the choice follows the account, not the device (`columnTableKey("investment-payments")`) |
| `useCellSum` + `CellSumBar` | click a cell and move with the arrows, Shift+arrows for a rectangle, Enter/F2 to edit, Esc to cancel, drag to select, and a floating bar with count, sum and average |

Above the table, the instalments the contract still owes are grouped into filter chips by kind —
"Parcelas mensais (140)", "Parcelas anuais (11)", "Início de obras (1)" — with the open total of the
chosen kind. That is there for one reason: an off-plan buyer who pays ahead escapes the INCC/CUB
correction those instalments would accumulate, and a plan of 140 monthly instalments plus 11 annual
ones cannot be acted on as one flat list. Picking a kind shows twelve of them instead of six,
because that is the moment the owner is lining payments up to anticipate. `pendingByKind` does the
grouping and is tested.

`INICIO_OBRAS` ("Início de obras") is a kind of its own: contracts routinely carry a payment tied to
the start of construction, months or years before the keys, and both can exist in one contract. It
used to land on `OUTROS`, which hid it from every reading of the plan. The extractor tests for
"obra" before "chave" for that reason.

"Parcela nº" is hidden by default — most contracts number their instalments implicitly — and
"Vencimento" is locked, since a payment with no date belongs to no month.

### Forecast versus reality

`expandSchedule` turns a block into dated instalments (the due day is clamped on short months, so a
31/08 first date lands on 30/09). `pendingInstalments` then removes the instalments a payment
already answers — same month, same kind — and what is left is what the owner still owes. This is
why the chart never double-counts a month, and why `remaining` shrinks as payments are entered
without anyone having to tick anything off.

The consequence worth knowing: **`committed` (paid + remaining) drifts above the contract price**,
because the INCC-M and IGP-M corrections actually paid are real money and the forecast carries no
projected correction. Every percentage on the page is against `committed`, not the headline price.

## 4. AI contract import

`POST /api/investments/extract` follows the lease import exactly (`lib/lease-extract.ts`): Gemini
on the PDF's text, OpenAI as the fallback, and a scanned PDF reaching OpenAI as **page images**,
never as a PDF — handed the file itself the chat models invent numbers, and a quadro resumo is
nothing but numbers.

What the prompt insists on, because it is where models go wrong:

- one block per line of the quadro resumo and per alínea (a, b, c…) of the payment clause, never
  summed together;
- values in CUB converted only when the contract itself states the amount in reais next to them;
- a garage spot sold separately is its own investment (`kind: "PARKING"`).

`periodicityFromSpan` then overrules a mislabelled block: "11 parcelas · 15/03/2027 → 15/03/2037"
is annual whatever the model wrote, because the dates come straight off the table.

Nothing is created by the route. The form shows what was read, the user corrects it, and only the
save creates anything — same contract as the Contratos import.

## 5. The cash-flow simulator

One row per month from the first movement to the end of the horizon:

- below the axis, `outflowPaid` (solid) and `outflowForecast` (hollow);
- above it, the net rent from `rentStart` on — gross rent less vacancy and running costs, with one
  adjustment every twelve months, the way a Brazilian lease behaves (not monthly compounding);
- a line for the running total, and a vertical marker at the key handover;
- `breakEvenMonth` is where the line crosses zero.

The assumptions live on the investment (`estimated_rent`, `rent_start_on`, `rent_adjustment_pct`,
`rent_vacancy_pct`, `rent_costs_pct`), so the chart is the same for everyone who opens it.
`rent_start_on` defaults to the month after the keys.

## 6. Promotion to a property

`POST /api/investments/[id]/promote` calls `createRentalProperty`, which writes both halves of a
property — the `properties` row that leases, bills and ledgers point at, and the profile JSON entry
the Imóveis page renders. The investment is then marked `COMPLETED` with `promoted_property_id`
set; it is never deleted, and the dashboard turns the button into a link to Imóveis.

The property name must be unique among the account's properties (the Imóveis page pairs rows and
JSON entries by name), so the dialog asks for it and surfaces the 409 as a field error.

## 7. Tests

`npm run test -w web` — 58 tests across four files, all pure:

- `new-investments.test.ts` — schedule expansion, day clamping, annual steps, matching.
- `new-investment-metrics.test.ts` — paid/remaining/committed, overdue, yields, `rentStartMonth`.
- `new-investment-cashflow.test.ts` — rent adjustments, paid vs forecast split, break-even.
- `new-investment-extract.test.ts` — the two contracts of the original request as fixtures.

The fixtures are the real thing: the studio (R$ 141.900 = 2 × 7.095 + 36 × 3.547,50) and the garage
spot (R$ 45.900 = 2 × 2.295 + 36 × 1.147,50).

## 8. Known gaps

- The forecast carries **no projected index correction**. INCC-M and IGP-M enter only as the
  `correction_amount` of a payment actually made. Projecting them would mean wiring
  `lib/indexes.ts` into the schedule expansion; the honest version was preferred over a guess.
- CUB-denominated instalments are stored in reais. A contract priced purely in CUBs (no reais
  alongside) arrives with `amount` null and its wording in the block's notes.
- There is no bank-statement import for payments, unlike the property transaction ledger.
