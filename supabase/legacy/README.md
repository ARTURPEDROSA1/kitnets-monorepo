# Legacy SQL (archived, read-only)

These 70 files are the hand-run scripts that built the database between
December 2025 and September 2026. They were executed manually in the Supabase SQL
editor, in an order nobody recorded, and production drifted away from them
(different policy names, columns that exist only in production, columns that exist
only here).

**Do not run anything from this folder.** It is kept for archaeology only.

- `root/` — files that lived at the repository root (`SUPABASE_SETUP.sql`,
  `SEED_HISTORY.sql`, index history updates, CMS setup, meter readings)
- `core/` — `packages/core/database/` (profiles, gateways, leases, tenants, agencies,
  agents, energy bills, RLS fixes, one-off cleanups)
- `web/` — `apps/web/database/` (dashboard phases, water bills, waitlist, CMS spec,
  FipeZap seeds, the September 2026 security fixes)

The authoritative schema is `supabase/migrations/`, starting from a baseline dumped
from production. See `../README.md`.

Some files contain real personal data (an e-mail address, a street address, a water
connection code). They should be purged from history the next time the repository is
rewritten to drop the committed Turborepo cache.
