import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let _db: NeonHttpDatabase<typeof schema> | null = null;

function getDb() {
  if (!_db) {
    _db = drizzle(neon(process.env.DATABASE_URL!), { schema });
  }
  return _db;
}

// Proxy que inicializa la conexión solo cuando se usa (en runtime, no en build)
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_, prop: string | symbol) {
    return Reflect.get(getDb(), prop);
  },
});
