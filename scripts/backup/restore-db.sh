#!/usr/bin/env bash
# Restores a backup produced by dump-db.sh into a Postgres database.
#
#   scripts/backup/restore-db.sh <db.dump | db.dump.gpg> <target postgresql:// URL> [schema ...]
#
# Default schema: public. Objects that already exist in the chosen schemas of the
# TARGET are dropped and recreated (pg_restore --clean); rows are replaced, not
# merged. Point it at a fresh project or a scratch database — never at
# production unless you mean to overwrite it.
#
# Encrypted files (.gpg) are decrypted with $BACKUP_PASSPHRASE, prompted if unset.
# Needs pg_restore 17 and gpg. See docs/BACKUPS.md for the full procedure.
set -euo pipefail

if [ $# -lt 2 ]; then
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi

file=$1
target=$2
shift 2
schemas=("$@")
[ ${#schemas[@]} -gt 0 ] || schemas=(public)

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

if [[ $file == *.gpg ]]; then
  if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
    read -rsp "Backup passphrase: " BACKUP_PASSPHRASE
    echo
  fi
  gpg --batch --quiet --yes --decrypt --pinentry-mode loopback \
    --passphrase-fd 3 --output "$work/plain.dump" "$file" 3<<<"$BACKUP_PASSPHRASE"
  file=$work/plain.dump
fi

args=()
for s in "${schemas[@]}"; do args+=("--schema=$s"); done

echo "restoring ${schemas[*]} from $(basename "$file") …"
set +e
pg_restore --dbname="$target" --no-owner --clean --if-exists --jobs=2 \
  "${args[@]}" "$file" 2>"$work/stderr"
rc=$?
set -e

# pg_restore keeps going after per-object errors and exits 1 if there were any.
# "already exists" for the schema itself is expected on a target that has it;
# anything else is shown and treated as a failure.
grep -E '^pg_restore: (error|warning)' "$work/stderr" \
  | grep -vE 'already exists|errors ignored on restore' > "$work/real" || true

if [ -s "$work/real" ]; then
  echo "pg_restore reported:" >&2
  sort -u "$work/real" | head -40 >&2
  exit 1
fi

ignored=$(grep -cE 'already exists' "$work/stderr" || true)
[ "$ignored" -gt 0 ] && echo "($ignored pre-existing object(s) skipped)"
echo "restore finished (pg_restore exit $rc)"
