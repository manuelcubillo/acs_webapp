-- ROLLBACK for 0017_card_lifecycle_archiving.sql
--
-- ⚠️ MANUAL ONLY. drizzle-kit neither generates nor runs down migrations, and
-- this file is deliberately outside drizzle/ so the migrator never picks it up.
-- Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/down/0017_card_lifecycle_archiving.down.sql
-- Then delete the 0017 entry from drizzle/meta/_journal.json so the migrator
-- does not consider it applied.
--
-- ⚠️ LOSSY — this rollback destroys data that has no pre-0017 representation:
--   * action_logs rows with log_type='lifecycle' are DELETED (the value cannot
--     exist in the restored enum; Postgres has no ALTER TYPE ... DROP VALUE).
--   * status='archived' collapses to 'inactive' — the old card_status enum has
--     no 'archived'. Rows in the trash come back as switched-off, and the trash
--     metadata (archived_at / archived_by / status_before_archive /
--     archived_via_type_id) is dropped, so restore targets are lost.
--   * tenants.archive_retention_days is dropped.
-- Take a backup first if any row has ever been archived.

BEGIN;

-- ─── Drop the lifecycle audit rows (no home in the restored enum) ────────────

DELETE FROM "action_logs" WHERE "log_type" = 'lifecycle';

-- ─── log_type: rebuild without 'lifecycle' ──────────────────────────────────

ALTER TYPE "public"."log_type" RENAME TO "log_type_old";
CREATE TYPE "public"."log_type" AS ENUM('scan', 'action');
ALTER TABLE "action_logs" ALTER COLUMN "log_type" DROP DEFAULT;
ALTER TABLE "action_logs" ALTER COLUMN "log_type" TYPE "public"."log_type"
  USING "log_type"::text::"public"."log_type";
ALTER TABLE "action_logs" ALTER COLUMN "log_type" SET DEFAULT 'action';
DROP TYPE "public"."log_type_old";

-- ─── Purge chain: CASCADE -> RESTRICT ───────────────────────────────────────

ALTER TABLE "field_values" DROP CONSTRAINT "field_values_field_definition_id_field_definitions_id_fk";
ALTER TABLE "field_values" ADD CONSTRAINT "field_values_field_definition_id_field_definitions_id_fk"
  FOREIGN KEY ("field_definition_id") REFERENCES "public"."field_definitions"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "action_logs" DROP CONSTRAINT "action_logs_action_definition_id_action_definitions_id_fk";
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_action_definition_id_action_definitions_id_fk"
  FOREIGN KEY ("action_definition_id") REFERENCES "public"."action_definitions"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "scan_validations" DROP CONSTRAINT "scan_validations_field_definition_id_field_definitions_id_fk";
ALTER TABLE "scan_validations" ADD CONSTRAINT "scan_validations_field_definition_id_field_definitions_id_fk"
  FOREIGN KEY ("field_definition_id") REFERENCES "public"."field_definitions"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "action_definitions" DROP CONSTRAINT "action_definitions_target_field_definition_id_field_definitions";
ALTER TABLE "action_definitions" ADD CONSTRAINT "action_definitions_target_field_definition_id_field_definitions_id_fk"
  FOREIGN KEY ("target_field_definition_id") REFERENCES "public"."field_definitions"("id") ON DELETE restrict ON UPDATE no action;

-- ─── card_types: status enum -> is_active boolean ───────────────────────────

ALTER TABLE "card_types" DROP CONSTRAINT "card_types_archive_metadata_ck";
ALTER TABLE "card_types" DROP CONSTRAINT "card_types_no_expired_ck";
ALTER TABLE "card_types" DROP CONSTRAINT "card_types_archived_by_user_id_fk";
DROP INDEX "card_types_archived_at_idx";
DROP INDEX "card_types_tenant_status_idx";

ALTER TABLE "card_types" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;
UPDATE "card_types" SET "is_active" = ("status" = 'active');

ALTER TABLE "card_types"
  DROP COLUMN "status",
  DROP COLUMN "archived_at",
  DROP COLUMN "archived_by",
  DROP COLUMN "status_before_archive";

-- ─── cards: lifecycle_status -> card_status ─────────────────────────────────

ALTER TABLE "cards" DROP CONSTRAINT "cards_archive_metadata_ck";
ALTER TABLE "cards" DROP CONSTRAINT "cards_archived_by_user_id_fk";
ALTER TABLE "cards" DROP CONSTRAINT "cards_archived_via_type_id_card_types_id_fk";
DROP INDEX "cards_archived_at_idx";
DROP INDEX "cards_archived_via_type_id_idx";

ALTER TABLE "cards"
  DROP COLUMN "archived_at",
  DROP COLUMN "archived_by",
  DROP COLUMN "status_before_archive",
  DROP COLUMN "archived_via_type_id";

CREATE TYPE "public"."card_status" AS ENUM('active', 'inactive', 'suspended', 'expired');

ALTER TABLE "cards" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "cards" ALTER COLUMN "status" TYPE "public"."card_status"
  USING (
    CASE "status"::text
      WHEN 'archived' THEN 'inactive'
      ELSE "status"::text
    END
  )::"public"."card_status";
ALTER TABLE "cards" ALTER COLUMN "status" SET DEFAULT 'active';

-- ─── tenants + enum teardown ────────────────────────────────────────────────

ALTER TABLE "tenants" DROP COLUMN "archive_retention_days";

DROP TYPE "public"."lifecycle_status";

COMMIT;
