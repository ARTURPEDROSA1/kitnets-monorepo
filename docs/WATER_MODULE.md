# Água (Water Bills) Module

**Version:** 1.0  
**Last updated:** 2026-09-25  
**Author:** Kitnets Engineering

---

## 1. Overview

The **Água module** follows the water utility's bills of every rental property whose main water meter the landlord pays ("Água" under *Medidores Principais do Imóvel* on the property's details). Source of truth is the utility's bill (`water_bills`); gateway readings are a founder-only tool and are not part of it.

- **Hub** `/dashboard/water` — one card per property, the water utility's logo as the cover, a KPI strip and an "Atenção" list.
- **Property dashboard** `/dashboard/billing/[propertyId]` ("Gestão de Água & Contas") — the newest bill, twelve-month charts, the spreadsheet-style history, and the **current bill's PDF**.
- **Bill entry** `/dashboard/billing/[propertyId]/new` — drop the bill and the AI (`POST /api/extract-bill`) fills the form; on save the file is kept as the current PDF and, when the property has no logo yet, the utility's logo is read from the PDF header.

## 2. Files

```
apps/web/src/
├── app/[lang]/dashboard/
│   ├── water/
│   │   ├── page.tsx                      # Server: preloads getOwnerWaterPropertiesSummary
│   │   └── WaterHubContent.tsx           # Hub orchestrator: view in the URL, PDF viewer
│   └── billing/[propertyId]/
│       ├── page.tsx                      # One property's water dashboard (+ the current bill banner: logo, PDF)
│       └── new/page.tsx                  # Bill entry with AI extraction; keeps the file after the save
├── app/api/water-bills/
│   ├── route.ts                          # GET (property + bills + currentPdfUrl + logoUrl) · POST (upsert a bill)
│   ├── document/[propertyId]/route.ts    # POST (keep the current bill's PDF, read the logo) · DELETE
│   ├── logo/[propertyId]/route.ts        # POST (logo by hand) · DELETE
│   └── orphaned/route.ts                 # bills whose property was deleted
├── components/water/
│   ├── WaterHub.tsx                      # KPI strip, "Atenção", view pills, filters, the cards
│   └── WaterUnitCard.tsx                 # One card per property, the utility's logo as the cover
├── components/imobiliaria/AgencyLogo.tsx # The logo widget (upload / remove), reused with `endpoint`
└── lib/
    ├── water-hub.ts (+ test)             # summarizeWaterBills, views, rows, totals, attention (pure)
    ├── water-properties-server.ts        # The hub's list: properties with a main water meter + bill figures + signed file URLs
    └── water-bills-server.ts             # The water-bills bucket: current_bill.pdf, utility_logo.*, logo out of a PDF header

supabase/migrations/
└── 20260925180000_water_bills_bucket.sql # private bucket `water-bills`
```

## 3. Storage

Bucket **`water-bills`** (private, signed URLs; the routes use the service role):

| Object | Meaning |
|---|---|
| `{propertyId}/current_bill.pdf` | The current bill. One per property, like `energy-bills/current_bill.pdf`; the newest bill's file replaces it, an older bill's file never does (`referenceMonth` on the upload). |
| `{propertyId}/utility_logo.<ext>` | The water utility's logo — the cover of the property's card. Read from the header of the first digital PDF that comes in when the property has no logo yet (`extractLogoFromPdf`, the same code the agency extraction uses), or uploaded by hand on the property's page. Scans and photos carry no logo through this path. |

`water_bills.bill_pdf_url` is not written: `GET /api/water-bills` overlays the signed URL of the current PDF on the newest bill.

The property deletion cascade (`deletePropertyCascade`) empties the folder.

## 4. Hub (`/dashboard/water`)

- **KPIs** (`waterHubTotals`): properties with a main water meter (and how many have bills), consumption on the newest bills (and over 12 months), the newest bills' amounts (overdue / due within 7 days), cost per m³ (newest bills and 12 months), consumption spikes, PDFs kept (and logos read).
- **Atenção** (`waterAttention`, worst first): bill overdue (up to 45 days past the due date), bill due within 7 days, newest bill two or more months old, consumption 30% and 5 m³ above the 12-month average ("confira vazamentos"), a bill registered without its PDF, no bills.
- Views `?view=todos|com-contas|sem-contas`, search (name, connection, meter, address) and a city filter.
- **Cards** (`WaterUnitCard`): the logo as the cover (`CoverCarousel fit="contain"`, a droplet when there is none yet), connection and meter, address, two tiles (consumption with R$/m³; the bill amount with its due state), quick actions (view the current PDF, import a bill), the 12-month average. A card opens the property's dashboard.

## 5. API

| Route | Handler | Purpose |
|---|---|---|
| `GET /api/water-bills?propertyId=` | `requireProfile` | `{ property, bills, currentPdfUrl, logoUrl }`; the newest bill carries `bill_pdf_url` |
| `POST /api/water-bills` | `requireProfile` | upsert a bill on (property, month) |
| `POST /api/water-bills/document/[propertyId]` | `withAuth` | multipart `file` (+ `referenceMonth`): keeps the current PDF unless a newer bill exists; reads the logo when missing → `{ pdfStored, newerExists, logoExtracted, currentPdfUrl, logoUrl }` |
| `DELETE /api/water-bills/document/[propertyId]` | `withAuth` | removes the current PDF (the logo stays) |
| `POST /api/water-bills/logo/[propertyId]` | `withAuth` | multipart `file` (JPG/PNG/WebP/SVG ≤ 2 MB) → `{ logo_url }` |
| `DELETE /api/water-bills/logo/[propertyId]` | `withAuth` | removes the logo |

## 6. Changelog

- **2026-09-25 (v1.0)** — Hub redesigned in the shape of the other hubs (KPIs, Atenção, views, logo-covered cards); the current bill's PDF kept per property in the new `water-bills` bucket with a banner on the property's dashboard (view / send / replace / remove) and the bill-entry page keeping the file it read; the utility's logo read from the PDF header (or uploaded by hand) as the card's cover.
