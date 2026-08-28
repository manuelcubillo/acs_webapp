#!/usr/bin/env bash
# Copies the production Neon database (schema + data) into the local Dockerized
# Postgres, overwriting whatever is there.
#
# Restores into acs_dev — the database `pnpm dev` runs against. It deliberately
# does NOT touch acs_test: the test database is provisioned by `pnpm db:setup`
# and wiped by the tests, and giving it a copy of production data would only
# make failed runs harder to read.
#
# Requires:
#   - Docker running
#   - Local Postgres up: docker compose --profile db up -d
#   - .env.prod with DATABASE_URL_UNPOOLED (pg_dump cannot go through pgbouncer)
#
# Usage: pnpm db:pull-prod [-y]
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.prod"
LOCAL_PG_CONTAINER="${LOCAL_PG_CONTAINER:-acs-postgres}"
LOCAL_PG_USER="${LOCAL_PG_USER:-acs_user}"
LOCAL_PG_DB="${LOCAL_PG_DB:-acs_dev}"
PG_CLIENT_IMAGE="${PG_CLIENT_IMAGE:-postgres:17-alpine}"

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

if ! docker ps --filter "name=^${LOCAL_PG_CONTAINER}\$" --filter "status=running" --format '{{.Names}}' | grep -q "$LOCAL_PG_CONTAINER"; then
  echo "Error: local Postgres container '$LOCAL_PG_CONTAINER' is not running." >&2
  echo "Start it with: docker compose --profile db up -d" >&2
  exit 1
fi

if [[ "${1:-}" != "-y" && "${1:-}" != "--yes" ]]; then
  echo
  echo "  Source: PRODUCTION (Neon, read-only pg_dump)"
  echo "  Target: '$LOCAL_PG_DB' on '$LOCAL_PG_CONTAINER'  ← will be DROPPED and replaced"
  echo
  read -r -p "Continue? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# The target database may not exist yet on a fresh machine.
docker exec "$LOCAL_PG_CONTAINER" psql -U "$LOCAL_PG_USER" -d postgres -tc \
  "SELECT 1 FROM pg_database WHERE datname = '$LOCAL_PG_DB'" | grep -q 1 || \
  docker exec "$LOCAL_PG_CONTAINER" psql -U "$LOCAL_PG_USER" -d postgres -c \
    "CREATE DATABASE \"$LOCAL_PG_DB\";"

DUMP_FILE="$(mktemp -t prod_dump.XXXXXX.sql)"
RESTORE_LOG="$(mktemp -t prod_restore.XXXXXX.log)"
trap 'rm -f "$DUMP_FILE" "$RESTORE_LOG"' EXIT

echo "Dumping production database..."
docker run --rm "$PG_CLIENT_IMAGE" pg_dump "$DATABASE_URL_UNPOOLED" \
  --no-owner --no-privileges --clean --if-exists \
  > "$DUMP_FILE"

echo "Restoring into local '$LOCAL_PG_DB'..."
docker exec -i "$LOCAL_PG_CONTAINER" psql -U "$LOCAL_PG_USER" -d "$LOCAL_PG_DB" \
  < "$DUMP_FILE" > "$RESTORE_LOG" 2>&1 || true

# "transaction_timeout" errors are benign: they come from dumping with a
# newer pg_dump client (PG17) against Neon's PG15 server, which emits a
# SET the local PG15 target doesn't recognize. Anything else is a real problem.
if grep -i "ERROR" "$RESTORE_LOG" | grep -vi "transaction_timeout" | grep -q .; then
  echo "Restore finished with unexpected errors:" >&2
  grep -i "ERROR" "$RESTORE_LOG" | grep -vi "transaction_timeout" >&2
  exit 1
fi

# The dump carries production's migration journal, which is empty. Reconcile it
# so `pnpm db:migrate` keeps working against the freshly restored database.
echo "Reconciling the migration journal..."
pnpm db:journal:sync

echo "Verifying row counts..."
docker exec "$LOCAL_PG_CONTAINER" psql -U "$LOCAL_PG_USER" -d "$LOCAL_PG_DB" -c \
  "SELECT (SELECT count(*) FROM tenants) tenants, (SELECT count(*) FROM cards) cards, (SELECT count(*) FROM \"user\") users, (SELECT count(*) FROM card_types) card_types, (SELECT count(*) FROM field_definitions) field_definitions;"

echo
echo "Done. '$LOCAL_PG_DB' now mirrors production."
echo "Note: photos are NOT copied — the object keys point at R2, and local dev"
echo "reads from MinIO. Cards restored this way show a broken photo until you"
echo "upload one locally."
