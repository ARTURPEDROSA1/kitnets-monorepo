#!/usr/bin/env bash
# Takes a backup of the production database into a directory.
#
#   scripts/backup/dump-db.sh [output-dir]      (default: ./backup-<UTC timestamp>)
#
# Produces:
#   db.dump            pg_dump custom format: schemas public + supabase_migrations
#                      (tables, data, policies, functions, grants). Restore with
#                      scripts/backup/restore-db.sh.
#   storage-meta.dump  best effort: the storage schema (bucket + object metadata,
#                      not the files themselves). Missing if the role cannot read it.
#   MANIFEST.txt       table count, sizes, server version.
#
# Connection: $DB_URL, or resolve-db-url.sh (needs the SUPABASE_* variables).
# Needs pg_dump of the same major version as the server (17).
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
out=${1:-backup-$(date -u +%Y%m%d-%H%M%S)}
mkdir -p "$out"

url=${DB_URL:-$("$here/resolve-db-url.sh")}

echo "pg_dump $(pg_dump --version | awk '{print $3}') → $out/db.dump"
pg_dump "$url" \
  --format=custom --compress=6 --no-owner \
  --schema=public --schema=supabase_migrations \
  --file="$out/db.dump"

# Integrity: the archive's table of contents must list tables and their data.
tables=$(pg_restore --list "$out/db.dump" | grep -c ' TABLE public ' || true)
data=$(pg_restore --list "$out/db.dump" | grep -c ' TABLE DATA public ' || true)
if [ "$tables" -eq 0 ] || [ "$data" -eq 0 ]; then
  echo "error: db.dump lists $tables tables and $data data sections; refusing to continue" >&2
  exit 1
fi

# Storage metadata (storage.buckets / storage.objects). The files live in
# Supabase Storage and are mirrored separately; this keeps the rows that point
# at them so a restored project can be re-linked to the mirrored files.
if pg_dump "$url" --format=custom --compress=6 --no-owner --data-only \
     --table=storage.buckets --table=storage.objects \
     --file="$out/storage-meta.dump" 2>"$out/.storage.err"; then
  rm -f "$out/.storage.err"
else
  echo "warning: storage metadata not dumped: $(tr '\n' ' ' < "$out/.storage.err")" >&2
  rm -f "$out/storage-meta.dump" "$out/.storage.err"
fi

{
  echo "created_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "server_version=$(psql "$url" -Atqc 'show server_version' 2>/dev/null || echo unknown)"
  echo "pg_dump_version=$(pg_dump --version | awk '{print $3}')"
  echo "public_tables=$tables"
  echo "db_dump_bytes=$(wc -c < "$out/db.dump")"
  [ -f "$out/storage-meta.dump" ] && echo "storage_meta_bytes=$(wc -c < "$out/storage-meta.dump")"
} > "$out/MANIFEST.txt"

cat "$out/MANIFEST.txt"
echo "$out"
