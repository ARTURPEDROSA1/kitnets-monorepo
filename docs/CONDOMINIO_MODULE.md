# Condomínio Module

**Version:** 1.1  
**Last updated:** 2026-09-25  
**Author:** Kitnets Engineering

---

## 1. Overview

A multi-unit property's landlord also runs its **condominium**, a cost centre: the revenue is the condominium charged to every unit (the *Condomínio* column of Receitas de Aluguel, one row per month and unit — a vacant unit still owes it); the costs are energy, water and IPTU (read from the registers where the bills are uploaded) plus internet and maintenance (typed in `condominium_months`). Result = revenue − costs. One condominium per property (`condominiums`, PR #147/#148).

- **Hub** `/condominio` — one card per condominium with the **property's photos as the cover carousel**, a KPI strip and an "Atenção" list.
- **Condominium** `/condominio?id=<condominium>` — the property's photos, the name (renamable), settings (whether the monthly result counts as solar payback), and `CondominiumLedger`: period KPIs, the DRE chart and the spreadsheet-style monthly ledger.
- `/condominio?property=<properties.id>` (from the property page) opens the property's condominium or offers to create it.

## 2. Files

```
apps/web/src/
├── app/[lang]/condominio/
│   ├── page.tsx                          # Server: preloads loadCondominiumList + loadCondoProperties
│   └── CondominioContent.tsx             # Hub ↔ condominium (?id=); create / rename / settings / delete
├── app/api/condominium/
│   ├── route.ts                          # GET (list, via the views loader) · POST (create)
│   ├── [id]/route.ts                     # PATCH (name, notes, solar_payback_from_result) · DELETE
│   └── properties/route.ts               # GET the multi-unit properties (with condominium_id)
├── app/api/properties/[id]/condominium/route.ts   # GET months+costs · PUT cost rows · DELETE a month
├── components/condominium/
│   ├── CondominioHub.tsx                 # KPI strip, "Atenção", view pills, search, the cards
│   ├── CondominiumSquareCard.tsx         # One card per condominium, the property's photos as the cover
│   └── CondominiumLedger.tsx             # Period KPIs, DRE chart, monthly ledger (inline editing)
└── lib/
    ├── condominium.ts (+ test)           # Months, KPIs (latest, year to date, months without costs), summaries
    ├── condominium-hub.ts (+ test)       # Rows, totals and attention of the hub (pure)
    ├── condominium-server.ts             # Months per property (income ledger + bills + taxes + cost rows)
    ├── condominium-views-server.ts       # The list with card figures and photos; the multi-unit properties
    └── property-photos-server.ts         # The properties' photos out of the profile JSON, keyed by properties.id
```

## 3. Hub (`/condominio`)

- **KPIs** (`condoHubTotals`): condominiums (and units; how many count as solar payback), the newest month's revenue, costs and result (each condominium's newest month added up), the year's result with the margin, and the months of the year with revenue but no costs entered.
- **Atenção** (`condoAttention`, worst first): the newest month in the red, the year in the red, months without costs, a month with costs but no unit charging condominium, a month still "previsto", no months at all.
- Views `?view=todos|positivo|negativo` (by the year's result) and search (condominium, property, address).
- **Cards** (`CondominiumSquareCard`): the property's photos as the cover carousel (`CoverCarousel`, a building icon when the property has none), the units pill, a "retorno solar" badge when the setting is on, name and property, address, two tiles (the newest month's revenue with its costs; the result with previsto / confirmado / "custos a lançar"), the year's result and margin. A card opens the condominium.

## 4. Photos

`loadPropertyPhotos` (`lib/property-photos-server.ts`) reads the profile JSON — `property_photos` + `profile_photo_url` (the cover first) for the first property, `additional_properties[].savedPhotos` + `.profilePhotoUrl` for the rest — and pairs each entry with its `properties` row by id and, for the first property, by name (the same rules as `lib/property-units-server.ts`). The URLs are public (`property-media`); the list caps at 12 photos per property. `Condominium.photos` carries them to the cards and to the condominium header.

## 5. API

| Route | Purpose |
|---|---|
| `GET /api/condominium` | `{ condominiums }` — each with `kpis` (`latest`, `ytd`, `ytdMonthsWithoutCosts`, `ytdNegativeMonths`) and `photos` |
| `POST /api/condominium` | create the condominium of a multi-unit property |
| `PATCH /api/condominium/[id]` | name, notes, `solar_payback_from_result` |
| `DELETE /api/condominium/[id]` | removes the record and the property's cost rows |
| `GET /api/condominium/properties` | the multi-unit properties, with `condominium_id` when they have one |
| `GET/PUT/DELETE /api/properties/[id]/condominium` | the months (revenue, auto costs, cost rows), the cost rows, one month's costs |

## 6. Changelog

- **2026-09-25 (v1.1)** — Hub redesigned in the shape of the other hubs (KPIs, Atenção, views, search, cards with the property's photos as the cover carousel); the condominium view got a header with the photos, a delete modal instead of `confirm()`, and the view in the URL; `GET /api/condominium` moved to `lib/condominium-views-server.ts` and carries `photos`; `condominiumKpis` gained `ytdMonthsWithoutCosts` and `ytdNegativeMonths`.
- **2026-09-21 (v1.0)** — Condomínio cost centre (PR #147/#148): `condominiums` + `condominium_months`, revenue from the income ledger's Condomínio column, energy/water/IPTU read from their registers.
