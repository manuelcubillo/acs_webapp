-- Migration: 0008_dashboard_ops
-- Adds operational dashboard features:
--   1. log_type enum + is_auto_execute column on action_definitions
--   2. tenant_id + log_type columns on action_logs; makes action_definition_id nullable
--   3. dashboard_settings table (per-tenant config, one row per tenant)
--   4. card_type_summary_fields table (fields shown in activity feed per card type)

-- ─── 1. New enum ──────────────────────────────────────────────────────────────

CREATE TYPE "public"."log_type" AS ENUM('scan', 'action');
--> statement-breakpoint

-- ─── 2. action_definitions: add is_auto_execute ───────────────────────────────

ALTER TABLE "action_definitions" ADD COLUMN "is_auto_execute" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- ─── 3. action_logs: add tenant_id, log_type; make action_definition_id nullable

-- Step 1: add tenant_id as nullable, then backfill from cards, then set NOT NULL.
ALTER TABLE "action_logs" ADD COLUMN "tenant_id" uuid;
--> statement-breakpoint
UPDATE "action_logs" al
SET "tenant_id" = (
  SELECT "tenant_id" FROM "cards" WHERE "id" = al."card_id"
);
--> statement-breakpoint
ALTER TABLE "action_logs" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint

-- Add foreign key constraint for tenant_id
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Add log_type column (default "action" so existing rows are classified correctly)
ALTER TABLE "action_logs" ADD COLUMN "log_type" "public"."log_type" NOT NULL DEFAULT 'action';
--> statement-breakpoint

-- Make action_definition_id nullable (it was previously NOT NULL)
ALTER TABLE "action_logs" ALTER COLUMN "action_definition_id" DROP NOT NULL;
--> statement-breakpoint

-- New indexes for tenant-scoped activity feed queries
CREATE INDEX "action_logs_tenant_id_idx" ON "action_logs" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "action_logs_tenant_log_type_idx" ON "action_logs" USING btree ("tenant_id","log_type");
--> statement-breakpoint
CREATE INDEX "action_logs_tenant_executed_at_idx" ON "action_logs" USING btree ("tenant_id","executed_at");
--> statement-breakpoint

-- ─── 4. dashboard_settings table ─────────────────────────────────────────────

CREATE TABLE "dashboard_settings" (
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
ALTER TABLE "dashboard_settings" ADD CONSTRAINT "dashboard_settings_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- ─── 5. card_type_summary_fields table ───────────────────────────────────────

CREATE TABLE "card_type_summary_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"card_type_id" uuid NOT NULL,
	"field_definition_id" uuid NOT NULL,
	"position" integer NOT NULL DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "card_type_summary_fields_unique" UNIQUE("card_type_id","field_definition_id")
);
--> statement-breakpoint
ALTER TABLE "card_type_summary_fields" ADD CONSTRAINT "card_type_summary_fields_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "card_type_summary_fields" ADD CONSTRAINT "card_type_summary_fields_card_type_id_card_types_id_fk"
  FOREIGN KEY ("card_type_id") REFERENCES "public"."card_types"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "card_type_summary_fields" ADD CONSTRAINT "card_type_summary_fields_field_definition_id_field_definitions_id_fk"
  FOREIGN KEY ("field_definition_id") REFERENCES "public"."field_definitions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "card_type_summary_fields_tenant_id_idx" ON "card_type_summary_fields" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "card_type_summary_fields_card_type_id_idx" ON "card_type_summary_fields" USING btree ("card_type_id");
