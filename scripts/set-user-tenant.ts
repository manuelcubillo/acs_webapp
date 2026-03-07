import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { user } from "../src/lib/db/schema/auth";

const USER_ID = "GulNgHnLZfCgKXPhUJg8red7RCUrjbGX";
const TENANT_ID = "35b5e378-e45b-4a60-8571-a8880f7a4330";

async function main() {
  const db = drizzle(neon(process.env.DATABASE_URL!));

  const result = await db
    .update(user)
    .set({ tenantId: TENANT_ID })
    .where(eq(user.id, USER_ID))
    .returning({ id: user.id, email: user.email, tenantId: user.tenantId });

  if (result.length === 0) {
    console.error("No se encontró el usuario con id:", USER_ID);
    process.exit(1);
  }

  console.log("✓ user.tenant_id actualizado:", result[0]);
}

main().catch((e) => { console.error(e); process.exit(1); });
