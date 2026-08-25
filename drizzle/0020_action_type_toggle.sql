-- Adds `toggle` to the action_type enum.
--
-- Deliberately ALONE in its own migration. `ALTER TYPE ... ADD VALUE` cannot be
-- FOLLOWED by a statement that uses the new value inside the same transaction
-- (Postgres < 12 forbids it in a transaction block entirely). drizzle-kit runs
-- each migration file in one transaction, so anything referencing 'toggle' —
-- a seed row, a CHECK, a backfill — must live in a LATER file. Nothing is
-- appended here.
ALTER TYPE "public"."action_type" ADD VALUE 'toggle';
