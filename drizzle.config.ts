import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
import { assertDatabaseTarget } from "./src/lib/db/guard";

// Mirrors the precedence Next.js applies in development. `dotenv` never
// overwrites a variable that is already set, so an overlay loaded by
// dotenv-cli (the `:prod` / `:branch` scripts) wins over every file below —
// which is what makes `db:migrate` local by default and remote only when the
// command says so.
config({ path: ".env.test.local" });
config({ path: ".env.local" });
config({ path: ".env.development" });
config({ path: ".env" });

// `pnpm db:migrate:test` sets DRIZZLE_TARGET=test to point the migrator at the
// dedicated test database, so its URL is not duplicated in package.json.
const url =
  process.env.DRIZZLE_TARGET === "test"
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;

assertDatabaseTarget(url, "drizzle.config.ts");

export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
