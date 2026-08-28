/**
 * Marks already-applied migrations as applied in `drizzle.__drizzle_migrations`.
 *
 * WHY THIS EXISTS
 *
 * Every database in this project carries the schema of migration 0021, but
 * their migration journals are empty. `acs_test` lost its journal first; the
 * 2026-08-05 full dump of `acs_test` into Neon then copied that empty journal
 * over production's. From that point `drizzle-kit migrate` replayed from 0000
 * and died on `CREATE TABLE "account"`, so every migration since 0018 was
 * applied by hand with psql — which is how the divergence kept growing.
 *
 * This script reconciles the journal with reality: for every entry in
 * `drizzle/meta/_journal.json` it inserts the row `drizzle-kit` would have
 * inserted, without running any DDL. Afterwards `pnpm db:migrate` is a no-op on
 * an up-to-date database and applies only genuinely new files.
 *
 * It is idempotent (it never inserts a hash that is already recorded) and it
 * never deletes. It refuses to run on a database whose schema does not actually
 * match the migrations it is about to mark as applied.
 *
 * Usage:
 *   pnpm db:journal:sync                    # the acs_dev database
 *   DRIZZLE_TARGET=test pnpm db:journal:sync
 *   pnpm db:journal:sync:prod               # Neon production
 */

import "../load-env";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { Client } from "pg";
import { assertDatabaseTarget } from "../../src/lib/db/guard";

// Only the test target needs `.env.test.local`, and only its database URL —
// loading it unconditionally would let the test auth secret win over the dev
// one in every other script that shares this bootstrap.
if (process.env.DRIZZLE_TARGET === "test") {
  config({ path: ".env.test.local" });
}

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

const MIGRATIONS_DIR = path.resolve(process.cwd(), "drizzle");

/**
 * A column added by the latest migration. If it is missing, the database is
 * not actually at the schema level we are about to claim it is.
 */
const SCHEMA_MARKER = {
  table: "field_definitions",
  column: "is_system",
  migration: "0021_presence_control",
};

function targetUrl(): string | undefined {
  if (process.env.DRIZZLE_TARGET !== "test") return process.env.DATABASE_URL;

  if (!process.env.TEST_DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL is not set — create .env.test.local. See docs/ENVIRONMENTS.md.",
    );
  }
  return process.env.TEST_DATABASE_URL;
}

/** Same hash drizzle's migrator computes: sha256 of the raw .sql file. */
function hashOf(tag: string): string {
  const sql = readFileSync(path.join(MIGRATIONS_DIR, `${tag}.sql`), "utf8");
  return createHash("sha256").update(sql).digest("hex");
}

async function main(): Promise<void> {
  const url = targetUrl();
  assertDatabaseTarget(url, "scripts/db/backfill-journal.ts");

  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
  ) as { entries: JournalEntry[] };

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const host = new URL(url).host;
    const database = new URL(url).pathname.replace(/^\//, "");
    console.log(`Target: ${database} @ ${host}`);

    // 1. Is the schema really where the journal says it is?
    const marker = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
      [SCHEMA_MARKER.table, SCHEMA_MARKER.column],
    );
    if (marker.rowCount === 0) {
      throw new Error(
        `Refusing to backfill: ${SCHEMA_MARKER.table}.${SCHEMA_MARKER.column} ` +
          `does not exist, so this database is not at ${SCHEMA_MARKER.migration}. ` +
          `Apply the missing migrations first.`,
      );
    }

    // 2. Drizzle's own bookkeeping table, created exactly as its migrator does.
    await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
         id SERIAL PRIMARY KEY,
         hash text NOT NULL,
         created_at bigint
       )`,
    );

    const existing = await client.query<{ hash: string }>(
      `SELECT hash FROM "drizzle"."__drizzle_migrations"`,
    );
    const known = new Set(existing.rows.map((r) => r.hash));

    // 3. Insert what is missing, in journal order.
    let inserted = 0;
    for (const entry of journal.entries) {
      const hash = hashOf(entry.tag);
      if (known.has(hash)) continue;
      await client.query(
        `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
         VALUES ($1, $2)`,
        [hash, entry.when],
      );
      inserted++;
      console.log(`  + ${entry.tag}`);
    }

    console.log(
      inserted === 0
        ? `Journal already complete (${known.size} migrations recorded).`
        : `Recorded ${inserted} migration(s). Journal now has ${known.size + inserted}.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
