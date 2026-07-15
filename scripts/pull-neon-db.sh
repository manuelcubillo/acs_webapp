#!/usr/bin/env bash
# Dumps the Neon database (schema + data) and restores it into the local
# Dockerized Postgres (docker-compose.yml's "postgres" service), overwriting
# whatever is there. Requires:
#   - Docker running
#   - Local Postgres container up: `docker compose --profile db up -d`
#   - .env.local with DATABASE_URL_UNPOOLED pointing at Neon
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
LOCAL_PG_CONTAINER="${LOCAL_PG_CONTAINER:-acs-postgres}"
LOCAL_PG_USER="${LOCAL_PG_USER:-acs_user}"
LOCAL_PG_DB="${LOCAL_PG_DB:-acs_db}"
PG_CLIENT_IMAGE="${PG_CLIENT_IMAGE:-postgres:17-alpine}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL_UNPOOLED:-}" ]]; then
  echo "Error: DATABASE_URL_UNPOOLED is not set in $ENV_FILE." >&2
  exit 1
fi

if ! docker ps --filter "name=^${LOCAL_PG_CONTAINER}\$" --filter "status=running" --format '{{.Names}}' | grep -q "$LOCAL_PG_CONTAINER"; then
  echo "Error: local Postgres container '$LOCAL_PG_CONTAINER' is not running." >&2
  echo "Start it with: docker compose --profile db up -d" >&2
  exit 1
fi

if [[ "${1:-}" != "-y" && "${1:-}" != "--yes" ]]; then
  read -r -p "This will DROP and replace all data in '$LOCAL_PG_DB' on '$LOCAL_PG_CONTAINER' with a copy of Neon. Continue? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

DUMP_FILE="$(mktemp -t neon_dump.XXXXXX.sql)"
trap 'rm -f "$DUMP_FILE"' EXIT

echo "Dumping Neon database..."
docker run --rm "$PG_CLIENT_IMAGE" pg_dump "$DATABASE_URL_UNPOOLED" \
  --no-owner --no-privileges --clean --if-exists \
  > "$DUMP_FILE"

echo "Restoring into local '$LOCAL_PG_DB'..."
RESTORE_LOG="$(mktemp -t neon_restore.XXXXXX.log)"
trap 'rm -f "$DUMP_FILE" "$RESTORE_LOG"' EXIT
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

echo "Done. Verifying row counts..."
docker exec "$LOCAL_PG_CONTAINER" psql -U "$LOCAL_PG_USER" -d "$LOCAL_PG_DB" -c \
  "SELECT (SELECT count(*) FROM tenants) tenants, (SELECT count(*) FROM cards) cards, (SELECT count(*) FROM \"user\") users, (SELECT count(*) FROM card_types) card_types, (SELECT count(*) FROM field_definitions) field_definitions;"

echo "Local database now mirrors Neon."
