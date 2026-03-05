ALTER TABLE "cards" ADD COLUMN "code" text NOT NULL;--> statement-breakpoint
CREATE INDEX "cards_tenant_code_idx" ON "cards" USING btree ("tenant_id","code");--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_tenant_code_unique" UNIQUE("tenant_id","code");