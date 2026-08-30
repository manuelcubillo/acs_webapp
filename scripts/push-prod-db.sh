#!/usr/bin/env bash
# Replaces the production Neon database with the local Dockerized one.
#
# ⚠️ This is the most destructive script in the repo. It is the mirror image of
# pull-prod-db.sh, and the direction that cannot be undone by re-running it:
# whatever exists only in production — rows, users, whole tenants — is gone.
# That is why it always writes a timestamped backup of production first and
# keeps it, and why it asks the operator to type the target database name.
#
# Run scripts/push-photos-to-r2.sh BEFORE this one. Object keys survive the dump
# verbatim (they are plain text in field_values.value_text), so a key whose
# object never reached R2 becomes a broken image the moment the swap lands.
#
# What it replaces: both schemas, `public` and `drizzle`. The drizzle schema
# carries the migration journal, so production inherits local's — which is the
# point: after the swap `pnpm db:migrate:prod` keeps working from the right
# baseline instead of trying to replay 23 migrations over an existing schema.
#
# What it does NOT touch: the R2 bucket, and Vercel's environment variables.
# BETTER_AUTH_SECRET stays as it is, so existing sessions are only invalidated
# by the `session` table being replaced — everyone signs in again.
#
# Requires:
#   - Docker running, local Postgres up, `pnpm dev` NOT running against it
#   - .env.prod with DATABASE_URL_UNPOOLED (pg_dump cannot go through pgbouncer)
#
# Usage:
#   pnpm db:push-prod                          → target .env.prod (PRODUCTION)
#   PUSH_ENV_FILE=.env.neon-branch pnpm db:push-prod
#                                              → rehearse against a Neon branch
#
# Rehearse first. A Neon branch is a copy-on-write clone of production, so the
# rehearsal exercises this exact script against this exact data, and the only
# thing at stake is a branch you delete afterwards.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${PUSH_ENV_FILE:-.env.prod}"
LOCAL_PG_CONTAINER="${LOCAL_PG_CONTAINER:-acs-postgres}"
LOCAL_PG_USER="${LOCAL_PG_USER:-acs_user}"
LOCAL_PG_DB="${LOCAL_PG_DB:-acs_dev}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found." >&2
  echo "It holds the production connection string. See docs/ENVIRONMENTS.md." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL_UNPOOLED:-}" ]]; then
  echo "Error: DATABASE_URL_UNPOOLED is not set in $ENV_FILE." >&2
  echo "pg_dump needs the direct (non-pooler) endpoint — the host WITHOUT '-pooler'." >&2
  exit 1
fi

if [[ "$DATABASE_URL_UNPOOLED" != *"neon.tech"* ]]; then
  echo "Error: DATABASE_URL_UNPOOLED does not point at Neon. Refusing to guess." >&2
  exit 1
fi

# The word the operator must type, and the host it belongs to. Both are printed
# before the prompt so a rehearsal can never be mistaken for the real thing —
# the confirmation for production is the only one that reads "production".
if [[ "$ENV_FILE" == ".env.prod" ]]; then
  TARGET_LABEL="production"
else
  TARGET_LABEL="${ENV_FILE#.env.}"
fi
TARGET_HOST="$(printf '%s' "$DATABASE_URL_UNPOOLED" | sed 's|.*@||; s|/.*||')"

if ! docker ps --filter "name=^${LOCAL_PG_CONTAINER}\$" --filter "status=running" --format '{{.Names}}' | grep -q "$LOCAL_PG_CONTAINER"; then
  echo "Error: local Postgres container '$LOCAL_PG_CONTAINER' is not running." >&2
  echo "Start it with: docker compose --profile db up -d" >&2
  exit 1
fi

# Dump and restore both run through the local container's PG15 client. Using the
# PG17 client image here would emit a `SET transaction_timeout` that Neon's PG15
# server rejects — see the note in pull-prod-db.sh about the same mismatch.
#
# `docker exec -i` hands the container our own stdin, and psql drains it even
# when it has nothing to read. Every query that is not the restore therefore
# closes stdin explicitly — otherwise the preflight swallows the confirmation
# the operator is about to type, and the prompt reads EOF instead.
psql_prod() { docker exec -i "$LOCAL_PG_CONTAINER" psql "$DATABASE_URL_UNPOOLED" "$@" < /dev/null; }
psql_local() { docker exec -i "$LOCAL_PG_CONTAINER" psql -U "$LOCAL_PG_USER" -d "$LOCAL_PG_DB" "$@" < /dev/null; }
psql_prod_stdin() { docker exec -i "$LOCAL_PG_CONTAINER" psql "$DATABASE_URL_UNPOOLED" "$@"; }

echo "Reading both sides..."

LOCAL_SUMMARY="$(psql_local -tAc "
  SELECT (SELECT count(*) FROM tenants) || ' tenants, ' ||
         (SELECT count(*) FROM cards) || ' cards, ' ||
         (SELECT count(*) FROM \"user\") || ' users, ' ||
         (SELECT count(*) FROM action_logs) || ' action logs'")"

if ! PROD_SUMMARY="$(psql_prod -tAc "
  SELECT (SELECT count(*) FROM tenants) || ' tenants, ' ||
         (SELECT count(*) FROM cards) || ' cards, ' ||
         (SELECT count(*) FROM \"user\") || ' users, ' ||
         (SELECT count(*) FROM action_logs) || ' action logs'" 2>/dev/null)"; then
  PROD_SUMMARY="(could not be read — empty or unreachable)"
fi

PROD_TENANTS="$(psql_prod -tAc "SELECT string_agg(name || ' [' || id || ']', E'\n    ') FROM tenants" 2>/dev/null || echo "")"
LOCAL_TENANTS="$(psql_local -tAc "SELECT string_agg(name || ' [' || id || ']', E'\n    ') FROM tenants")"

cat <<BANNER

  ┌──────────────────────────────────────────────────────────────────┐
  │  REPLACING '$TARGET_LABEL' WITH LOCAL — this cannot be undone
  └──────────────────────────────────────────────────────────────────┘

  Source: local '$LOCAL_PG_DB'
    $LOCAL_SUMMARY
    $LOCAL_TENANTS

  Target: $TARGET_HOST
    (from $ENV_FILE)  ← schemas public + drizzle will be DROPPED
    $PROD_SUMMARY
    ${PROD_TENANTS:-(no tenants read)}

  Anything present only in the target is destroyed: rows, whole tenants,
  and any password changed there since local last diverged.

BANNER

read -r -p "  Type the target name to proceed ('$TARGET_LABEL'): " reply
if [[ "$reply" != "$TARGET_LABEL" ]]; then
  echo "Aborted."
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/$TARGET_LABEL-before-push-$STAMP.sql"

echo
echo "Backing up $TARGET_LABEL to $BACKUP_FILE ..."
docker exec "$LOCAL_PG_CONTAINER" pg_dump "$DATABASE_URL_UNPOOLED" \
  --no-owner --no-privileges > "$BACKUP_FILE"

if [[ ! -s "$BACKUP_FILE" ]]; then
  echo "Error: the $TARGET_LABEL backup is empty. Refusing to continue." >&2
  exit 1
fi
echo "  $(wc -c < "$BACKUP_FILE" | tr -d ' ') bytes written. Keep this file."

DUMP_FILE="$(mktemp -t local_dump.XXXXXX.sql)"
RESTORE_LOG="$(mktemp -t prod_restore.XXXXXX.log)"
trap 'rm -f "$DUMP_FILE" "$RESTORE_LOG"' EXIT

echo "Dumping local '$LOCAL_PG_DB'..."
docker exec "$LOCAL_PG_CONTAINER" pg_dump -U "$LOCAL_PG_USER" -d "$LOCAL_PG_DB" \
  --no-owner --no-privileges > "$DUMP_FILE"

# Drop the schemas outright rather than leaning on `pg_dump --clean`: --clean
# only drops what the dump itself contains, so anything production has and local
# does not would survive and drift. A clean slate is the whole point here.
echo "Dropping the target schemas..."
psql_prod -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS drizzle CASCADE;" \
                             -c "DROP SCHEMA public CASCADE;" \
                             -c "CREATE SCHEMA public;" > /dev/null

echo "Restoring local into $TARGET_LABEL..."
psql_prod_stdin < "$DUMP_FILE" > "$RESTORE_LOG" 2>&1 || true

if grep -i "ERROR" "$RESTORE_LOG" | grep -q .; then
  echo "Restore finished with errors:" >&2
  grep -i "ERROR" "$RESTORE_LOG" | head -20 >&2
  echo >&2
  echo "$TARGET_LABEL is in a partial state. Restore the backup with:" >&2
  echo "  docker exec -i $LOCAL_PG_CONTAINER psql \"\$DATABASE_URL_UNPOOLED\" < $BACKUP_FILE" >&2
  exit 1
fi

echo "Verifying..."
psql_prod -c "
  SELECT (SELECT count(*) FROM tenants) tenants,
         (SELECT count(*) FROM cards) cards,
         (SELECT count(*) FROM \"user\") users,
         (SELECT count(*) FROM field_values) field_values,
         (SELECT count(*) FROM action_logs) action_logs,
         (SELECT count(*) FROM card_snapshots) snapshots,
         (SELECT count(*) FROM drizzle.__drizzle_migrations) migrations;"

cat <<DONE

Done. '$TARGET_LABEL' now mirrors '$LOCAL_PG_DB'.

  Backup of the previous contents: $BACKUP_FILE
  Everyone is signed out (the session table was replaced).
  Sign in with the local accounts.

DONE
