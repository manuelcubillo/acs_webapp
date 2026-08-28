import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { assertDatabaseTarget } from "./guard";

type Database = NeonHttpDatabase<typeof schema>;

let _db: Database | null = null;

// `DB_DRIVER` picks the client: "neon" (default) talks Neon's HTTP proxy
// (required on Vercel's serverless runtime); "local" talks a regular
// Postgres over the wire protocol (the Dockerized DB for local dev), which
// the HTTP driver cannot reach. Both drivers expose the same drizzle query
// builder surface, and nothing here uses driver-specific APIs (no
// `db.transaction()` — Neon HTTP doesn't support it, see constraints doc),
// so the local-driver instance is cast to the canonical `Database` type
// rather than widening every call site to a union.
function buildDb(): Database {
  const driver = (process.env.DB_DRIVER ?? "neon").toLowerCase();
  const url = process.env.DATABASE_URL;
  // Refuses a remote target from a non-production runtime. See ./guard.ts.
  assertDatabaseTarget(url, "src/lib/db");
  switch (driver) {
    case "local":
      return drizzlePg(new Pool({ connectionString: url }), {
        schema,
      }) as unknown as Database;
    case "neon":
      return drizzleNeon(neon(url), { schema });
    default:
      throw new Error(`Invalid DB_DRIVER "${driver}". Expected "neon" or "local".`);
  }
}

function getDb() {
  if (!_db) {
    _db = buildDb();
  }
  return _db;
}

// Proxy que inicializa la conexión solo cuando se usa (en runtime, no en build)
export const db = new Proxy({} as Database, {
  get(_, prop: string | symbol) {
    return Reflect.get(getDb(), prop);
  },
});
