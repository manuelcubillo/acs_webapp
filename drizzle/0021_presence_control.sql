-- Presence control — schema (phase 1).
--
-- Structural DDL is drizzle-generated; the three things drizzle cannot express
-- (the behaviour-preserving backfill, the touch trigger, and the sentinel user
-- seed) are hand-written below and marked as such.
--
-- Depends on migration 0020, which adds 'toggle' to the action_type enum.
-- Nothing here references that value, so the two could technically share a
-- file on PG >= 12 — they are split so the ordering constraint stays explicit.
--
-- See ADR docs/context/decisions/2026-08-24-presence-control.md.

-- ── Structural (drizzle-generated) ──────────────────────────────────────────

ALTER TABLE "action_definitions" ADD COLUMN "is_operator_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "action_definitions" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "card_types" ADD COLUMN "presence_field_definition_id" uuid;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "card_types" ADD CONSTRAINT "card_types_presence_field_definition_id_field_definitions_id_fk" FOREIGN KEY ("presence_field_definition_id") REFERENCES "public"."field_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "field_values_presence_idx" ON "field_values" USING btree ("field_definition_id") WHERE "field_values"."value_boolean" = true;--> statement-breakpoint

-- ── HAND-WRITTEN: behaviour-preserving backfill ─────────────────────────────
-- Until now, "runs on scan" and "hidden from the operator" were the same flag:
-- CardActions and DashboardView both filtered on `NOT is_auto_execute`. Those
-- call sites now filter on `is_operator_visible` instead, so this backfill is
-- what makes the swap a no-op on existing data. The column default (true) is
-- correct for every action created from here on; only the existing rows need
-- the old coupling reproduced.
UPDATE "action_definitions" SET "is_operator_visible" = NOT "is_auto_execute";--> statement-breakpoint

-- ── HAND-WRITTEN: field_values.updated_at becomes trigger-maintained ────────
-- The column already existed and every write path set it by hand. The trigger
-- turns that convention into an invariant: no write path has to remember it,
-- and none can drift. It is what supplies `inside_since` on the presence page
-- without touching action_logs.
--
-- `now()` (not `now() AT TIME ZONE 'utc'`) matches the column's existing
-- DEFAULT exactly; the column is `timestamp without time zone` and both
-- deployments run the server in UTC.
CREATE OR REPLACE FUNCTION touch_field_value() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS field_values_touch ON "field_values";--> statement-breakpoint

CREATE TRIGGER field_values_touch
  BEFORE UPDATE ON "field_values"
  FOR EACH ROW EXECUTE FUNCTION touch_field_value();--> statement-breakpoint

-- ── HAND-WRITTEN: sentinel system user ──────────────────────────────────────
-- A referenceable FK target for machine-performed writes (action_logs.executed_by)
-- that can never authenticate: there is no matching `account` row, so Better
-- Auth has no credential to check, and the email domain is unroutable.
--
-- `tenant_id` is NULL — the actor is the platform, not any one tenant.
-- The id is mirrored by SYSTEM_USER_ID in src/lib/db/constants.ts; never
-- inline the literal anywhere else.
--
-- Nothing in this phase writes a log with this actor. It is seeded here because
-- it belongs with the rest of the schema work, and because discovering a Better
-- Auth incompatibility is cheaper now than mid-feature.
INSERT INTO "user" (id, name, email, email_verified, tenant_id, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Sistema',
  'system@internal.invalid',
  true,
  NULL,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
