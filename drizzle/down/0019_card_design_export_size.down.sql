-- ROLLBACK for 0019_lucky_gateway.sql (card_designs export size in centimetres)
--
-- ⚠️ MANUAL ONLY. drizzle-kit neither generates nor runs down migrations, and
-- this file is deliberately outside drizzle/ so the migrator never picks it up.
-- Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/down/0019_card_design_export_size.down.sql
-- Then delete the 0019 entry from drizzle/meta/_journal.json so the migrator
-- does not consider it applied.
--
-- LOSSY only in that it discards each design's configured download size. The
-- columns are export-only: width_units / height_units / unit and the layout
-- jsonb are untouched, so dropping them simply returns every design to the
-- legacy export size (the renderer's uniform 2× scale).

BEGIN;

ALTER TABLE "card_designs" DROP COLUMN IF EXISTS "output_width_cm";
ALTER TABLE "card_designs" DROP COLUMN IF EXISTS "output_height_cm";
ALTER TABLE "card_designs" DROP COLUMN IF EXISTS "output_lock_aspect";

COMMIT;
