# Kitnets.com — Full Code Review

Date: 2026-09-11 · Scope: entire monorepo (`apps/web`, `apps/edge-gateway`, `packages/*`, all SQL) · 371 commits, Dec 2025 → Sep 2026

---

## 1. Verdict

Kitnets is a large, fast-moving solo project: ~66k lines of TypeScript across 296 files in the web app, a Raspberry Pi gateway, 69 SQL scripts and a public content/calculator site that is already a real asset for SEO and lead capture. The product surface is impressive for nine months of work, and the domain understanding (SCEE solar credits, CEMIG/SAAE bill structures, Lei do Inquilinato, IRPF 2026) is real.

But it is not safe to open to other users today, and it is not yet a SaaS codebase. Five things dominate everything else:

1. **Authorization is broken end to end.** The Clerk middleware never fires for real URLs (all pages live under `/pt/...`, the matcher looks for `/dashboard`). Six API routes have no authentication at all, including one that lets anyone take over any account by email. Five `SECURITY DEFINER` database functions are callable with the public anon key and let anyone read or write any property's bills. Documents (matrículas, contracts, tenant IDs) sit in public storage buckets.
2. **Row Level Security does nothing for your own app.** The browser Supabase client never carries a Clerk token, so every owner-scoped policy evaluates to "deny", and the workaround was service-role keys in 27 files plus RLS-bypassing RPCs. Tenant isolation exists only as hand-written `.eq('owner_id', …)` filters, and several routes forget them.
3. **The production schema is unreproducible.** 69 loose SQL files, run by hand in the Supabase editor, with no ordering, versioning or record of what was applied. There is hard evidence of drift in both directions (columns the app uses that no SQL creates; columns SQL creates that production doesn't have). Two incompatible definitions exist for `articles`, `waitlist_leads`, `profiles.property_photos` and `get_property_bills`.
4. **The data model is per-user JSON, not multi-tenant relational.** No organization, no unit (kitnet) entity, no charges/invoices/payments ledger, no guarantees, no adjustment history. Buildings live as JSON blobs on `profiles`; `properties` rows are auto-created by fuzzy name match in three places.
5. **No engineering safety net.** No CI, no tests that run (one test file, no runner installed), no error tracking, no env validation, no backups, no migrations, 34 known dependency vulnerabilities including a Clerk middleware-bypass advisory and a critical Next.js advisory, and a 1.29 GB git history from committed Turborepo cache.

Three public calculators also give wrong tax figures (annual IRPF, PF rental tax, holding rental tax), which matters because those pages are your lead funnel.

None of this is unusual for a founder-built v1, and the fixes are well understood. The order matters: close the authorization holes this week, put the schema under migrations and add CI this month, then restructure the data model and frontend before adding payments or opening sign-ups.

---

## 2. Scorecard

| Area | State | Headline |
|---|---|---|
| Security & authorization | **Critical** | 6 critical, 9 high. Account takeover via `/api/profiles/create`; anon-callable RLS-bypassing RPCs; middleware matcher never matches; public document buckets. |
| Database & data model | **Critical** | Unreproducible schema, RLS ineffective, no org/unit/ledger model, PII tables world-readable. |
| Domain logic (calculators, indices, leases) | **Needs work** | 3 calculators wrong, lease terminate bug, AI model IDs retired, index pipeline mostly correct. |
| Frontend architecture | **Needs work** | Type-checks clean. 4,143-line god component, four copy-pasted CRUD modules, no data layer, half-done i18n, 219 `any`. |
| Edge gateway | **Needs work** | Signed-int counter bug, reboot loop on bad batch, unauthenticated LAN API returning the cloud token, runs as root. |
| DevOps & repo hygiene | **Missing** | No CI, tests, observability, migrations, backups, env validation, or `.env.example`. |

## 3. Metrics

| Metric | Value |
|---|---|
| TypeScript LOC (web / gateway / packages) | 66,338 / ~2,500 / ~800 |
| Page routes / API routes / server actions | 66 / 37 / 10 |
| `"use client"` files | 134 of 296 (45%) |
| Files using the service-role key | 27 |
| `any` occurrences | 219 |
| `console.log` / `console.error` | 85 / 280 |
| `alert()` / `confirm()` | 28 / 5 |
| Empty `catch {}` blocks | 44 |
| Dictionary keys pt / en / es | 2,022 / 1,582 / 1,503 |
| Tests that run | 0 (1 file, no runner) |
| `tsc --noEmit` | passes (only error: missing `vitest` types) |
| npm audit (prod deps) | 34 vulns: 4 critical, 23 high |
| Loose SQL files | 69 (root 9, `packages/core/database` 24, `apps/web/database` 36) |
| Git repository size | 1.29 GB (1,278 MB of `.turbo/cache` blobs in history) |
| Commits by month | Dec 63 · Jan 61 · Feb 125 · Sep 122 |

---

## 4. Fix this week (stop the bleeding)

Each item is one to four hours. Together they close every hole that lets a stranger read or write another person's data.

| # | Issue | Where | Fix |
|---|---|---|---|
| 1 | **Account takeover.** `/api/profiles/create` has no `auth()`, takes `clerkId`, `email`, `role` from the body and re-binds an existing profile with that email to the caller's Clerk id. | `apps/web/src/app/api/profiles/create/route.ts:16,37-79,87` | Require `auth()`; derive Clerk id and verified email from Clerk; drop `role` from the body. Long term: create profiles from a Clerk `user.created` webhook. |
| 2 | **Anon RLS bypass.** `get_property_bills`, `get_property_details`, `upsert_water_bill`, `get_latest_billing_rate`, `get_property_energy_bills` are `SECURITY DEFINER`, take a raw property id, and are executable by `anon`. Anyone with the anon key (it's in the JS bundle) can read and write any property's bills. | `apps/web/database/phase2_rpc_functions.sql:5-57`, `phase2_manual_entry.sql:34-141`, `packages/core/database/fix_gateway_property_link.sql:25-45`, `phase3_energy_bills.sql:126-134` | `REVOKE EXECUTE … FROM anon, authenticated, public;` Move billing reads/writes behind authenticated API routes with an owner check. |
| 3 | **Middleware never protects real pages.** Matcher is `/dashboard(.*)` but URLs are `/pt/dashboard/...`. Billing and gateway pages are client components with no auth and direct anon Supabase access. | `apps/web/src/middleware.ts:4,10`; `dashboard/billing/[propertyId]/page.tsx`, `.../new/page.tsx`, `dashboard/gateway/[id]/page.tsx`, `.../edit/page.tsx` | Matcher: `"/:locale(en\|pt\|es)?/(dashboard\|imobiliaria\|corretores\|profile\|proprietario\|imoveis\|inquilinos\|contratos\|onboarding\|anunciar)(.*)"`. Wrap every dashboard page in a server component that calls `auth()`. |
| 4 | **Public PII.** `leads` has `USING (true)` for SELECT and UPDATE (names, emails, GPS, user agents). `properties` has `"Public Read Properties" USING (true)`. `waitlist_leads` (plain CPF/CNPJ, addresses) readable by any `authenticated`. | `apps/web/database/fix_leads_duplicates_and_structure.sql:44,50`; `phase1_dashboard_setup.sql:13`; `waitlist_consolidated.sql:35` | Drop the three policies. Lead writes already run in server actions; use the service-role client there and keep no anon policies. |
| 5 | **Unauthenticated delete and claim.** `/api/delete-bill` deletes any water bill by id with the service role. `/api/gateways/claim` takes the target `userId` from the body and attaches gateways to any account. | `apps/web/src/app/api/delete-bill/route.ts:4-22`; `api/gateways/claim/route.ts:15-19,52-63` | `auth()` + ownership join on both; never accept `userId` from the client. |
| 6 | **Authenticated IDOR on energy bills.** `resolvePropertyUuid` returns any property without an owner filter; DELETE deletes any bill id; PUT's check is skipped for orphaned bills. | `apps/web/src/app/api/energy-bills/route.ts:25-34,526-529,619-624` | Add `.eq('owner_id', profile.id)` in the resolver; join bills to `properties.owner_id` for PUT/DELETE and deny on null. |
| 7 | **Open proxy / SSRF.** `/api/pdf-proxy` fetches any URL, no auth, `Access-Control-Allow-Origin: *`, cached publicly at the edge. | `apps/web/src/app/api/pdf-proxy/route.ts:5-42` | Require `auth()`; allow only `NEXT_PUBLIC_SUPABASE_URL` origin and `/storage/v1/object/` prefix; drop CORS and public cache. Better: signed URLs and delete the proxy. |
| 8 | **Unauthenticated AI and data-broker endpoints.** `identity/verify`, `ownership/analyze`, `energy-bills/extract`, `extract-bill`, `property/extract-contract`, `property/generate-description` call OpenAI/Gemini with no `auth()`; `enrichment/cpf` is a free CPF → name/phone lookup against BigDataCorp with the CPF in the query string. | `apps/web/src/app/api/identity/verify/route.ts:340-357`, `ownership/analyze/route.ts:508-531`, `enrichment/cpf/route.ts:4-19,41-49` | `auth()` on all seven; size/MIME checks; per-user rate limit; POST body for CPF; remove real PII from the mock at `enrichment/cpf/route.ts:70-73`. |
| 9 | **Cron fails open.** `if (process.env.CRON_SECRET && …)` means an unset secret makes the three index-update crons public. | `apps/web/src/app/api/cron/update-igpm/route.ts:11` (and the two siblings) | `if (!process.env.CRON_SECRET \|\| authHeader !== …) return 401;` |
| 10 | **Public document buckets.** `documents` and `lease-documents` are `public = true` and hold matrículas, IPTU, tenant IDs and signed contracts; `energy-bills` bucket is created public at runtime. Storage policies allow any `authenticated` user to insert/delete any object. | `packages/core/database/schema.sql:138-148`; `lease_setup.sql:214-228`; `apps/web/src/app/api/energy-bills/route.ts:294` | Make buckets private; serve with `createSignedUrl(path, 300)` from authenticated routes; scope storage policies by owner prefix. |
| 11 | **Upgrade Clerk and Next.** Installed `@clerk/nextjs` 6.36.5 is in the range of a published middleware route-protection bypass advisory; `next` 16.0.10 has a critical advisory (fix 16.3.5). | `apps/web/package.json` | `npm install @clerk/nextjs@latest next@16.3.5 eslint-config-next@16.3.5`, then `npm audit fix`. |
| 12 | **Lease terminate destroys notes.** `notes: body.notes?.trim() \|\| lease.status` writes the string `"ACTIVE"` into notes when none are supplied (the select only fetched `id, status`). | `apps/web/src/app/api/leases/[id]/terminate/route.ts:74` | Select `notes` and fall back to `lease.notes`. |

Verification query to run once in the Supabase SQL editor after the fixes:

```sql
select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' order by 1,2;
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_exec
  from pg_proc p where p.prosecdef and p.pronamespace = 'public'::regnamespace;
select id, public from storage.buckets;
```

---

## 5. Security & authorization (detail)

**Model as built.** Clerk authenticates; Supabase stores. Server routes use the service-role key (27 files), so RLS is bypassed by design and every route is an admin. The browser client (`apps/web/src/utils/supabase/client.ts`) sends the anon key with no user token, so RLS policies keyed on `auth.jwt()->>'sub'` deny everything, which is why commit `924d969` "reverted to RPC calls" and why the RPCs became `SECURITY DEFINER`. Only two places attach a Clerk-minted `supabase` template token (`ProfileContent.tsx:409-420`, `anunciar/Step9Review.tsx:21-25`), and that legacy pattern grants the `authenticated` role, which unlocks the over-broad `auth.role() = 'authenticated'` storage and waitlist policies.

**Seven policies use `auth.uid()`** (`lease_setup.sql:189-208`, `tenant_setup.sql:121-122`, `agent_setup.sql:107-108`, `phase1_dashboard_setup.sql:14`). Clerk subjects look like `user_2x…`, not UUIDs, so those policies can never match. `meter_readings` has RLS enabled with zero policies, yet the gateway page reads it from the browser. Either those pages don't work, or production has permissive policies not in the repo. Run the verification query above to find out.

**Other high/medium items**

- `water-bills/orphaned` GET returns every orphaned bill in the system and POST lets any user claim them (`route.ts:20-24,82-86`). Bills have no owner column, so orphaning erases ownership entirely.
- Gateway ingest uses one shared static secret for all devices, accepts any `meter_id`, overwrites history via upsert, and marks **all** gateways online on every call (`api/gateways/ingest/route.ts:6-8,22-35,43-46`).
- Lease routes insert `tenant_id`s from the body into `lease_tenants` without verifying ownership (`api/leases/route.ts:294-312`, `[id]/route.ts:320-331`) and the GET then joins tenant names.
- Global unique CPF/CRECI on `agents` acts as a cross-tenant existence oracle (`api/agents/route.ts:157-192`; `agent_setup.sql:62-69`).
- Server actions do mass assignment (`Object.assign(updatePayload, attribution_data)`) and update leads keyed by a client-supplied email (`save-index-lead.ts:93-103`, `save-calculator-lead.ts:77-79`). No rate limiting or captcha on any public form; 10 MB action bodies allowed.
- LLM extraction output overwrites `properties.address` without confirmation (`api/energy-bills/route.ts:388-423,573-592`). Treat extraction as a suggestion and zod-validate before persisting.
- Raw `error.message` returned to clients in ~20 routes; document text and extracted CPFs written to logs (`ownership/analyze/route.ts:546,554`).
- No security headers, no CSP, no rate limiting anywhere (`next.config.ts` has no `headers()`).
- SVG allowed into a public logo bucket; file extensions taken from client filenames (`agencies/[id]/logo/route.ts:12,100`).

**What's good.** `agencies`, `agents`, `tenants`, `leases`, `energy-bills/properties` and `sync-deletion` consistently do `currentUser()` → profile → owner check with solid input validators and soft deletes. No live secrets are in git. `poweredByHeader` is off.

**Recommended target.** Migrate to Supabase's native Clerk third-party auth so every client (browser, server, static) carries the Clerk JWT. Write one helper:

```sql
create function public.current_profile_id() returns uuid
language sql stable security definer set search_path = public as
$$ select id from profiles where clerk_id = auth.jwt()->>'sub' $$;
```

and make every policy `owner_id = current_profile_id()` (later `org_id in (select auth_org_ids())`). Reserve the service role for ingest, crons and webhooks. Add a `withAuth(handler)` wrapper that yields `{ userId, profileId, supabase }` to the 37 routes.

---

## 6. Database & data model (detail)

**Inventory.** ~30 tables touched by code. Four (`contact_messages`, `faq_questions`, `useful_link_suggestions`, `calculator_suggestions`) have no DDL in the repo. Three (`readings`, `meter_anomalies`, `meter_readings_hourly`) are dead or cannot be created (`phase1_dashboard_setup.sql:29,41` declares `meter_id TEXT REFERENCES meters(id)` where `meters.id` is uuid).

**Drift evidence**

- `profiles.additional_properties` (27 code refs) and `profiles.profile_photo_url` exist in prod but in no SQL.
- `energy_bills.pdf_url` exists in SQL (`phase3_energy_bills.sql:71,137`) but the code says it's not a column (commit `5b63588`).
- `get_property_bills` was "broken" (commit `329c8d9`), so the `DROP FUNCTION`/re-create in `phase2_manual_entry.sql:106` didn't land as written.
- `profiles.property_photos` is `text[]` in `schema.sql:99` and `jsonb` in `add_photos_to_profiles.sql:1`.
- `agency_allow_duplicate_cnpj.sql` drops `agencies_cnpj_key` but not `idx_agencies_cnpj_active` (`agency_soft_delete.sql:24`), so CNPJ is still unique.

**Model gaps for the product you described**

| Need | Today | Gap |
|---|---|---|
| Multi-tenant SaaS | Everything hangs off `profiles.id` (one Clerk user) | No `organizations` / members / roles. `agency_members` is the only membership table. |
| Buildings with many kitnets | `profiles.sub_units JSONB`, `profiles.additional_properties JSONB`; `properties` auto-created by name match in 3 code paths | No `units` table. Leases, tenants, meters and bills point at the building, not the unit. `properties.allocation_model` has nothing to allocate across. |
| Rent collection | `lease_charges` is a responsibility matrix | No `invoices`, `invoice_items`, `payments`, `receipts`. Nothing records what was due, paid, when, how (PIX/boleto), or late fees. |
| Reajuste | `adjustment_index` + `next_adjustment_date` on `leases` | No `lease_adjustments` history; no link to `economic_index_values`, so your own index tables can't drive it. `EXPIRING_SOON`/`EXPIRED` are stored, never derived. |
| Guarantees | `security_deposit`, `deposit_months` | No fiador, seguro-fiança, título de capitalização; no art. 38 cap check. |
| Solar / SCEE | `energy_bills` is a faithful CEMIG invoice snapshot | Consumer unit is free text per bill; "standalone UC" is a JSON string stuffed into `properties.electronic_id`. No generating unit, no beneficiary allocation %, no credit ledger with 60-month expiry per posto. Savings formula baked into a generated column. |
| Condominium | `lease_charges.charge_type = 'CONDOMINIUM'` | No `condominiums`, no fees, no rateio. |
| Rateio of shared bills | Not implemented anywhere | No split/allocation code or table. |
| Time-series | `meter_readings(meter_id TEXT, uuid PK)`, no FK, no partitioning, no retention | Rollup table can't be created. Ingest can write to any meter id. |
| Addresses | Three shapes: `profiles.address jsonb`, `properties.address text`, structured columns on `tenants`/`agencies` | One structured address type needed for CEP lookup, IPTU, DIMOB. |

**Integrity issues.** No index on `properties(owner_id)` (the most-filtered column, 29 call sites), `gateways(owner_id)`, `meters(property_id)`, `leases(agency_id)`. `updated_at` without triggers on six tables and five copies of the same trigger function. `float` for meter values; `reference_month TEXT`; `profiles.id` has no default; `properties.owner_id ON DELETE CASCADE` plus bill CASCADE means deleting a profile silently destroys everything (the nuke script had to unlink manually). `ownership_proofs.property_index` is a position in a JSON array and shifts on delete. Enum-like text with inconsistent casing (`'landlord'`, `'ACTIVE'`, `'Verde'`).

**LGPD.** `leads.consent_newsletter DEFAULT TRUE` (opt-out, not opt-in). `waitlist_leads` stores CPF/CNPJ/WhatsApp/address with no consent, retention or deletion fields. Founder email and a real address, hydrometer serial and 12 months of a real water bill are committed in `cleanup_duplicate_profiles.sql`, `nuke_artur_profiles.sql`, `phase2_water_bills.sql:149-276`.

**Target model (sketch).** Every domain row carries `org_id`; RLS is one predicate everywhere; physical things (property → unit → consumer unit → meter) are separate from legal things (person → lease party → lease → invoice → payment).

```
organizations, organization_members, users(clerk_id)
properties(org_id, kind, structured address, condominium_id?) → units(property_id, code, area, status)
people(org_id, pf|pj, cpf_cnpj) ; documents(org_id, subject_type, subject_id, path)
leases(org_id, unit_id, status, dates, rent, due_day, adjustment_index, management_org_id?)
lease_parties(role: tenant|guarantor) ; lease_guarantees ; lease_adjustments ; lease_charge_rules
invoices(lease_id, competence, due_date, status) → invoice_items(kind, amount, source_bill_id) → payments(method, paid_at)
consumer_units(org_id, utility, uc_number, property_id?, unit_id?) → utility_bills(consumer_unit_id, competence, items jsonb)
generation_units → credit_allocations(beneficiary, pct) → credit_ledger(competence, posto, kwh, expires_at)
gateways(org_id, serial, token_hash) → meters(unit_id?, consumer_unit_id?) → meter_readings PARTITION BY RANGE(read_at)
condominiums → condo_fees
```

Migration path: add `org_id` with a per-profile org backfill; materialize `properties`/`units` from the profile JSON once and freeze the JSON; split `tenants` into `people` + `lease_parties`; add `owner_id` + `consumer_unit_id` to both bill tables now (fixes the orphan leak) and fold them into `utility_bills` later; recreate `meter_readings` partitioned.

**Migration tooling.** Use the Supabase CLI. Baseline from production, not from the repo: `supabase init`, `supabase link`, `supabase db dump --schema public,storage > supabase/migrations/20260911000000_baseline.sql`, `supabase migration repair --status applied …`, then delete the 69 loose files (keep seeds in `supabase/seed.sql`). Every change after that is `supabase migration new`, reviewed in a PR, applied by CI with `supabase db push`, with `supabase gen types typescript` producing `database.types.ts` so the hand-written `types/*.ts` can retire.

---

## 7. Domain logic (detail)

### Calculators

| Calculator | Verdict | Issue |
|---|---|---|
| irpf-2026 (monthly) | Correct | Table, R$ 607,20 simplified, and the 2026 reduction (312,89 / 978,62 − 0,133145·R) all match Lei 15.191 + 15.270. |
| irpf-2026 (annual) | **Wrong** | `simplifiedDiscount: 17640.00` used as a fixed amount (`lib/irpf2026.ts:43,105-110`). The annual simplified discount is 20% of taxable income capped at R$ 16.754,34. A R$ 40k income deducts 17.640 instead of 8.000. Also the 65+ exemption is bundled into deductions and dropped when simplified wins; the annual table is the AC-2025 blend while the reduction only exists from AC-2026. |
| imposto-aluguel-pessoa-fisica | **Wrong** | Inherits the annual bug. Also charges the full 8.4% IBS/CBS in 2026 (`lib/rental-tax.ts:60-70,105-110`); 2026 is a 0.9% + 0.1% test year compensable with PIS/COFINS, and the R$ 600/month/property social reducer (LC 214 art. 260) is missing. |
| aluguel-na-holding | **Wrong** | Presumed profit computed on revenue net of PIS/COFINS (`HoldingRentalTaxCalculator.tsx:238-245,330-332`). Receita bruta for the 32% presunção is not reduced by PIS/COFINS. IRPJ adicional applied monthly on R$ 20k instead of quarterly on R$ 60k. Constants (32/15/10/9/0.65/3) are right. |
| imposto-minimo-altas-rendas | Correct | Threshold, R/60.000 − 10 ramp, cap, exclusions and redutor per Lei 15.270. |
| calculadora-reajuste-aluguel | Minor | Compounding over the correct window. Projection rows counted as real (`get-economic-data.ts:46-58` lacks `is_projection = false`); negative accumulations floored at 0 while the dictionary says negative reajustes are possible. |
| multa-atraso-aluguel | Minor | No correção monetária; 1% a.m. hard default (Lei 14.905/2024 makes SELIC − IPCA the legal default when the contract is silent); grace days subtracted from interest days. Not capping multa at 2% is correct for leases. |
| multa-rescisao-contrato-aluguel | Minor | Total days = months × 30.4167 instead of real dates; `new Date(startDate)` parsed as UTC; art. 4 §único exemption absent. |
| renda-aluguel | Minor | Uses nominal `annual/12` while `lib/mortgage.ts` uses effective conversion, so two calculators disagree on the same inputs. |
| aluguel-proporcional, conversor-juros, juros-compostos | Correct | |
| amortizacao-financiamento, independencia-financeira | Minor | SAC/PRICE correct; no TR/CET/fees; IR table approximation. |
| IPCACalculator | Minor | Window is (start, end] where BCB's Calculadora do Cidadão uses [start, end). State the convention. |

### Economic index pipeline

IGP-M (BCB SGS 189), IPCA and INPC (SIDRA 1737/1736) sources and upserts are correct and idempotent; spot-checked seed values match published figures. Issues: IVAR is regex-scraped from a third-party aggregator with 2026 hard-coded as fallback year (`cron/update-ivar/route.ts:83-89`); there is no SELIC/CDI cron and the seeded SELIC Nov/2025 and CDI Aug–Dec 2024 values look wrong; FipeZap is seeded with only 7 sparse months, and `lib/indexes.ts:77-83` compounds "the next 12 rows" regardless of gaps, so the 12-month figure spans two years; `api/fix-igpm` is an empty directory.

### Leases and bills

- `parseCurrency` in `api/leases/route.ts:14-20` turns `"1234.56"` into 123456.
- Date-only strings parsed with `new Date('YYYY-MM-DD')` render the previous day in Brazil (`LeaseProfileCard.tsx:31`, `TenantProfileCard.tsx:29`).
- `setMonth(+freq)` drifts for day-29/30/31 starts (`ContratosContent.tsx:312-317`); `rent_due_day` 29–31 unhandled.
- `availability_cost_kwh` defaults to 100 (`api/energy-bills/route.ts:344`); ANEEL REN 1.000 says 30/50/100 by phase.
- Solar savings valued at full tariff (`dashboard/energy/[propertyId]/page.tsx:262-265`); under Lei 14.300 GD II pays a growing share of TUSD Fio B. Prefer the bill's own compensated amount.
- Vision extraction "guards" fabricate `solarCompensatedKwh = grid − availability` and persist it as if read (`api/energy-bills/extract/route.ts:224-241`). No zod schema, no total-vs-items check.
- All Gemini calls pin `gemini-1.5-flash` (retired) or `gemini-2.0-flash` (deprecating), so every request silently falls through to `gpt-4o` with 12 MB high-detail images. Pin `gemini-2.5-flash` and a cheap OpenAI fallback; log usage.
- `packages/core/src/extraction/service.ts` is a `setTimeout` mock that `new-listing/page.tsx` imports in production.
- CPF/CNPJ check-digit validators are correct. CNPJ alfanumérico (valid from July 2026) is rejected by `replace(/\D/g,'')`.

---

## 8. Frontend architecture (detail)

**As built.** One `app/[lang]/` segment for marketing, auth and dashboard; one root layout that always renders `ClerkProvider` + a 761-line `Sidebar` + `Footer`; no route groups. Each dashboard module is a tiny server `page.tsx` that renders one giant `"use client"` `*Content.tsx` owning list, forms, modals, validation and `fetch('/api/…')` in `useEffect`. 590 `useState`, 0 SWR/React Query/react-hook-form/zod. Four data-access paths coexist (API routes, server actions, direct browser Supabase, server components with the admin client).

**High**

- `ProfileContent.tsx` is 4,143 lines: 37 `useState`, 12 `fetch`, 16 `alert()`, its own Supabase client (`:414`), and direct browser calls to `receitaws.com.br` (`:861`) and `viacep.com.br` (`:934`) even though `/api/cep` exists. At least seven independent features (identity verification, ownership proofs, property wizard, PF/PJ profile, AI description, contract import, media upload).
- Four copy-pasted CRUD modules totalling 6,481 lines (`ImobiliariaContent` 2,326, `ContratosContent` 1,546, `InquilinosContent` 1,436, `CorretoresContent` 1,173) with identical `fetchX`, `validate()`, `getStatusLabel` (8 copies), `pageState` machines and hand-rolled delete overlays.
- No data layer: 56 client `fetch` calls, 0 `AbortController`, 0 `revalidatePath`/`router.refresh`, 0 `useTransition`. Mutations refetch whole lists by hand.
- i18n half done: dashboard is hardcoded Portuguese, `en` missing 589 keys, `es` 666; 115 inline `lang === 'pt' ?` ternaries; pt links omit the prefix so every navigation goes through a middleware redirect.
- No `error.tsx`, no toast system, `alert()` as UX, 44 empty catches.

**Medium**

- No generated Supabase types; 233 untyped `.from()` calls; hand-written `types/*.ts` already drifted.
- `formatCurrency` defined in 21 files; CEP lookup implemented four ways; `lib/utils.ts` exports only `cn`.
- 144 raw `<input>` vs 35 uses of the `ui/input` primitive; 19 hand-rolled overlays vs 4 `ui/dialog`; two different `LeadCaptureModal`s.
- `packages/ui` exports one Button on Tailwind 3.4 consumed by a Tailwind 4 app; `packages/config` pins `eslint-config-next@15` and is not used by anything.
- CMS pages use the cookie-based Supabase client, making every `conteudos/*` page fully dynamic with no ISR; `indices/[code]` declares `revalidate` but reads `searchParams` so it builds dynamic.
- Recharts eagerly imported in 7 calculator/energy components outside the lazy-loaded indices set.
- 23 of 37 API routes re-declare an inline service-role client and the `clerk_id` profile lookup.

**Low.** Flagged-off pages (`alugar`, `anunciar`, `comprar`, `lancamentos`, `lista-vip`, `waitlist`, `new-listing`) are still built and listed in `sitemap.ts`, which also lists two non-existent calculator URLs. `middleware.ts` is the deprecated convention (Next 16 wants `proxy.ts`). Ten `react-hooks/exhaustive-deps` disables in files also compiled by React Compiler.

**Refactor order (solo dev).** 1) Generated DB types, `sonner`, `error.tsx`, vitest + CI, delete dead pages. 2) `lib/format.ts`, `MaskedInput`, `useCepLookup`, `ConfirmDialog`, `StatusBadge`; fold `packages/ui` in, delete `packages/config`. 3) `withAuth` wrapper; zod schemas per entity shared client/server; server components for reads, server actions + `revalidatePath` for writes. 4) Decompose Corretores first as the template, then Inquilinos, Contratos, Imobiliária. 5) Split `ProfileContent`. 6) Route groups `(marketing)/(auth)/(app)` and a decision on i18n. 7) CMS via static client + cache tags; lazy-load charts.

---

## 9. Edge gateway (detail)

**High**

- 32-bit counter assembled as a signed int: `(valMSB << 16) | valLSB` (`modbus.ts:174`) goes negative once MSB ≥ 0x8000 (21,474 m³ at 10 L/pulse, reachable for a building main). Use `(valMSB * 65536 + valLSB) >>> 0` and one `deltaU32()` helper instead of the six copy-pasted wrap formulas.
- Reboot loop: any non-2xx on the oldest 50 queued rows increments `consecutiveFailures`, and at 10 the process runs `sudo reboot` (`sync.ts:47-49,102-114`). A wrong token or one malformed row reboots the Pi forever and never advances the queue. Count only network errors, dead-letter 4xx batches, use the unused `attempts` column.
- Local API: `cors({ origin: true })`, no auth, `GET /api/config` returns the cloud ingest token in plaintext (`index.ts:98`), `/api/debug/reset-monthly` deletes history, `/api/restart`, `/api/meters/:id/reset` writes a PLC register with guessed bit semantics.
- Runs as root via `npm start`, `Restart=on-failure`, no sandboxing (`kitnets-gateway.service`). A hardened unit is in the appendix of the DevOps report section below.
- Modbus reconnect only fires when `!client.isOpen`, so a half-open socket wedges forever; `setInterval` polls overlap on a non-reentrant client; no backoff.
- `node-fetch@3` (ESM-only) required from a CommonJS build fails on Node 18/20 < 20.19; use global `fetch` with `AbortSignal.timeout`.

**Medium.** Queue writes "liters so far today" every 2 min per meter (720 redundant rows/meter/day) and drains at 50 rows / 5 min, so a week offline takes two days to catch up; timestamps are bare dates stored as `00:00Z` (21:00 BRT the day before). `DELETE FROM daily_snapshots WHERE daily_liters > 20000` runs on every boot and destroys exactly the leak days you want. Startup catch-up attributes today's use to yesterday. No WAL, no pruning, `db.init()` race on first boot. MQTT still connects to `test.mosquitto.org` and publishes the PLC's LAN IP. Three config sources, `zod` installed but unused. No device identity: the gateway never sends a serial; provisioning is a hand-inserted row. `update.sh` does `git pull` + `npm install` with no lockfile on the Pi and rebuilds `sqlite3` from source. `InstallPI.zip` (31 MB, includes `.env` and `node_modules`) and `data/kitnets-gateway.db` are committed.

---

## 10. DevOps, repo hygiene, SaaS readiness

| Gap | Evidence | Fix |
|---|---|---|
| No CI | No `.github/workflows`; `build_log.txt` is a committed record of a failed build | GitHub Actions: Node 22, `npm ci`, `turbo run lint type-check test build`; required check on `main`; Vercel preview per PR |
| No tests | 1 file imports `vitest`, not installed, no `test` script | Add vitest + `type-check` scripts in web and gateway; start with tax functions, `deltaU32`, date helpers, ingest schema |
| No env validation | `process.env.X!` in 27+ files; `CRON_SECRET` optional | `src/env.ts` with zod, imported from `next.config.ts`; `.env.example` for both apps (none exists; `GEMINI_API_KEY`, `BIGDATACORP_TOKEN`, `NEXT_PUBLIC_BASE_URL` are undocumented) |
| No observability | No Sentry/PostHog/log drain anywhere | `@sentry/nextjs` with PII scrubbing; Vercel log drain; gateway-offline cron alert |
| No backups | Only mention is a cron comment | Supabase Pro + PITR or nightly `pg_dump` to object storage; nightly SQLite backup from the Pi |
| Repo size | 1.29 GB; 55 `.turbo/cache/*.tar.zst` blobs (1,278 MB) in history | `git filter-repo --path .turbo --path apps/edge-gateway/InstallPI.zip --invert-paths`; force-push; re-clone |
| Tracked junk | `build_log*.txt`, `.turbo/*.log`, `kitnets-gateway.db`, `fipezap-serieshistoricas.csv`, 9 root SQL scripts, `check_db.js` | `git rm --cached`; extend `.gitignore` (`**/data/*.db`, `*.zip`, `build_log*.txt`) |
| Dependencies | `turbo`/`prettier` pinned to `latest`; `engines >=18` (EOL); `eslint-config-next` 15 vs 16; Tailwind 3 in `packages/ui` vs 4 in web; three PDF stacks (`pdf-parse`, `unpdf`, `pdfjs-dist`); `packages/core` exports a placeholder `add()`; gateway `eslint@8` with no config | Pin versions, `engines >=22` + `.nvmrc`, delete `packages/config`, align `packages/ui`, drop `pdf-parse`, remove the mock |
| Turbo env | `turbo.json` lists 4 of ~20 vars, one with a typo (`EXT_PUBLIC_CLERK_SIGN_IN_URL`) | Declare per-task `env` or `passThroughEnv`; add `type-check`/`test` tasks |
| Deployment undocumented | Only `apps/web/vercel.json` with crons; Root Directory must be set in the Vercel UI | Root README with architecture, run, deploy, env |
| Personal one-offs | `scripts/cleanup-clerk-users.mjs` deletes Clerk users matching a hard-coded email and will run against `sk_live` | Delete or guard |
| LGPD | Legal pages exist; no cookie banner (fine until analytics land); no data export/delete flow; CPF enrichment, identity documents and bills go to US LLM/data-broker sub-processors without disclosure | Consent banner before analytics; export/delete flow; list sub-processors in the privacy policy; retention for uploaded documents |

Hardened systemd unit for the gateway:

```ini
[Unit]
After=network-online.target time-sync.target
Wants=network-online.target
[Service]
User=kitnets
Group=kitnets
ExecStart=/usr/bin/node /opt/kitnets-gateway/dist/index.js
Restart=always
RestartSec=5
WatchdogSec=120
MemoryMax=300M
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/opt/kitnets-gateway/data
```

---

## 11. What a rental SaaS still needs (features, not fixes)

Cobrança (boleto/PIX with split to the imobiliária), recibos and prestação de contas / repasse, carnê-leão monthly DARF report and DIMOB export, automatic reajuste with tenant notice, inadimplência engine (multa/juros/correção per contract), garantias with the art. 38 cap, vistoria de entrada/saída, prazo-indeterminado and denúncia-vazia notice handling (arts. 46–47, 6), rateio of shared water/energy across units, IPTU/condomínio tracking per responsibility, condominium module, investment analysis on top of the cost-center dashboard (cap rate, IRR, vacancy), document vault with signed URLs and e-signature, tenant portal, CNPJ alfanumérico support, account export/deletion.

---

## 12. Roadmap

**Week 1 — stop the bleeding.** The twelve items in section 4. Rotate the Supabase service-role key and `GATEWAY_INGEST_KEY` afterwards (cheap insurance given the public buckets and RPCs).

**Month 1 — foundation.**
- Supabase CLI baseline from production; delete the 69 loose SQL files; `gen types` into `database.types.ts`.
- GitHub Actions (lint, type-check, test, build); vitest with the tax calculators as the first suite; fix the three wrong calculators.
- `env.ts` zod validation; `.env.example` per app; Sentry; backups; purge git history; pin dependencies; Node 22.
- `withAuth` route wrapper; zod schemas per entity; make buckets private with signed URLs.
- Gateway: signed-int fix, reboot-loop fix, auth on the LAN API, non-root unit, per-device tokens.

**Quarter — architecture.**
- Native Clerk ↔ Supabase auth; rewrite all policies on `current_profile_id()`; retire service-role from user-scoped routes.
- Data model: `organizations`, `units`, `people`/`lease_parties`, `invoices`/`payments`, `consumer_units`/`utility_bills`, `owner_id` on bills, partitioned `meter_readings`.
- Frontend: shared kit, decompose the four CRUD modules and `ProfileContent`, route groups, i18n decision, CMS caching.

**After that — SaaS features.** Payments (PIX/boleto), automatic reajuste, recibos/DIMOB, guarantees, rateio, condominium, investment analysis, tenant portal, sign-ups.

---

## 13. What's working well

- Consistent ownership checks and soft deletes in the agencies, agents, tenants and leases routes; good CPF/CNPJ validators.
- Correct BCB/SIDRA integrations for IGP-M, IPCA, INPC with idempotent upserts; correct monthly IRPF 2026 and IRPFM implementations; correct SAC/PRICE math.
- Type-check passes on a 66k-line codebase; React Compiler enabled; pdf.js correctly lazy-loaded; LLM SDKs confined to route handlers.
- Rich, current module docs in `docs/*_MODULE.md`; a genuinely useful public calculator and index site with lead capture wired in.
- The energy/SCEE bill model captures the right fields; the orphan-instead-of-delete idea for bills is right, it just needs an owner column.
