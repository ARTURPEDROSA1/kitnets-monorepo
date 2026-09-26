# API routes: the `withAuth` convention

Every authenticated route under `apps/web/src/app/api` should be written as

```ts
import { withAuth } from "@/lib/api-route";
import { tenantInputSchema } from "@/lib/schemas/tenant";

export const POST = withAuth({ body: tenantInputSchema, tag: "Tenants POST" },
    async ({ body, profileId, supabase, params, req }) => {
        // business logic only
        return NextResponse.json({ ok: true });
    });
```

`withAuth` (in `lib/api-route.ts`) does, in order:

1. `requireProfile()` — Clerk session → `profiles.id`; answers 401 / 403 itself.
2. Optional per-user rate limit (`limit: { scope, limit, windowMs }`), shared
   counters in Postgres (`lib/rate-limit.ts`).
3. Awaits the route `params`.
4. If `body` is given: parses JSON (400 on malformed) and validates with the zod
   schema; failures answer `400 { errors: { field: "message" } }`, the shape the
   forms already render next to each field. The handler receives the
   **transformed** output (normalised CPF, E.164 phone, nulls for blanks…).
5. Runs the handler. A thrown `HttpError` (helpers: `notFound`, `forbidden`,
   `badRequest({ field })`, `conflict({ field })`) becomes that response; any
   other exception is logged, sent to Sentry and answered `500 { error }`.

## Schemas

One file per entity in `lib/schemas/`, exporting `<entity>InputSchema` and its
output type. Rules:

- Messages in Portuguese, identical to what the form shows.
- Required fields use `required_error` + `min(1, …)` so a missing key and an
  empty string produce the same message.
- Normalise in the schema (`transform`), never in the route: the route inserts
  the schema's output as-is.
- Cross-field rules (`superRefine`: "end date after start date", "agency
  required when agency-managed") only run once every individual field is
  valid, so their message appears after the field-level errors are fixed.
- Cross-record checks (uniqueness, ownership, foreign keys) do not belong in
  the schema; put them in `lib/<entity>-server.ts` and throw `badRequest` /
  `conflict` from there (see `lib/tenants-server.ts`).

## Migration status

| Family | Routes | Status |
|---|---|---|
| tenants | 5 files, 9 handlers (list + leases per tenant, create, update, soft delete, dropdown properties, photo upload/delete, dashboard) | migrated (reference implementation). `GET /api/tenants` now returns `{ tenants, leases }` with signed photo URLs and every lease keyed by tenant; `GET /api/tenants/[id]/dashboard` is the bundle the tenant's dashboard shows; `POST/DELETE /api/tenants/[id]/photo` keep the photo in the private `tenant-photos` bucket (`lib/tenant-views-server.ts`) |
| agents | 4 files, 7 handlers (incl. multipart photo upload, dashboard) | migrated. `GET /api/agents` returns `{ agents, leases, tenants }` (the leases and tenants that name a corretor); `GET /api/agents/[id]/dashboard` is the corretor's bundle (`lib/agent-views-server.ts`); `main_phone` is optional since migration `20260925170000` |
| agencies | 5 files, 9 handlers (role-based: OWNER/ADMIN edit, OWNER delete; logo + agreement uploads; dashboard) | migrated. `GET /api/agencies` returns `{ agencies, leases, tenants, agents }` — the account's rows that name an agency (`lib/agency-views-server.ts`); `GET /api/agencies/[id]/dashboard` is one agency's bundle. The service agreement, fee and contract dates are real columns (migration `20260916120000_agency_agreement_columns`) |
| leases | 6 files, 10 handlers (lease + additional tenants + charges, terminate, dropdowns, private document uploads, dashboard) | migrated. Additional tenants are now restricted to the account's own tenants. `POST /api/leases/extract` also reads the corretores named on the contract (`agents`) and matches them by CRECI, CPF or name (`matches.agents`); for a digital PDF whose agency is not registered yet it returns `agency_logo` too, the header image as a PNG data URL, which the import uploads as the logo of the agency it creates. `GET /api/leases/[id]/dashboard` returns everything one contract's dashboard shows in one request (lease with names, tenants, charges, signed documents, the tenant's contact, the property's income ledger over the lease's months, the index series); the Contratos page preloads the same bundle server-side (`lib/lease-views-server.ts`) |
| properties/*, portfolio, bank, water-bills/orphaned, gateways/claim | 27 handlers | already on `requireProfile`; wrapping them is mechanical |
| water-bills/document/[propertyId], water-bills/logo/[propertyId] | 2 files, 4 handlers | on `withAuth` (2026-09-25): the current bill's PDF and the water utility's logo in the private `water-bills` bucket (`lib/water-bills-server.ts`); `GET /api/water-bills` returns `currentPdfUrl` and `logoUrl`. See `WATER_MODULE.md` |
| condominium, condominium/[id], condominium/properties, properties/[id]/condominium | 4 files, 8 handlers | on `requireProfile`. `GET /api/condominium` is built by `lib/condominium-views-server.ts` (card figures + the property's photos from the profile JSON, `lib/property-photos-server.ts`); the Condomínio page preloads it server-side. See `CONDOMINIO_MODULE.md` |
| energy-bills/* | 3 files, 8 handlers | migrated. No body schema: the payload comes from the AI extractor, not a form, so handlers use `readJsonBody` and the pure builders in `lib/energy-bills-server.ts` (tested). The property deletion cascade, previously duplicated in two routes, is `deletePropertyCascade` |
| investments/* | 8 files, 13 handlers (investment + quadro resumo + payments + private uploads, AI contract import, promote to a property) | migrated. `POST /api/investments/extract` reads an off-plan purchase contract; uploads go through `POST /api/investments/upload-url` so a scanned contract or a floor plan is not stopped by Vercel's 4.5 MB body limit. `GET /api/investments/[id]` also returns `benchmarks` (CDI 12 m, FipeZap venda 12 m). `POST …/[id]/documents` has the AI sort a picture into Fotos/Plantas/Divulgação/Outros and reports it as `classified`; `PATCH …/[id]/documents/[docId] { kind }` moves a file by hand. `POST …/[id]/sell { sold_on, sale_price, sale_costs_pct }` registers the sale (status SOLD) |
| dashboard, geocode | 2 files, 2 handlers | on `withAuth` (2026-09-25). `GET /api/dashboard` is the bundle the dashboard shows (`lib/dashboard-views-server.ts`: every module's list view, the income snapshot, the taxes, the gateways for the pilot accounts, the map pins); the page preloads it server-side. `POST /api/geocode` (no body, 10/user/hour; the dashboard asks at most three times per visit) geocodes up to 25 of the account's addresses missing from the `geocodes` cache and returns the pins. See `DASHBOARD_MODULE.md` |
| cron/*, gateways/ingest, public calculators, AI endpoints | — | different auth (cron secret, ingest key, per-user limit via `requireUserWithLimit`); not for `withAuth` |
