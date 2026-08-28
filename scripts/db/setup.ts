/**
 * Provisions the two local databases from nothing.
 *
 *   acs_dev   — what `pnpm dev` runs against. Your playground.
 *   acs_test  — what `pnpm test` runs against. Tests delete rows from it, so it
 *               is deliberately a separate database from acs_dev.
 *
 * Creates each one if it does not exist and brings its schema up to date. Safe
 * to re-run: an existing database is only migrated, never dropped.
 *
 * Requires the container: `docker compose --profile db up -d`.
 *
 * Usage: pnpm db:setup
 */

import "../load-env";

import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const MIGRATIONS_FOLDER = "./drizzle";

function localUrls(): { label: string; url: string }[] {
  const dev = process.env.DATABASE_URL;
  const test = process.env.TEST_DATABASE_URL;

  if (!dev) {
    throw new Error("DATABASE_URL is not set (it lives in the committed .env).");
  }
  const targets = [{ label: "acs_dev  (pnpm dev)", url: dev }];

  if (test) {
    targets.push({ label: "acs_test (pnpm test)", url: test });
  } else {
    console.warn(
      "\n⚠️  TEST_DATABASE_URL is not set, so the test database was skipped.\n" +
        "   Create .env.test.local with:\n" +
        "     TEST_DATABASE_URL=postgresql://acs_user:acs_password@localhost:5432/acs_test\n",
    );
  }
  return targets;
}

/** Connects to the maintenance database to CREATE DATABASE if needed. */
async function ensureDatabaseExists(url: string): Promise<boolean> {
  const parsed = new URL(url);
  const dbName = parsed.pathname.replace(/^\//, "");

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const found = await admin.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName],
    );
    if (found.rowCount && found.rowCount > 0) return false;

    // Identifier cannot be parameterised; it comes from our own env file.
    await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    return true;
  } finally {
    await admin.end();
  }
}

async function main(): Promise<void> {
  for (const target of localUrls()) {
    console.log(`\n── ${target.label}`);

    if (/\bneon\.tech\b/i.test(target.url)) {
      throw new Error(
        `Refusing to run setup against a remote host. This command provisions ` +
          `the LOCAL Docker databases only.`,
      );
    }

    const created = await ensureDatabaseExists(target.url);
    console.log(created ? "   created" : "   already exists");

    const client = new Client({ connectionString: target.url });
    await client.connect();
    try {
      await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
      console.log("   schema up to date");
    } finally {
      await client.end();
    }
  }

  console.log("\nDone. Next: pnpm dev\n");
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  console.error(
    "If the error mentions a connection refused, the Postgres container is " +
      "probably down:\n  docker compose --profile db up -d\n",
  );
  process.exit(1);
});
