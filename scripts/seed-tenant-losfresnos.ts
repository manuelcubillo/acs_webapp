/**
 * seed-tenant-losfresnos.ts
 *
 * Crea el tenant "Los fresnos" y asocia al usuario
 * GulNgHnLZfCgKXPhUJg8red7RCUrjbGX como master.
 *
 * Uso:
 *   PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx tsx scripts/seed-tenant-losfresnos.ts
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { tenants, tenantMembers } from "../src/lib/db/schema";

const USER_ID = "GulNgHnLZfCgKXPhUJg8red7RCUrjbGX";
const TENANT_NAME = "Los fresnos";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set. Check .env.local");
  }

  const db = drizzle(neon(process.env.DATABASE_URL));

  // 1. Crear tenant
  console.log(`Creando tenant "${TENANT_NAME}"...`);
  const [tenant] = await db
    .insert(tenants)
    .values({ name: TENANT_NAME })
    .returning();

  console.log(`✓ Tenant creado:`, tenant);

  // 2. Crear membership master
  console.log(`Asociando usuario ${USER_ID} como master...`);
  const [member] = await db
    .insert(tenantMembers)
    .values({
      tenantId: tenant.id,
      userId: USER_ID,
      role: "master",
    })
    .returning();

  console.log(`✓ Membership creada:`, member);
  console.log("\n¡Listo! El usuario ya es master de", TENANT_NAME);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
