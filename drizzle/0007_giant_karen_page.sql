-- Clear action_definitions and action_logs before enum migration.
-- The old enum values (guest_entry, guest_exit) are incompatible with the new
-- enum (increment, decrement, check, uncheck) and can't be cast.
-- action_logs references action_definitions with ON DELETE RESTRICT, so logs
-- must be deleted first.
DELETE FROM "action_logs";
DELETE FROM "action_definitions";
--> statement-breakpoint
CREATE TABLE "scan_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_type_id" uuid NOT NULL,
	"field_definition_id" uuid NOT NULL,
	"rule" text NOT NULL,
	"value" jsonb,
	"error_message" text NOT NULL,
	"severity" text DEFAULT 'error' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_definitions" ALTER COLUMN "action_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."action_type";--> statement-breakpoint
CREATE TYPE "public"."action_type" AS ENUM('increment', 'decrement', 'check', 'uncheck');--> statement-breakpoint
ALTER TABLE "action_definitions" ALTER COLUMN "action_type" SET DATA TYPE "public"."action_type" USING "action_type"::"public"."action_type";--> statement-breakpoint
ALTER TABLE "action_definitions" ADD COLUMN "target_field_definition_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "action_definitions" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "action_definitions" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "action_definitions" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_validations" ADD CONSTRAINT "scan_validations_card_type_id_card_types_id_fk" FOREIGN KEY ("card_type_id") REFERENCES "public"."card_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_validations" ADD CONSTRAINT "scan_validations_field_definition_id_field_definitions_id_fk" FOREIGN KEY ("field_definition_id") REFERENCES "public"."field_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_validations_card_type_id_idx" ON "scan_validations" USING btree ("card_type_id");--> statement-breakpoint
CREATE INDEX "scan_validations_card_type_active_idx" ON "scan_validations" USING btree ("card_type_id","is_active");--> statement-breakpoint
ALTER TABLE "action_definitions" ADD CONSTRAINT "action_definitions_target_field_definition_id_field_definitions_id_fk" FOREIGN KEY ("target_field_definition_id") REFERENCES "public"."field_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_definitions_card_type_active_idx" ON "action_definitions" USING btree ("card_type_id","is_active");