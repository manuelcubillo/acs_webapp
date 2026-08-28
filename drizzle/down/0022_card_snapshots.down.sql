-- ROLLBACK for 0022_card_snapshots.sql
--
-- ⚠️ MANUAL ONLY. drizzle-kit neither generates nor runs down migrations, and
-- this file is deliberately outside drizzle/ so the migrator never picks it up.
-- Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/down/0022_card_snapshots.down.sql
-- Then delete the 0022 entry from drizzle/meta/_journal.json so the migrator
-- does not consider it applied.
--
-- ⚠️ LOSSY — this rollback destroys data with no pre-0022 representation:
--   * Every card_snapshots row is DELETED. The frozen historical field state is
--     gone; nothing else in the schema records what a card looked like at any
--     past moment, so it cannot be reconstructed.
--   * Every action_logs row with log_type='card_edit' is DELETED. Those rows
--     are the ONLY record that a manual card edit happened — before 0022 the
--     edit path wrote no audit row at all. Postgres has no
--     ALTER TYPE ... DROP VALUE, so the rows must go before the type could be
--     rebuilt; the 'card_edit' label itself is left in place (harmless: a stale
--     enum label with no rows), matching how 0021's rollback handles 'toggle'.
--   * action_logs loses card_snapshot_id and snapshot_created, so surviving
--     rows revert to resolving field values by joining current state.

-- Audit rows whose meaning does not survive the rollback.
DELETE FROM "action_logs" WHERE "log_type" = 'card_edit';

-- Pointers first: cards and action_logs both reference card_snapshots.
ALTER TABLE "cards" DROP COLUMN IF EXISTS "current_snapshot_id";
ALTER TABLE "action_logs" DROP COLUMN IF EXISTS "card_snapshot_id";
ALTER TABLE "action_logs" DROP COLUMN IF EXISTS "snapshot_created";

-- The self-referencing FK goes with the table.
DROP TABLE IF EXISTS "card_snapshots";

-- NOTE: 'card_edit' remains in the log_type enum. Postgres cannot drop an enum
-- value; re-applying 0022 is therefore safe only if its ALTER TYPE is guarded
-- or the value is already present (ADD VALUE IF NOT EXISTS).
