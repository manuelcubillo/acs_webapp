CREATE TYPE "public"."scan_mode" AS ENUM('camera', 'external_reader', 'both');--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "scan_mode" "scan_mode" DEFAULT 'both' NOT NULL;