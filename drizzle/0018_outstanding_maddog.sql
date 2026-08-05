CREATE TABLE "card_type_active_zone_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"card_type_id" uuid NOT NULL,
	"field_definition_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"row_span" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "card_type_active_zone_fields_unique" UNIQUE("card_type_id","field_definition_id"),
	CONSTRAINT "card_type_active_zone_fields_position_unique" UNIQUE("card_type_id","position"),
	CONSTRAINT "card_type_active_zone_fields_position_range" CHECK ("card_type_active_zone_fields"."position" >= 0 AND "card_type_active_zone_fields"."position" <= 8),
	CONSTRAINT "card_type_active_zone_fields_row_span_range" CHECK ("card_type_active_zone_fields"."row_span" IN (1, 2))
);
--> statement-breakpoint
ALTER TABLE "card_type_active_zone_fields" ADD CONSTRAINT "card_type_active_zone_fields_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_type_active_zone_fields" ADD CONSTRAINT "card_type_active_zone_fields_card_type_id_card_types_id_fk" FOREIGN KEY ("card_type_id") REFERENCES "public"."card_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_type_active_zone_fields" ADD CONSTRAINT "card_type_active_zone_fields_field_definition_id_field_definitions_id_fk" FOREIGN KEY ("field_definition_id") REFERENCES "public"."field_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_type_active_zone_fields_tenant_id_idx" ON "card_type_active_zone_fields" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "card_type_active_zone_fields_card_type_id_idx" ON "card_type_active_zone_fields" USING btree ("card_type_id");