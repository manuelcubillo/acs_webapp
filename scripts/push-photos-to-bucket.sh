#!/usr/bin/env bash
# Copies into the production bucket every photo object the local database
# references but the bucket does not have yet, preserving the object key byte
# for byte. Provider-agnostic: the destination is whatever `.env.prod` says
# (AWS S3, R2, or any S3-compatible endpoint).
#
# It is the storage half of "make production look like local". The database half
# is scripts/push-prod-db.sh, and this one must run FIRST: uploading objects is
# additive and harmless, so a bucket that is ready before the swap means no card
# is ever left pointing at a missing image.
#
# Additive only. It never deletes from the destination, so objects belonging to
# rows that only exist in production survive as orphans rather than disappearing.
#
# Source of truth for "referenced": field_values.value_text on photo fields,
# plus the object keys embedded in card_designs.layout (JSON, not a column) and
# tenants.logo_object_key. See src/lib/storage/keys.ts for the key layout.
#
# Requires:
#   - Docker running with the local Postgres container up
#   - MinIO up:  docker compose --profile storage up -d
#   - awscli, and .env.prod carrying the destination credentials, S3_BUCKET and
#     STORAGE_DRIVER (plus S3_REGION for "s3", or S3_ENDPOINT for "r2"; under
#     "s3", S3_ENDPOINT is ignored and only S3_ENDPOINT_OVERRIDE is honoured)
#
# Usage: pnpm push:photos [-y]
set -euo pipefail

cd "$(dirname "$0")/.."

LOCAL_ENV_FILE=".env"
PROD_ENV_FILE=".env.prod"
LOCAL_PG_CONTAINER="${LOCAL_PG_CONTAINER:-acs-postgres}"
LOCAL_PG_USER="${LOCAL_PG_USER:-acs_user}"
LOCAL_PG_DB="${LOCAL_PG_DB:-acs_dev}"

# Reads one key out of an env file without sourcing it, so the local and the
# production values (identically named) can never clobber each other.
envget() {
  local file="$1" key="$2"
  # Trailing whitespace is invisible in an editor and survives dotenv (Next
  # trims it), so a credential can look right in .env.prod and still be
  # rejected by the CLI. Strip quotes, CR, and surrounding blanks.
  sed -n "s/^${key}=//p" "$file" | tail -n 1 | tr -d '"'"'"'\r' \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

for f in "$LOCAL_ENV_FILE" "$PROD_ENV_FILE"; do
  [[ -f "$f" ]] || { echo "Error: $f not found. See docs/ENVIRONMENTS.md." >&2; exit 1; }
done
command -v aws >/dev/null || { echo "Error: awscli is not installed." >&2; exit 1; }

SRC_ENDPOINT="$(envget "$LOCAL_ENV_FILE" S3_ENDPOINT)"
SRC_BUCKET="$(envget "$LOCAL_ENV_FILE" S3_BUCKET)"
SRC_KEY_ID="$(envget "$LOCAL_ENV_FILE" S3_ACCESS_KEY_ID)"
SRC_SECRET="$(envget "$LOCAL_ENV_FILE" S3_SECRET_ACCESS_KEY)"

DST_ENDPOINT="$(envget "$PROD_ENV_FILE" S3_ENDPOINT)"
DST_BUCKET="$(envget "$PROD_ENV_FILE" S3_BUCKET)"
DST_KEY_ID="$(envget "$PROD_ENV_FILE" S3_ACCESS_KEY_ID)"
DST_SECRET="$(envget "$PROD_ENV_FILE" S3_SECRET_ACCESS_KEY)"
DST_REGION="$(envget "$PROD_ENV_FILE" S3_REGION)"
DST_DRIVER="$(envget "$PROD_ENV_FILE" STORAGE_DRIVER)"

if [[ -z "$DST_BUCKET" ]]; then
  echo "Error: S3_BUCKET is empty in $PROD_ENV_FILE." >&2
  echo "Copy the bucket name from your provider's console." >&2
  exit 1
fi

# Region and endpoint must be resolved the same way src/lib/storage/index.ts
# resolves them, or the CLI signs for a different host than the app does.
DST_ENDPOINT_ARGS=()
case "$DST_DRIVER" in
  s3)
    if [[ -z "$DST_REGION" ]]; then
      echo "Error: S3_REGION is empty in $PROD_ENV_FILE, and driver \"s3\" has no default." >&2
      echo "Use the bucket's real region — a wrong one answers 301 on every call." >&2
      exit 1
    fi
    # No --endpoint-url: the CLI derives the regional one, as the SDK does.
    # S3_ENDPOINT is deliberately NOT consulted here — .env.prod may still carry
    # the R2 host, and honouring it would point this script at the old bucket.
    # Only the driver's own escape hatch counts, exactly as in index.ts.
    DST_OVERRIDE="$(envget "$PROD_ENV_FILE" S3_ENDPOINT_OVERRIDE)"
    if [[ -n "$DST_OVERRIDE" ]]; then
      DST_ENDPOINT_ARGS=(--endpoint-url "$DST_OVERRIDE")
    fi
    ;;
  r2 | "")
    # The R2 adapter hardcodes "auto" and ignores S3_REGION; match it.
    DST_REGION="auto"
    DST_ENDPOINT_ARGS=(--endpoint-url "$DST_ENDPOINT")
    ;;
  *)
    DST_REGION="${DST_REGION:-us-east-1}"
    DST_ENDPOINT_ARGS=(--endpoint-url "$DST_ENDPOINT")
    ;;
esac

if [[ "$DST_DRIVER" != "s3" && -z "$DST_ENDPOINT" ]]; then
  echo "Error: S3_ENDPOINT is empty in $PROD_ENV_FILE (required by driver \"${DST_DRIVER:-r2}\")." >&2
  exit 1
fi

if ! docker ps --filter "name=^${LOCAL_PG_CONTAINER}\$" --filter "status=running" --format '{{.Names}}' | grep -q "$LOCAL_PG_CONTAINER"; then
  echo "Error: local Postgres container '$LOCAL_PG_CONTAINER' is not running." >&2
  echo "Start it with: docker compose --profile db up -d" >&2
  exit 1
fi

WORK="$(mktemp -d -t push_photos.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

src_aws() {
  AWS_ACCESS_KEY_ID="$SRC_KEY_ID" AWS_SECRET_ACCESS_KEY="$SRC_SECRET" \
  AWS_DEFAULT_REGION="us-east-1" AWS_EC2_METADATA_DISABLED=true \
  aws --endpoint-url "$SRC_ENDPOINT" "$@"
}
dst_aws() {
  AWS_ACCESS_KEY_ID="$DST_KEY_ID" AWS_SECRET_ACCESS_KEY="$DST_SECRET" \
  AWS_DEFAULT_REGION="$DST_REGION" AWS_EC2_METADATA_DISABLED=true \
  aws ${DST_ENDPOINT_ARGS[@]+"${DST_ENDPOINT_ARGS[@]}"} "$@"
}

echo "Collecting the object keys the local database references..."
docker exec "$LOCAL_PG_CONTAINER" psql -U "$LOCAL_PG_USER" -d "$LOCAL_PG_DB" -tAc "
  SELECT fv.value_text
    FROM field_values fv
    JOIN field_definitions fd ON fd.id = fv.field_definition_id
   WHERE fd.field_type = 'photo' AND fv.value_text IS NOT NULL
  UNION
  SELECT (regexp_matches(layout::text, '[0-9a-f-]{36}/[a-z-]+/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z]+', 'g'))[1]
    FROM card_designs
  UNION
  SELECT logo_object_key FROM tenants WHERE logo_object_key IS NOT NULL
" | sed '/^$/d' | sort -u > "$WORK/referenced.txt"

echo "Listing the production bucket '$DST_BUCKET'..."
dst_aws s3 ls "s3://$DST_BUCKET/" --recursive \
  | awk '{ k=$4; for (i=5; i<=NF; i++) k = k" "$i; print k }' | sort -u > "$WORK/remote.txt"

comm -23 "$WORK/referenced.txt" "$WORK/remote.txt" > "$WORK/missing.txt"

REFERENCED=$(wc -l < "$WORK/referenced.txt" | tr -d ' ')
REMOTE=$(wc -l < "$WORK/remote.txt" | tr -d ' ')
MISSING=$(wc -l < "$WORK/missing.txt" | tr -d ' ')

echo
echo "  Referenced by the local database: $REFERENCED"
echo "  Already in the bucket:            $((REFERENCED - MISSING))"
echo "  To upload:                        $MISSING"
echo "  (The bucket holds $REMOTE objects in total; none are deleted.)"

if [[ "$MISSING" -eq 0 ]]; then
  echo
  echo "Nothing to do — the bucket already has every object the local database points at."
  exit 0
fi

echo
sed 's/^/    /' "$WORK/missing.txt"

if [[ "${1:-}" != "-y" && "${1:-}" != "--yes" ]]; then
  echo
  read -r -p "Upload these $MISSING object(s) to '$DST_BUCKET'? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

echo
mkdir -p "$WORK/objects"
UPLOADED=0
while IFS= read -r key; do
  [[ -n "$key" ]] || continue
  local_file="$WORK/objects/$(echo -n "$key" | tr '/' '_')"

  # Carry the source object's own content type across: the app answers a 302 to
  # a signed URL, so the browser reads the type off the bucket, not off us.
  content_type="$(src_aws s3api head-object --bucket "$SRC_BUCKET" --key "$key" \
    --query 'ContentType' --output text 2>/dev/null || echo "None")"
  if [[ "$content_type" == "None" || -z "$content_type" ]]; then
    content_type="application/octet-stream"
  fi

  src_aws s3 cp "s3://$SRC_BUCKET/$key" "$local_file" --quiet
  dst_aws s3 cp "$local_file" "s3://$DST_BUCKET/$key" --content-type "$content_type" --quiet
  rm -f "$local_file"

  UPLOADED=$((UPLOADED + 1))
  echo "  ✓ [$UPLOADED/$MISSING] $key  ($content_type)"
done < "$WORK/missing.txt"

echo
echo "Verifying..."
dst_aws s3 ls "s3://$DST_BUCKET/" --recursive \
  | awk '{ k=$4; for (i=5; i<=NF; i++) k = k" "$i; print k }' | sort -u > "$WORK/remote_after.txt"
STILL_MISSING=$(comm -23 "$WORK/referenced.txt" "$WORK/remote_after.txt" | wc -l | tr -d ' ')

if [[ "$STILL_MISSING" -ne 0 ]]; then
  echo "Error: $STILL_MISSING referenced object(s) are still absent from the bucket." >&2
  comm -23 "$WORK/referenced.txt" "$WORK/remote_after.txt" | sed 's/^/    /' >&2
  exit 1
fi

echo "Done. The bucket now holds all $REFERENCED objects the local database references."
