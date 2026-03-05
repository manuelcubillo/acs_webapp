CREATE TYPE "public"."action_type" AS ENUM('guest_entry', 'guest_exit');--> statement-breakpoint
CREATE TYPE "public"."card_status" AS ENUM('active', 'inactive', 'suspended', 'expired');--> statement-breakpoint
CREATE TYPE "public"."field_type" AS ENUM('text', 'number', 'boolean', 'date', 'photo', 'select');--> statement-breakpoint
CREATE TABLE "action_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"action_type" "action_type" NOT NULL,
	"config" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"action_definition_id" uuid NOT NULL,
	"executed_at" timestamp DEFAULT now() NOT NULL,
	"executed_by" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "card_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_type_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" "card_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"field_type" "field_type" NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"default_value" text,
	"validation_rules" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"field_definition_id" uuid NOT NULL,
	"value_text" text,
	"value_number" double precision,
	"value_boolean" boolean,
	"value_date" timestamp,
	"value_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "field_values_card_field_unique" UNIQUE("card_id","field_definition_id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_definitions" ADD CONSTRAINT "action_definitions_card_type_id_card_types_id_fk" FOREIGN KEY ("card_type_id") REFERENCES "public"."card_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_action_definition_id_action_definitions_id_fk" FOREIGN KEY ("action_definition_id") REFERENCES "public"."action_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_executed_by_user_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_types" ADD CONSTRAINT "card_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_card_type_id_card_types_id_fk" FOREIGN KEY ("card_type_id") REFERENCES "public"."card_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_card_type_id_card_types_id_fk" FOREIGN KEY ("card_type_id") REFERENCES "public"."card_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_values" ADD CONSTRAINT "field_values_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_values" ADD CONSTRAINT "field_values_field_definition_id_field_definitions_id_fk" FOREIGN KEY ("field_definition_id") REFERENCES "public"."field_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_definitions_card_type_id_idx" ON "action_definitions" USING btree ("card_type_id");--> statement-breakpoint
CREATE INDEX "action_logs_card_id_idx" ON "action_logs" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "action_logs_action_definition_id_idx" ON "action_logs" USING btree ("action_definition_id");--> statement-breakpoint
CREATE INDEX "action_logs_executed_at_idx" ON "action_logs" USING btree ("executed_at");--> statement-breakpoint
CREATE INDEX "card_types_tenant_id_idx" ON "card_types" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cards_tenant_id_idx" ON "cards" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cards_card_type_id_idx" ON "cards" USING btree ("card_type_id");--> statement-breakpoint
CREATE INDEX "cards_tenant_status_idx" ON "cards" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "field_definitions_card_type_id_idx" ON "field_definitions" USING btree ("card_type_id");--> statement-breakpoint
CREATE INDEX "field_definitions_card_type_position_idx" ON "field_definitions" USING btree ("card_type_id","position");--> statement-breakpoint
CREATE INDEX "field_values_card_id_idx" ON "field_values" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "field_values_field_definition_id_idx" ON "field_values" USING btree ("field_definition_id");