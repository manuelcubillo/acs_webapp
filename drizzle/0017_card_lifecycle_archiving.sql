-- Migration: card / card type lifecycle + archiving (trash)
--
-- Introduces the three-state lifecycle model (plus a reserved `expired`) shared
-- by cards and card types, the trash metadata that drives restore and the purge
-- countdown, and the per-tenant retention window.
--
-- Data migration:
--   cards.status      card_status -> lifecycle_status
--                     'suspended' -> 'inactive' (defensive: the value was never
--                     written by any code path, but a row could exist)
--                     'expired' is preserved.
--   card_types        is_active = true  -> status = 'active'
--                     is_active = false -> status = 'inactive'
--   No existing row becomes 'archived'.
--
-- Also flips the dependent FK chain from RESTRICT to CASCADE so the phase-5
-- purge job can physically delete a whole card type in one statement. Today
-- `DELETE FROM card_types` aborts on those RESTRICTs.
--
-- Rollback: see drizzle/down/0017_card_lifecycle_archiving.down.sql
-- (manual — drizzle-kit does not generate or run down migrations).

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE "public"."lifecycle_status" AS ENUM('active', 'inactive', 'archived', 'expired');
--> statement-breakpoint

-- Audit rows for lifecycle transitions of CARDS. Card types are not audited.
--
-- The branch exists because of pre-existing schema drift: migration 0008 was only
-- partially applied to some databases (see its sibling 0009, the idempotent repair,
-- and the note in modules/infrastructure.md). On those, `log_type` was left as a
-- plain `text` column and the enum type was never created, so a bare
-- `ALTER TYPE log_type ADD VALUE` fails with "type does not exist".
--
-- Idempotent and a no-op on a healthy database. Verified against a reproduction of
-- the drift: existing rows ('scan' / 'action') are valid enum members and survive
-- the conversion.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'log_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."log_type" AS ENUM('scan', 'action', 'lifecycle');
    ALTER TABLE "action_logs" ALTER COLUMN "log_type" DROP DEFAULT;
    ALTER TABLE "action_logs" ALTER COLUMN "log_type" TYPE "public"."log_type"
      USING "log_type"::"public"."log_type";
    ALTER TABLE "action_logs" ALTER COLUMN "log_type" SET DEFAULT 'action';
  ELSE
    ALTER TYPE "public"."log_type" ADD VALUE IF NOT EXISTS 'lifecycle';
  END IF;
END $$;
--> statement-breakpoint

-- ─── tenants: retention window ───────────────────────────────────────────────

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "archive_retention_days" integer DEFAULT 30 NOT NULL;
--> statement-breakpoint

-- ─── cards: status enum swap + trash metadata ────────────────────────────────

ALTER TABLE "cards" ALTER COLUMN "status" DROP DEFAULT;
--> statement-breakpoint

ALTER TABLE "cards" ALTER COLUMN "status" TYPE "public"."lifecycle_status"
  USING (
    CASE "status"::text
      WHEN 'suspended' THEN 'inactive'
      ELSE "status"::text
    END
  )::"public"."lifecycle_status";
--> statement-breakpoint

ALTER TABLE "cards" ALTER COLUMN "status" SET DEFAULT 'active';
--> statement-breakpoint

ALTER TABLE "cards"
  ADD COLUMN "archived_at" timestamp,
  ADD COLUMN "archived_by" text,
  ADD COLUMN "status_before_archive" "public"."lifecycle_status",
  ADD COLUMN "archived_via_type_id" uuid;
--> statement-breakpoint

ALTER TABLE "cards" ADD CONSTRAINT "cards_archived_by_user_id_fk"
  FOREIGN KEY ("archived_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "cards" ADD CONSTRAINT "cards_archived_via_type_id_card_types_id_fk"
  FOREIGN KEY ("archived_via_type_id") REFERENCES "public"."card_types"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "cards" ADD CONSTRAINT "cards_archive_metadata_ck" CHECK (
  ("cards"."status" = 'archived') = ("cards"."archived_at" IS NOT NULL)
  AND ("cards"."status" = 'archived') = ("cards"."status_before_archive" IS NOT NULL)
  AND ("cards"."status_before_archive" IS NULL OR "cards"."status_before_archive" <> 'archived')
);
--> statement-breakpoint

CREATE INDEX "cards_archived_at_idx" ON "cards" USING btree ("archived_at") WHERE "cards"."archived_at" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX "cards_archived_via_type_id_idx" ON "cards" USING btree ("archived_via_type_id") WHERE "cards"."archived_via_type_id" IS NOT NULL;
--> statement-breakpoint

-- ─── card_types: is_active boolean -> status enum + trash metadata ───────────

ALTER TABLE "card_types"
  ADD COLUMN "status" "public"."lifecycle_status" DEFAULT 'active' NOT NULL,
  ADD COLUMN "archived_at" timestamp,
  ADD COLUMN "archived_by" text,
  ADD COLUMN "status_before_archive" "public"."lifecycle_status";
--> statement-breakpoint

UPDATE "card_types" SET "status" = CASE WHEN "is_active" THEN 'active'::"public"."lifecycle_status" ELSE 'inactive'::"public"."lifecycle_status" END;
--> statement-breakpoint

ALTER TABLE "card_types" DROP COLUMN "is_active";
--> statement-breakpoint

ALTER TABLE "card_types" ADD CONSTRAINT "card_types_archived_by_user_id_fk"
  FOREIGN KEY ("archived_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

-- `expired` is a card-only state; the enum is shared, so guard it here.
ALTER TABLE "card_types" ADD CONSTRAINT "card_types_no_expired_ck" CHECK ("card_types"."status" <> 'expired');
--> statement-breakpoint

ALTER TABLE "card_types" ADD CONSTRAINT "card_types_archive_metadata_ck" CHECK (
  ("card_types"."status" = 'archived') = ("card_types"."archived_at" IS NOT NULL)
  AND ("card_types"."status" = 'archived') = ("card_types"."status_before_archive" IS NOT NULL)
  AND ("card_types"."status_before_archive" IS NULL OR "card_types"."status_before_archive" <> 'archived')
);
--> statement-breakpoint

CREATE INDEX "card_types_tenant_status_idx" ON "card_types" USING btree ("tenant_id","status");
--> statement-breakpoint

CREATE INDEX "card_types_archived_at_idx" ON "card_types" USING btree ("archived_at") WHERE "card_types"."archived_at" IS NOT NULL;
--> statement-breakpoint

-- ─── Retire the old enum ─────────────────────────────────────────────────────

DROP TYPE "public"."card_status";
--> statement-breakpoint

-- ─── Purge chain: RESTRICT -> CASCADE ────────────────────────────────────────
-- Required for phase 5: a RESTRICT is checked immediately, so it aborts the
-- delete even when a cascade in the same statement would have removed the
-- referencing rows anyway.

ALTER TABLE "field_values" DROP CONSTRAINT "field_values_field_definition_id_field_definitions_id_fk";
--> statement-breakpoint
ALTER TABLE "field_values" ADD CONSTRAINT "field_values_field_definition_id_field_definitions_id_fk"
  FOREIGN KEY ("field_definition_id") REFERENCES "public"."field_definitions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "action_logs" DROP CONSTRAINT "action_logs_action_definition_id_action_definitions_id_fk";
--> statement-breakpoint
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_action_definition_id_action_definitions_id_fk"
  FOREIGN KEY ("action_definition_id") REFERENCES "public"."action_definitions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "scan_validations" DROP CONSTRAINT "scan_validations_field_definition_id_field_definitions_id_fk";
--> statement-breakpoint
ALTER TABLE "scan_validations" ADD CONSTRAINT "scan_validations_field_definition_id_field_definitions_id_fk"
  FOREIGN KEY ("field_definition_id") REFERENCES "public"."field_definitions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "action_definitions" DROP CONSTRAINT "action_definitions_target_field_definition_id_field_definitions_id_fk";
--> statement-breakpoint
ALTER TABLE "action_definitions" ADD CONSTRAINT "action_definitions_target_field_definition_id_field_definitions_id_fk"
  FOREIGN KEY ("target_field_definition_id") REFERENCES "public"."field_definitions"("id") ON DELETE cascade ON UPDATE no action;
