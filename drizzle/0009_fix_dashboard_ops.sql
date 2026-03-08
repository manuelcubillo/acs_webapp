-- Migration: 0009_fix_dashboard_ops
--
-- Safety migration to ensure all DDL from 0008_dashboard_ops was actually applied.
-- Migration 0008 was marked as applied by drizzle-kit but some statements may have
-- been skipped if a prior partial run left the migration table in an inconsistent
-- state (e.g. CREATE TYPE log_type already existed from a previous attempt).
--
-- All statements use IF NOT EXISTS / DO blocks so this migration is idempotent.

-- ─── 1. log_type enum (create if missing) ─────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "public"."log_type" AS ENUM('scan', 'action');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- ─── 2. action_definitions.is_auto_execute ────────────────────────────────────

ALTER TABLE "action_definitions"
  ADD COLUMN IF NOT EXISTS "is_auto_execute" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- ─── 3. action_logs: tenant_id ────────────────────────────────────────────────

ALTER TABLE "action_logs" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint

-- Backfill from cards (no-op if already populated)
UPDATE "action_logs" al
SET "tenant_id" = (SELECT "tenant_id" FROM "cards" WHERE "id" = al."card_id")
WHERE al."tenant_id" IS NULL;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "action_logs" ALTER COLUMN "tenant_id" SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "action_logs"
    ADD CONSTRAINT "action_logs_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- ─── 4. action_logs: log_type column ─────────────────────────────────────────

ALTER TABLE "action_logs"
  ADD COLUMN IF NOT EXISTS "log_type" "public"."log_type" NOT NULL DEFAULT 'action';
--> statement-breakpoint

-- ─── 5. action_logs: make action_definition_id nullable ──────────────────────

ALTER TABLE "action_logs" ALTER COLUMN "action_definition_id" DROP NOT NULL;
--> statement-breakpoint

-- ─── 6. action_logs indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "action_logs_tenant_id_idx"
  ON "action_logs" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_logs_tenant_log_type_idx"
  ON "action_logs" USING btree ("tenant_id","log_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_logs_tenant_executed_at_idx"
  ON "action_logs" USING btree ("tenant_id","executed_at");
--> statement-breakpoint

-- ─── 7. dashboard_settings table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "dashboard_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"feed_limit" integer NOT NULL DEFAULT 20,
	"show_scan_entries" boolean NOT NULL DEFAULT true,
	"show_action_entries" boolean NOT NULL DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_settings_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "dashboard_settings"
    ADD CONSTRAINT "dashboard_settings_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- ─── 8. card_type_summary_fields table ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS "card_type_summary_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"card_type_id" uuid NOT NULL,
	"field_definition_id" uuid NOT NULL,
	"position" integer NOT NULL DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "card_type_summary_fields_unique" UNIQUE("card_type_id","field_definition_id")
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "card_type_summary_fields"
    ADD CONSTRAINT "card_type_summary_fields_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "card_type_summary_fields"
    ADD CONSTRAINT "card_type_summary_fields_card_type_id_card_types_id_fk"
    FOREIGN KEY ("card_type_id") REFERENCES "public"."card_types"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "card_type_summary_fields"
    ADD CONSTRAINT "card_type_summary_fields_field_definition_id_field_definitions_id_fk"
    FOREIGN KEY ("field_definition_id") REFERENCES "public"."field_definitions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "card_type_summary_fields_tenant_id_idx"
  ON "card_type_summary_fields" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_type_summary_fields_card_type_id_idx"
  ON "card_type_summary_fields" USING btree ("card_type_id");
