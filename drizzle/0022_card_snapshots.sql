-- Card snapshots — the write path (A1).
--
-- Adds an immutable, content-deduplicated copy of a card's full field state,
-- plus the pointers that let a log row say WHICH state it observed.
--
-- ── On the enum value sharing this file ─────────────────────────────────────
-- Migration 0020 established that `ALTER TYPE ... ADD VALUE` gets its own file.
-- The rule it protects is Postgres': the new value may not be USED inside the
-- same transaction that adds it (and PG < 12 forbids the statement in a
-- transaction block outright). Nothing below references 'card_edit' — no seed
-- row, no CHECK, no backfill — and the project's floor is PG 15, so the two
-- may share a file here. If you append anything that writes or constrains
-- 'card_edit', move it to a LATER migration.
--
-- No backfill, deliberately. `action_logs.card_snapshot_id IS NULL` means "row
-- written before snapshots existed"; the read paths fall back to joining
-- current values for those, exactly as they do for the `scanLogId` metadata key
-- that has no backfill either.
--
-- See ADR docs/context/decisions/2026-08-28-card-snapshots-write-path.md.

ALTER TYPE "public"."log_type" ADD VALUE 'card_edit';--> statement-breakpoint
CREATE TABLE "card_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"previous_snapshot_id" uuid,
	"payload" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_logs" ADD COLUMN "card_snapshot_id" uuid;--> statement-breakpoint
ALTER TABLE "action_logs" ADD COLUMN "snapshot_created" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "current_snapshot_id" uuid;--> statement-breakpoint
ALTER TABLE "card_snapshots" ADD CONSTRAINT "card_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_snapshots" ADD CONSTRAINT "card_snapshots_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_snapshots" ADD CONSTRAINT "card_snapshots_previous_snapshot_id_card_snapshots_id_fk" FOREIGN KEY ("previous_snapshot_id") REFERENCES "public"."card_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_snapshots_card_created_idx" ON "card_snapshots" USING btree ("card_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_card_snapshot_id_card_snapshots_id_fk" FOREIGN KEY ("card_snapshot_id") REFERENCES "public"."card_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_current_snapshot_id_card_snapshots_id_fk" FOREIGN KEY ("current_snapshot_id") REFERENCES "public"."card_snapshots"("id") ON DELETE set null ON UPDATE no action;