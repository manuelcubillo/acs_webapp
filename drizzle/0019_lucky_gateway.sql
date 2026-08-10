ALTER TABLE "card_designs" ADD COLUMN "output_width_cm" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "card_designs" ADD COLUMN "output_height_cm" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "card_designs" ADD COLUMN "output_lock_aspect" boolean DEFAULT true NOT NULL;