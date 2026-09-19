/**
 * The demo tenant's user accounts.
 *
 * Two accounts, one per role a client wants to see: a `master` that can define
 * card types and settings, and an `operator` that can only scan, read and press
 * action buttons. Sitting in front of the app as each of them is how the role
 * system demonstrates itself.
 *
 * The passwords are deliberately trivial and shared between both accounts.
 * That is a property of a throwaway local demo, not a pattern: this tenant
 * exists only in the Dockerized `acs_dev` database and holds no real person's
 * data.
 *
 * Accounts go through `auth.api.signUpEmail`, the same entry point the
 * invitation flow uses, so hashing, the `account` row and the username plugin's
 * columns are Better Auth's business rather than this script's.
 */

import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";

import { auth } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
import * as schema from "../../src/lib/db/schema";
import type { TenantRole } from "../../src/lib/dal/types";

import { TENANT_ID } from "./tenant";

export interface DemoAccount {
  name: string;
  email: string;
  username: string;
  /** What the login form shows back; the username plugin keeps both. */
  displayUsername: string;
  password: string;
  role: TenantRole;
}

/**
 * Ordered on purpose: the master is created first, so demoting an account that
 * used to be master (a previous run's `operador`) can never leave the tenant
 * without one.
 */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    name: "Administrador",
    email: "administrador@comunidad.es",
    username: "demo_administrador",
    displayUsername: "Administrador",
    password: "12341234",
    role: "master",
  },
  {
    name: "Operador",
    email: "operador@comunidad.es",
    username: "demo_operador",
    displayUsername: "Operador",
    password: "12341234",
    role: "operator",
  },
];

/**
 * Upsert the membership directly rather than through `addMember` /
 * `updateMemberRole`.
 *
 * Those refuse a role change that would leave no active master — correct for a
 * user-facing action, wrong here: the seed rewrites the whole roster in one
 * pass and the master is already in place by the time anything is demoted.
 */
async function ensureMember(userId: string, role: TenantRole): Promise<void> {
  const [existing] = await db
    .select()
    .from(schema.tenantMembers)
    .where(
      and(
        eq(schema.tenantMembers.tenantId, TENANT_ID),
        eq(schema.tenantMembers.userId, userId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(schema.tenantMembers)
      .set({ role, isActive: true, removedAt: null, updatedAt: new Date() })
      .where(eq(schema.tenantMembers.id, existing.id));
    return;
  }

  await db
    .insert(schema.tenantMembers)
    .values({ tenantId: TENANT_ID, userId, role });
}

/**
 * Refuse to run if one of the demo identities already belongs to somebody else.
 *
 * `ensureAccounts` matches an existing account by email and then rewrites its
 * name, username and `tenantId`. That is the right behaviour for a re-run of
 * the demo and the wrong one for a stranger: on the production database these
 * demo rows sit next to real accounts, and an email or username collision would
 * quietly move a real user into the demo tenant. The unique index on `username`
 * would also abort the run halfway.
 *
 * Neither collision can happen by accident — the addresses are at a domain
 * nobody else uses — but "cannot happen" is cheaper to assert than to assume.
 */
async function assertNoForeignCollision(): Promise<void> {
  const emails = DEMO_ACCOUNTS.map((a) => a.email);
  const usernames = DEMO_ACCOUNTS.map((a) => a.username);

  const clashes = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      username: schema.user.username,
      tenantId: schema.user.tenantId,
    })
    .from(schema.user)
    .where(
      and(
        or(
          inArray(schema.user.email, emails),
          inArray(schema.user.username, usernames),
        ),
        // `user.tenant_id` is nullable, and `<> ` against NULL is NULL, not
        // true — without the explicit IS NULL an account with no tenant would
        // slip through the very check meant to catch it.
        or(isNull(schema.user.tenantId), ne(schema.user.tenantId, TENANT_ID)),
      ),
    );

  if (clashes.length > 0) {
    const detail = clashes
      .map((c) => `  ${c.email} (usuario "${c.username}", tenant ${c.tenantId})`)
      .join("\n");
    throw new Error(
      `Hay cuentas que usan el email o el usuario de la demo pero pertenecen a ` +
        `otro tenant:\n${detail}\n` +
        `Sembrar la demo las movería al tenant demo. Cambia las credenciales en ` +
        `DEMO_ACCOUNTS antes de continuar.`,
    );
  }
}

/**
 * Create the demo accounts and attach them to the tenant.
 *
 * An account that already exists keeps its password — Better Auth owns the
 * hash, and re-running the seed should not silently reset a password somebody
 * changed. Only the role and the tenant link are brought back in line.
 *
 * @returns The user id of each account, keyed by username.
 */
export async function ensureAccounts(): Promise<Record<string, string>> {
  await assertNoForeignCollision();

  const ids: Record<string, string> = {};

  for (const account of DEMO_ACCOUNTS) {
    const [existing] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, account.email))
      .limit(1);

    let userId: string;
    if (existing) {
      userId = existing.id;
    } else {
      // `tenantId` is a Better Auth additionalField and `username` /
      // `displayUsername` come from the username plugin, so none of the three
      // is in the base sign-up body type. Cast once, at the boundary, exactly
      // as `src/lib/actions/members.ts` does.
      const body = {
        name: account.name,
        email: account.email,
        username: account.username,
        displayUsername: account.displayUsername,
        password: account.password,
        tenantId: TENANT_ID,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      const created = await auth.api.signUpEmail({ body });
      if (!created?.user?.id) {
        throw new Error(
          `No se pudo crear la cuenta "${account.username}". ¿Usuario o email ya en uso?`,
        );
      }
      userId = created.user.id;
    }

    await db
      .update(schema.user)
      .set({
        name: account.name,
        username: account.username,
        displayUsername: account.displayUsername,
        tenantId: TENANT_ID,
        updatedAt: new Date(),
      })
      .where(eq(schema.user.id, userId));

    await ensureMember(userId, account.role);
    ids[account.username] = userId;
  }

  return ids;
}

/**
 * Delete the demo accounts outright.
 *
 * Only reached from `--reset`. `user` rows carry no FK to `tenants` (the schema
 * avoids a circular import), so dropping the tenant leaves them behind, and a
 * leftover row would then collide with the next run on the unique email and
 * username. Sessions and `account` rows cascade from `user`.
 *
 * @returns How many rows were removed.
 */
export async function deleteAccounts(): Promise<number> {
  const emails = DEMO_ACCOUNTS.map((a) => a.email);
  let removed = 0;

  for (const email of emails) {
    const deleted = await db
      .delete(schema.user)
      .where(eq(schema.user.email, email))
      .returning({ id: schema.user.id });
    removed += deleted.length;
  }

  return removed;
}
