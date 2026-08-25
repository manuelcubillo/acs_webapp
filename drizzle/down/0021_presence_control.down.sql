-- ROLLBACK for 0021_presence_control.sql (and, partially, 0020_action_type_toggle.sql)
--
-- ⚠️ MANUAL ONLY. drizzle-kit neither generates nor runs down migrations, and
-- this file is deliberately outside drizzle/ so the migrator never picks it up.
-- Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/down/0021_presence_control.down.sql
-- Then delete the 0021 AND 0020 entries from drizzle/meta/_journal.json so the
-- migrator does not consider them applied.
--
-- ⚠️ LOSSY — this rollback destroys data with no pre-0021 representation:
--   * Every action_definitions row with action_type='toggle' is DELETED, along
--     with its action_logs rows (FK CASCADE). Postgres has no
--     ALTER TYPE ... DROP VALUE, so the enum value cannot be removed while any
--     row still uses it — and the value itself is left in place (harmless: a
--     stale enum label with no rows). Presence history for those cards is lost.
--   * `is_system` is dropped, so the distinction between server-provisioned and
--     user-created rows disappears. The __presence field definitions survive as
--     ordinary (inactive) fields and would become visible in configuration
--     surfaces again if reactivated.
--   * `is_operator_visible` is dropped; the surfaces revert to filtering on
--     NOT is_auto_execute, so an auto+visible action becomes hidden again.
--   * field_values.updated_at survives (it predates this migration) but stops
--     being trigger-maintained; the application write paths still set it.
--
-- The sentinel user row is left in place on purpose: it can be referenced by
-- action_logs.executed_by, and deleting it would SET NULL those references,
-- silently rewriting audit history. Remove it by hand only if you have
-- confirmed no log points at it.

BEGIN;

-- ─── Toggle actions have no home in the pre-0020 world ──────────────────────
-- action_logs.action_definition_id is ON DELETE CASCADE, so their log rows go
-- with them. This is the lossy part; take a backup first.

DELETE FROM "action_definitions" WHERE "action_type" = 'toggle';

-- ─── Presence designation ───────────────────────────────────────────────────

ALTER TABLE "card_types"
  DROP CONSTRAINT IF EXISTS "card_types_presence_field_definition_id_field_definitions_id_fk";
ALTER TABLE "card_types" DROP COLUMN IF EXISTS "presence_field_definition_id";

-- ─── Flags ──────────────────────────────────────────────────────────────────

ALTER TABLE "action_definitions" DROP COLUMN IF EXISTS "is_operator_visible";
ALTER TABLE "action_definitions" DROP COLUMN IF EXISTS "is_system";
ALTER TABLE "field_definitions"  DROP COLUMN IF EXISTS "is_system";

-- ─── Presence index ─────────────────────────────────────────────────────────

DROP INDEX IF EXISTS "field_values_presence_idx";

-- ─── updated_at reverts to application-maintained ───────────────────────────
-- The COLUMN is NOT dropped: it predates this migration (0002) and every write
-- path still sets it explicitly. Only the trigger is removed.

DROP TRIGGER IF EXISTS field_values_touch ON "field_values";
DROP FUNCTION IF EXISTS touch_field_value();

COMMIT;
