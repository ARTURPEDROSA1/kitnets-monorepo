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
- Cross-record checks (uniqueness, ownership, foreign keys) do not belong in
  the schema; put them in `lib/<entity>-server.ts` and throw `badRequest` /
  `conflict` from there (see `lib/tenants-server.ts`).

## Migration status

| Family | Routes | Status |
|---|---|---|
| tenants | 3 files, 5 handlers | migrated (reference implementation) |
| agents | 3 files, 6 handlers (incl. multipart photo upload) | migrated |
| agencies | 4 files, 8 handlers (role-based: OWNER/ADMIN edit, OWNER delete; logo + agreement uploads) | migrated. `writeAgency` keeps the description-metadata fallback because the `agencies` table has no service-agreement columns yet |
| properties/*, portfolio, bank, water-bills/orphaned, gateways/claim | 27 handlers | already on `requireProfile`; wrapping them is mechanical |
| leases, energy-bills/* | 8 files | still `currentUser()` + inline profile lookup + hand-written validation; next candidates |
| cron/*, gateways/ingest, public calculators, AI endpoints | — | different auth (cron secret, ingest key, per-user limit via `requireUserWithLimit`); not for `withAuth` |
