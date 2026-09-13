# Backups

The Supabase Free plan keeps no backups. This repository does, every night, from
a GitHub Actions workflow ([.github/workflows/backup.yml](../.github/workflows/backup.yml)).

## What is backed up, where, for how long

| What | How | Where in the bucket | Kept |
|---|---|---|---|
| Database: schema `public` (tables, rows, policies, functions, grants) and `supabase_migrations` | `pg_dump` custom format, AES-256 encrypted with a passphrase only you hold | `database/daily/<UTC stamp>/db.dump.gpg` | 30 days |
| Same, taken on the 1st of each month | copy of that night's dump | `database/monthly/<stamp>/` | forever (delete by hand) |
| Storage metadata (`storage.buckets`, `storage.objects` rows) | best-effort `pg_dump --data-only`, encrypted | alongside `db.dump.gpg` as `storage-meta.dump.gpg` | same |
| Files in the Storage buckets (property photos, documents, bills, logos) | `rclone sync` from Supabase's S3 endpoint | `storage/<bucket>/…` | mirror; deleted files stay under `storage-history/<stamp>/` for 30 days |

Runs at 06:00 UTC (03:00 in São Paulo). Each run:

1. counts every row of every `public` table in production;
2. dumps, encrypts, and **restores the encrypted dump into a scratch Supabase
   Postgres 17 on the runner**, then checks the table list is identical and the
   row total is within 2 % of production (the gateway keeps inserting readings
   while the dump runs). Only then does it upload;
3. prunes daily copies older than 30 days;
4. if the storage keys are configured, mirrors the buckets;
5. writes a summary on the run page and, if `SENTRY_DSN` is set, reports to a
   Sentry cron monitor named `kitnets-nightly-backup`, which alerts when a night
   is missed or fails.

Not covered: Clerk users (Clerk keeps those), Vercel environment variables (keep
a copy of `apps/web/.env.example` filled in, in your password manager), the
gateway's local SQLite buffer (transient by design).

## One-time setup (about 15 minutes)

### 1. A bucket outside Supabase

Any S3-compatible bucket works. Cloudflare R2 is the default assumption: free up
to 10 GB, no egress fees, and a different company from Supabase and Vercel.

1. Cloudflare dashboard → **R2 Object Storage** → *Create bucket* → name
   `kitnets-backups`, location *Automatic*. Leave it private (no public access).
2. R2 → *Manage R2 API Tokens* → *Create API token*: permission **Object Read &
   Write**, *Specify bucket* → `kitnets-backups`, TTL *Forever*. Copy the **Access
   Key ID**, **Secret Access Key** and the **endpoint** shown
   (`https://<account-id>.r2.cloudflarestorage.com`).

Another provider (AWS S3, Backblaze B2, Wasabi): set the endpoint accordingly and
add repository *variables* `BACKUP_S3_PROVIDER` (rclone provider name, e.g. `AWS`)
and `BACKUP_S3_REGION` (e.g. `sa-east-1`).

### 2. The passphrase

Generate a strong one and store it in your password manager **before** adding it
to GitHub. Without it every backup is unreadable; there is no recovery.

```bash
openssl rand -base64 32
```

### 3. GitHub secrets

GitHub → repository → *Settings* → *Secrets and variables* → *Actions* →
**New repository secret** (the same place as the `SUPABASE_*` secrets already
used by the migrations workflow). Names must match exactly.

| Secret | Value |
|---|---|
| `BACKUP_S3_ENDPOINT` | the endpoint from step 1 |
| `BACKUP_S3_BUCKET` | `kitnets-backups` |
| `BACKUP_S3_ACCESS_KEY_ID` | from step 1 |
| `BACKUP_S3_SECRET_ACCESS_KEY` | from step 1 |
| `BACKUP_PASSPHRASE` | from step 2 |
| `SENTRY_DSN` *(optional, recommended)* | the same DSN as `NEXT_PUBLIC_SENTRY_DSN` in Vercel; enables the missed-run alert |
| `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY` *(optional, recommended)* | Supabase dashboard → *Storage* → *Settings* → *S3 Connection* → *New access key*. Enables the files mirror. |
| `SUPABASE_DB_URL` *(optional)* | only if the pooler lookup through the Management API ever fails: the *Session pooler* connection string from *Connect* in the dashboard, password filled in |

Already present from the migrations workflow: `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`.

### 4. First run, by hand

*Actions* → *backup* → *Run workflow*. Open the run: the summary lists the table
count, the restore-drill result and the bucket size. Then look in the bucket:
`database/daily/<stamp>/` should contain `db.dump.gpg`, `MANIFEST.txt`,
`SHA256SUMS` and, usually, `storage-meta.dump.gpg`.

If `SENTRY_DSN` was set, Sentry → *Monitors* now shows `kitnets-nightly-backup`.
Turn on its alert (*Alerts* → *Create alert* → *Cron monitor*) so a missed night
reaches your e-mail.

## Restoring

Everything below needs `pg_restore` 17 and `gpg`, and the passphrase in the
environment (`export BACKUP_PASSPHRASE=…`) or typed when prompted.

Download a backup first:

```bash
rclone copy dest:kitnets-backups/database/daily/<stamp> ./restore   # or the R2 web UI
```

### A. Production is gone or corrupt: restore into a (new) Supabase project

1. Create the project (same region, Postgres 17). Note its ref and password.
2. Restore the schema and data. This replaces everything in `public`:

   ```bash
   scripts/backup/restore-db.sh restore/db.dump.gpg \
     "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require" \
     public supabase_migrations
   ```

   `supabase_migrations` makes the new project know which migrations are already
   applied, so `supabase db push` continues from there.
3. Files: create the buckets (names in `storage-meta` or in the mirror folder
   listing) with the same public/private setting, then copy the mirror back:

   ```bash
   rclone sync dest:kitnets-backups/storage supa:   # supa = new project's S3 endpoint
   ```

   Then restore the object metadata so the app finds them:

   ```bash
   scripts/backup/restore-db.sh restore/storage-meta.dump.gpg "<url>" storage
   ```
4. Point Vercel's `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   and `SUPABASE_SERVICE_ROLE_KEY` at the new project and redeploy.

### B. Someone deleted the wrong rows: recover one table

Restore into a scratch database, then copy what you need across. Never run a
full restore against production for this.

```bash
# scratch database with the Supabase roles: `supabase start` locally, or
# docker run -e POSTGRES_PASSWORD=x -p 54329:5432 supabase/postgres:17.6.1.171
scripts/backup/restore-db.sh restore/db.dump.gpg postgresql://postgres:x@localhost:54329/postgres public

# inspect, then move rows with psql \copy, or pg_dump -t public.<table> --data-only
# from the scratch database and load into production.
```

### C. Just look inside a backup

```bash
gpg -d restore/db.dump.gpg > db.dump
pg_restore --list db.dump | grep 'TABLE DATA'          # what is in it
pg_restore --data-only -t contracts -f contracts.sql db.dump   # one table as SQL
```

## Ad-hoc backup before something risky

With the `SUPABASE_*` variables exported (values from the dashboard, never
committed), or a `DB_URL`:

```bash
npm run db:backup            # → ./backup-<stamp>/db.dump (+ storage-meta.dump)
```

The output is **not** encrypted; keep it off shared drives and delete it after.

## Checking it still works

- Once a month, open the latest *backup* run: green, summary shows the table
  count you expect, "Restore drill" line present, bucket size growing slowly.
- Twice a year, do procedure B for real on your machine. The drill in CI proves
  the file restores; doing it yourself proves *you* can.
- If the repository sees no commits for 60 days GitHub pauses the schedule. The
  Sentry monitor catches that; re-enable under *Actions* → *backup* → *Enable
  workflow*.

## Design notes

- Custom-format dumps (`-Fc`) rather than plain SQL: compressed, integrity-checked
  by `pg_restore --list`, and restorable table by table.
- `--no-owner` so a dump restores under whatever role you connect with;
  grants are kept because the app relies on `anon`/`authenticated`/`service_role`.
- Connection goes through Supabase's session pooler (IPv4) because GitHub's
  runners have no IPv6 and the direct host is IPv6-only on the Free plan.
- Encryption is symmetric (`gpg --symmetric`, AES-256) on purpose: one passphrase,
  no key files to lose, decryptable anywhere `gpg` exists.
- The storage mirror is not encrypted client-side; the bucket is private and
  encrypted at rest by the provider. Turning on rclone's `crypt` would add key
  management to every restore for files that are already access-controlled.
