-- ROLLBACK for 0018_outstanding_maddog.sql (card_type_active_zone_fields)
--
-- ⚠️ MANUAL ONLY. drizzle-kit neither generates nor runs down migrations, and
-- this file is deliberately outside drizzle/ so the migrator never picks it up.
-- Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/down/0018_active_card_zone_fields.down.sql
-- Then delete the 0018 entry from drizzle/meta/_journal.json so the migrator
-- does not consider it applied.
--
-- LOSSY only in that it discards the per-card-type ActiveCardZone grid layout.
-- Nothing else references this table: card_type_summary_fields (the activity
-- feed config) is untouched by 0018, and dropping this table simply returns the
-- panel to its pre-configuration behaviour of showing the first fields that
-- hold a value.

BEGIN;

DROP TABLE IF EXISTS "card_type_active_zone_fields";

COMMIT;
