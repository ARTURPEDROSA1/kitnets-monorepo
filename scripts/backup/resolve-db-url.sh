#!/usr/bin/env bash
# Prints a postgresql:// URL for the production database.
#
# Uses the Supavisor *session* pooler (port 5432): it is reachable over IPv4,
# which GitHub-hosted runners need, and pg_dump/pg_restore work through it.
# The pooler host is looked up through the Supabase Management API so nothing
# region-specific is hard-coded.
#
# Env:  SUPABASE_ACCESS_TOKEN  SUPABASE_PROJECT_ID  SUPABASE_DB_PASSWORD
#       SUPABASE_DB_URL (optional) — if set, printed as-is and nothing is looked up.
set -euo pipefail

if [ -n "${SUPABASE_DB_URL:-}" ]; then
  printf '%s\n' "$SUPABASE_DB_URL"
  exit 0
fi

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"
: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"

api="https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID"
pooler=$(curl -fsS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$api/config/database/pooler")

read -r host user db < <(POOLER_JSON="$pooler" node -e '
  const j = JSON.parse(process.env.POOLER_JSON);
  const list = Array.isArray(j) ? j : [j];
  const p = list.find((x) => x.database_type === "PRIMARY") || list[0];
  if (!p || !p.db_host || !p.db_user) {
    console.error("Unexpected pooler response: " + JSON.stringify(j));
    process.exit(1);
  }
  console.log(p.db_host, p.db_user, p.db_name || "postgres");
')

encoded=$(PW="$SUPABASE_DB_PASSWORD" node -e 'console.log(encodeURIComponent(process.env.PW))')
printf 'postgresql://%s:%s@%s:5432/%s?sslmode=require\n' "$user" "$encoded" "$host" "$db"
