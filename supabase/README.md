# Database: schema as code

This folder is the **only** place database structure changes are allowed to live.
Everything in `supabase/migrations/` is applied, in filename order, by CI. The old
loose `.sql` files were archived under `supabase/legacy/` and are **not** a source
of truth: the security audit in September 2026 found four production policies that
existed under names no file in the repo knew about.

Project ref: `kqhfzcxqmjkqekozhlng` (also the hostname in `NEXT_PUBLIC_SUPABASE_URL`).

## One-time setup (do this once, on your machine)

The baseline must come **from production**, not from the legacy files, because
production has drifted from them.

```bash
# 1. Authenticate the CLI (opens the browser) and link this repo to the project.
#    `link` asks for the database password: Supabase dashboard → Settings → Database.
npm run db:login
npm run db:link

# 2. Dump the live schema (public + storage: tables, policies, functions, triggers,
#    buckets) into the first migration, and record it as already applied.
#    Schema only: no rows are exported.
npm run db:baseline

# 3. Generate the TypeScript types the app should use instead of the hand-written
#    files in apps/web/src/types/.
npm run db:types

# 4. Commit supabase/migrations/*_baseline.sql and apps/web/src/types/database.types.ts
```

Before step 2, set `major_version` in `config.toml` to the Postgres major shown in the
dashboard under Settings → Infrastructure, so the local database matches production.

## Every change after the baseline

```bash
npm run db:new -- add_units_table       # creates supabase/migrations/<timestamp>_add_units_table.sql
# write plain SQL in that file (see rules below)
npm run db:reset                        # applies ALL migrations to a fresh local DB (needs Docker)
npm run db:lint                         # catches common mistakes
git add supabase/migrations && git commit
```

Open a PR. The `db` workflow applies every migration to a fresh database and runs the
linter. When the PR merges to `main`, the same workflow runs `supabase db push` against
production. **Nobody runs SQL in the dashboard editor any more.** If you must (an
emergency), paste the same SQL into a migration file right after, then
`npm run db:repair -- <timestamp>` so CI does not try to apply it twice.

## Rules for migration files

- Idempotent by construction: `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`
  before `CREATE POLICY`, `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`,
  `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.
- One concern per file. Schema changes and data fixes never share a file; one-off data
  fixes go in `supabase/scripts/` and are run by hand, never committed with real
  personal data.
- Every new table: `ALTER TABLE … ENABLE ROW LEVEL SECURITY` in the same file, plus its
  policies. A table with RLS enabled and no policies is service-role-only, which is the
  correct default for anything the browser does not read directly.
- Policies scope by owner through
  `owner_id IN (SELECT id FROM public.profiles WHERE clerk_id = (SELECT auth.jwt() ->> 'sub'))`,
  never `auth.role() = 'authenticated'` and never `USING (true)` on user data.
- Storage buckets and their policies are created here too
  (`INSERT INTO storage.buckets … ON CONFLICT DO NOTHING`), not in the dashboard.
- Functions default to `SECURITY INVOKER`. A `SECURITY DEFINER` function must
  `SET search_path = public`, check ownership inside, and end with
  `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC, anon, authenticated` unless anon access is
  intended.

## CI secrets required (GitHub → Settings → Secrets and variables → Actions)

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens → Generate new token |
| `SUPABASE_PROJECT_ID` | `kqhfzcxqmjkqekozhlng` |
| `SUPABASE_DB_PASSWORD` | Dashboard → Settings → Database → Database password |

Until these exist, the PR check still runs (it only needs Docker) but the push-to-
production job is skipped.

## Local development

`npm run db:start` boots a full local Supabase (Postgres, Auth, Storage, Studio at
http://localhost:54323) with all migrations applied. `npm run db:stop` shuts it down.
Point `apps/web/.env.local` at the printed local URL and anon key to develop against it.
