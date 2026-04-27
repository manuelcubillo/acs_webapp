CREATE TYPE "public"."design_kind" AS ENUM('card', 'passbook');--> statement-breakpoint
CREATE TYPE "public"."dimension_unit" AS ENUM('mm', 'px');--> statement-breakpoint
CREATE TABLE "card_designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "design_kind" NOT NULL,
	"width_units" double precision NOT NULL,
	"height_units" double precision NOT NULL,
	"unit" "dimension_unit" NOT NULL,
	"layout" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_type_designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"card_type_id" uuid NOT NULL,
	"card_design_id" uuid NOT NULL,
	"kind" "design_kind" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "card_type_designs_type_kind_unique" UNIQUE("card_type_id","kind")
);
--> statement-breakpoint
ALTER TABLE "card_designs" ADD CONSTRAINT "card_designs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_type_designs" ADD CONSTRAINT "card_type_designs_card_type_id_card_types_id_fk" FOREIGN KEY ("card_type_id") REFERENCES "public"."card_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_type_designs" ADD CONSTRAINT "card_type_designs_card_design_id_card_designs_id_fk" FOREIGN KEY ("card_design_id") REFERENCES "public"."card_designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_designs_tenant_id_idx" ON "card_designs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "card_designs_tenant_kind_idx" ON "card_designs" USING btree ("tenant_id","kind");--> statement-breakpoint
CREATE INDEX "card_type_designs_card_type_id_idx" ON "card_type_designs" USING btree ("card_type_id");--> statement-breakpoint
CREATE INDEX "card_type_designs_card_design_id_idx" ON "card_type_designs" USING btree ("card_design_id");--> statement-breakpoint
CREATE INDEX "card_type_designs_tenant_id_idx" ON "card_type_designs" USING btree ("tenant_id");