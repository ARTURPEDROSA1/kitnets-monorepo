#!/usr/bin/env node
/**
 * One-time: capture the LIVE production schema as the first migration and
 * mark it applied, so `supabase db push` starts from reality instead of from
 * the legacy .sql files (which production had drifted away from).
 *
 *   npm run db:login     (once)
 *   npm run db:link      (once; asks for the database password)
 *   npm run db:baseline
 *
 * Produces:
 *   supabase/migrations/<timestamp>_baseline.sql   schema: public + storage
 *   supabase/seed.sql                              reference data only
 *                                                  (economic indexes, FipeZap, minimum wage, CMS taxonomy)
 * and runs `supabase migration repair --status applied <timestamp>`.
 *
 * Refuses to run if a baseline already exists.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const migrationsDir = resolve(root, "supabase/migrations");
mkdirSync(migrationsDir, { recursive: true });

const existing = readdirSync(migrationsDir).filter((f) => f.endsWith("_baseline.sql"));
if (existing.length) {
    console.error(`A baseline already exists: ${existing.join(", ")}. Nothing to do.`);
    process.exit(1);
}
if (!existsSync(resolve(root, "supabase/.temp/project-ref"))) {
    console.error("Project is not linked. Run: npm run db:login && npm run db:link");
    process.exit(1);
}

try {
    execSync("docker --version", { stdio: "ignore" });
} catch {
    console.error(
        "Docker is required: the Supabase CLI runs pg_dump in a container.\n" +
        "No Docker here? Use the GitHub Actions workflow instead: Actions → db-baseline → Run workflow\n" +
        "(needs the SUPABASE_* repository secrets, see supabase/README.md)."
    );
    process.exit(1);
}

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14); // YYYYMMDDHHmmss
const baseline = `supabase/migrations/${stamp}_baseline.sql`;

const run = (cmd) => {
    console.log(`\n$ ${cmd}`);
    execSync(cmd, { cwd: root, stdio: "inherit" });
};

// 1. Schema only (tables, RLS, policies, functions, triggers, storage buckets +
//    policies). No data: the CLI cannot dump a table subset, and a whole-schema
//    data dump would include personal data.
run(`npx supabase db dump --linked --schema public,storage -f ${baseline}`);

// 2. Tell the migration history table that production already has this state.
run(`npx supabase migration repair --status applied ${stamp}`);

const size = statSync(resolve(root, baseline)).size;
console.log(`
Baseline written: ${baseline} (${(size / 1024).toFixed(0)} KB)

Reference data (economic indexes, FipeZap, minimum wage, CMS taxonomy) is not
part of the baseline. To seed a fresh local database, export those tables from
the dashboard (Table editor → Export as SQL) into supabase/seed.sql.

Next:
  npm run db:types
  git add supabase apps/web/src/types/database.types.ts
  git commit -m "chore(db): baseline production schema"
`);
