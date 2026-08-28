/**
 * Integration-test bootstrap.
 *
 * Runs once per integration test file, before the test module (and therefore
 * before `@/lib/db`) is imported. It is the single place where the test
 * database is chosen, and it FAILS CLOSED: a missing or suspicious
 * `TEST_DATABASE_URL` aborts the run instead of silently falling through to
 * whatever `DATABASE_URL` happens to hold.
 *
 * That matters more here than in most projects: these tests create and delete
 * real rows. Before this file existed, three of them loaded `.env.local`
 * directly and ran against the production Neon database.
 *
 * Wired in vitest.config.ts as `setupFiles` of the `integration` project, so
 * no test file needs (or is allowed) its own env bootstrap.
 */

import { config } from "dotenv";

// Test target and its secrets. Deliberately does NOT load `.env.local`: the
// dev secrets and the dev database must not be reachable from a test run.
config({ path: ".env.test.local" });
// Non-secret defaults (MinIO, mail sender). Never overwrites what is set above.
config({ path: ".env" });

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set.\n\n" +
      "Integration tests create and delete real rows, so they refuse to run " +
      "against an unnamed database.\n\n" +
      "Create .env.test.local with:\n" +
      "  TEST_DATABASE_URL=postgresql://acs_user:acs_password@localhost:5432/acs_test\n\n" +
      "and make sure the container is up: docker compose --profile db up -d\n" +
      "Then provision the schema with: pnpm db:setup\n\n" +
      "See docs/ENVIRONMENTS.md.",
  );
}

if (/\bneon\.tech\b/i.test(testUrl)) {
  throw new Error(
    `TEST_DATABASE_URL points at a remote Neon host.\n\n` +
      `Integration tests delete rows. They only ever run against the local ` +
      `Dockerized Postgres.\n\nSee docs/ENVIRONMENTS.md.`,
  );
}

// `DATABASE_URL` at this point is the development default from `.env`. Tests
// wiping the database you are actively developing against is a bad afternoon.
if (process.env.DATABASE_URL === testUrl) {
  throw new Error(
    `TEST_DATABASE_URL is the same database as DATABASE_URL (${testUrl}).\n\n` +
      `The test database must be dedicated — tests delete rows from it. ` +
      `Point TEST_DATABASE_URL at acs_test, not at the development database.\n\n` +
      `See docs/ENVIRONMENTS.md.`,
  );
}

process.env.DATABASE_URL = testUrl;
process.env.DB_DRIVER = "local";
