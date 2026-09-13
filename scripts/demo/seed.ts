/**
 * Demo tenant seed — "Comunidad de vecinos".
 *
 * Builds the whole commercial demo from nothing: the tenant itself, its two
 * accounts, its two card types with their fields, actions, scan validations and
 * presence control, the dashboard configuration, a printable card design per
 * type, 50 cards of each type with their photos in object storage, and
 * ~two and a half months of plausible access history.
 *
 * Given an empty database this is the only command that has to run.
 *
 * The history is SIMULATED, not fabricated row by row: every event replays the
 * same steps the real write paths take — write the field value, freeze a
 * snapshot, then log the row pointing at it — only with the clock supplied
 * instead of read. That is what makes `/history` show real diffs, the activity
 * feed group a scan with the action it caused, and `/presence` answer from
 * field state rather than from a log query.
 *
 * Local by default, like every command in this project. Run it against the
 * Dockerized Postgres + MinIO:
 *
 *   pnpm demo:seed              # tops up what is missing; refuses to touch existing cards
 *   pnpm demo:seed --reset      # DROPS the demo tenant and its accounts, then rebuilds
 *   pnpm demo:seed --designs    # only rewrites the two card designs
 *
 * Nothing here is tenant-agnostic on purpose: it targets one demo tenant by id
 * (`./tenant.ts`), and every write is scoped to it.
 */

import "../load-env";

import { and, eq, sql } from "drizzle-orm";

import { db } from "../../src/lib/db";
import * as schema from "../../src/lib/db/schema";
import { createCard } from "../../src/lib/dal/cards";
import { captureCardSnapshot } from "../../src/lib/snapshots";
import { mapValueToColumn } from "../../src/lib/dal/field-values";
import { SCAN_LOG_ID_METADATA_KEY } from "../../src/lib/dal/metadata-keys";

import { uploadDemoAvatars, uploadGuestPhoto } from "./avatars";
import { buildDwelling, buildPeople, type Person } from "./people";
import { chance, createRng, intBetween, pick, shuffled, type Rng } from "./random";
import {
  buildAccesoPersonalLayout,
  buildBonoAccesosLayout,
  writeDesign,
} from "./designs";
import { DEMO_ACCOUNTS, deleteAccounts, ensureAccounts } from "./accounts";
import {
  TENANT_ID,
  TENANT_NAME,
  ensureTenantSchema,
  requireField,
  selectOptions,
  type CardTypeContext,
  type FieldDef,
} from "./tenant";

// ─── Configuration ───────────────────────────────────────────────────────────

const CARDS_PER_TYPE = 50;
/** How far back the invented access history reaches. */
const HISTORY_DAYS = 75;
/** Cards left "inside" at the end, so /presence has occupants. */
const CARDS_LEFT_INSIDE = 11;
/** Cards that end up with no passes left, to demo the blocking validation. */
const BONO_CARDS_EXHAUSTED = 6;

/** Fixed so a rebuilt demo is the same demo. */
const RNG_SEED = 20260908;

const DESIGN_PERSONAL_NAME = "Carnet · Acceso personal";
const DESIGN_BONO_NAME = "Carnet · Bono de accesos";

// ─── CLI ─────────────────────────────────────────────────────────────────────

const argv = new Set(process.argv.slice(2));
const RESET = argv.has("--reset");
const DESIGNS_ONLY = argv.has("--designs");

// ─── Types ───────────────────────────────────────────────────────────────────

interface SeededCard {
  id: string;
  code: string;
  cardTypeId: string;
}

/** One simulated moment in a card's life, replayed in chronological order. */
interface DemoEvent {
  at: Date;
  card: SeededCard;
  run: (at: Date) => Promise<void>;
}

// ─── Lookups ─────────────────────────────────────────────────────────────────

/** The member whose name every simulated event is attributed to. */
async function loadOperatorUserId(): Promise<string> {
  const [member] = await db
    .select({ userId: schema.tenantMembers.userId })
    .from(schema.tenantMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.tenantMembers.userId))
    .where(
      and(
        eq(schema.tenantMembers.tenantId, TENANT_ID),
        eq(schema.tenantMembers.isActive, true),
        eq(schema.tenantMembers.role, "operator"),
      ),
    )
    .limit(1);

  if (!member) {
    throw new Error("El tenant demo no tiene ningún operador activo.");
  }
  return member.userId;
}

// ─── Write primitives (the real ones, with the clock supplied) ───────────────

/**
 * Upsert one field value at a chosen instant.
 *
 * Delete-then-insert rather than `ON CONFLICT DO UPDATE`, because the
 * `field_values_touch` trigger fires BEFORE UPDATE and would stamp `now()` over
 * the simulated time. `field_values.id` is referenced by nothing, so replacing
 * the row is equivalent — and it keeps the seed from having to disable a
 * trigger the rest of the system depends on.
 */
async function writeFieldValue(
  cardId: string,
  field: FieldDef,
  value: unknown,
  at: Date,
): Promise<void> {
  const typed = mapValueToColumn(field.fieldType, value);

  await db
    .delete(schema.fieldValues)
    .where(
      and(
        eq(schema.fieldValues.cardId, cardId),
        eq(schema.fieldValues.fieldDefinitionId, field.id),
      ),
    );

  await db.insert(schema.fieldValues).values({
    cardId,
    fieldDefinitionId: field.id,
    ...typed,
    createdAt: at,
    updatedAt: at,
  });
}

/** Freeze the card's current state and date the snapshot at the event's time. */
async function snapshotAt(
  cardId: string,
  at: Date,
): Promise<{ snapshotId: string; created: boolean }> {
  const snapshot = await captureCardSnapshot(TENANT_ID, cardId);
  if (snapshot.created) {
    await db
      .update(schema.cardSnapshots)
      .set({ createdAt: at })
      .where(eq(schema.cardSnapshots.id, snapshot.snapshotId));
  }
  return snapshot;
}

interface LogRowInput {
  cardId: string;
  logType: "scan" | "action" | "lifecycle" | "card_edit";
  at: Date;
  executedBy: string;
  actionDefinitionId?: string | null;
  metadata?: Record<string, unknown> | null;
  snapshotId?: string | null;
  snapshotCreated?: boolean;
}

async function insertLog(input: LogRowInput): Promise<string> {
  const [row] = await db
    .insert(schema.actionLogs)
    .values({
      tenantId: TENANT_ID,
      cardId: input.cardId,
      actionDefinitionId: input.actionDefinitionId ?? null,
      logType: input.logType,
      executedAt: input.at,
      executedBy: input.executedBy,
      metadata: input.metadata ?? null,
      cardSnapshotId: input.snapshotId ?? null,
      snapshotCreated: input.snapshotCreated ?? false,
    })
    .returning({ id: schema.actionLogs.id });

  return row.id;
}

// ─── Reset ───────────────────────────────────────────────────────────────────

/**
 * Drop the demo tenant entirely, then its accounts.
 *
 * Deleting the tenant row cascades to card types, fields, cards, field values,
 * snapshots, action logs, designs, dashboard settings and memberships — the
 * whole demo in one statement. `user` rows are the exception: they carry no FK
 * to `tenants` (the schema avoids a circular import), so they are removed
 * separately or the next run collides on the unique email.
 *
 * Only ever reached behind `--reset`, and scoped to the one hard-coded demo
 * tenant id.
 */
async function resetTenant(): Promise<{ tenants: number; users: number }> {
  const deleted = await db
    .delete(schema.tenants)
    .where(eq(schema.tenants.id, TENANT_ID))
    .returning({ id: schema.tenants.id });

  const users = await deleteAccounts();
  return { tenants: deleted.length, users };
}

async function countCards(): Promise<number> {
  const rows = await db
    .select({ id: schema.cards.id })
    .from(schema.cards)
    .where(eq(schema.cards.tenantId, TENANT_ID));
  return rows.length;
}

// ─── Dates ───────────────────────────────────────────────────────────────────

const NOW = new Date();
const DAY_MS = 86_400_000;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

/** A date-only value (the `date` columns carry no meaningful time). */
function isoDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function randomDateBetween(rng: Rng, from: Date, to: Date): Date {
  return new Date(from.getTime() + rng() * (to.getTime() - from.getTime()));
}

/**
 * A moment inside a given day, biased to the hours a gate is actually used:
 * a morning departure/return band and an evening one.
 */
function timeOfDay(rng: Rng, day: Date, band: "morning" | "evening"): Date {
  const hour = band === "morning" ? intBetween(rng, 7, 13) : intBetween(rng, 16, 23);
  const out = new Date(day);
  out.setHours(hour, intBetween(rng, 0, 59), intBetween(rng, 0, 59), 0);
  return out;
}

/** Candidate day offsets, starting at 1 so no event can land in the future. */
function dayOffsets(): number[] {
  return Array.from({ length: HISTORY_DAYS - 1 }, (_, i) => i + 1);
}

// ─── Card creation ───────────────────────────────────────────────────────────

interface PersonalPlan {
  card: SeededCard;
  person: Person;
  /** Sessions are entry/exit pairs; a null exit means the holder is still in. */
  sessions: Array<{ enter: Date; exit: Date | null }>;
}

async function createPersonalCards(
  ct: CardTypeContext,
  people: Person[],
  photoKeys: string[],
  rng: Rng,
): Promise<PersonalPlan[]> {
  const fPhoto = requireField(ct, "photo");
  const fName = requireField(ct, "name");
  const fSurname = requireField(ct, "surname");
  const fStreet = requireField(ct, "street");
  const fNum = requireField(ct, "num");
  const fLetter = requireField(ct, "letter");
  const fDateIni = requireField(ct, "date_ini");
  const fDateEnd = requireField(ct, "date_end");
  const fSpecial = requireField(ct, "special_pass");

  const streets = selectOptions(fStreet);
  const plans: PersonalPlan[] = [];

  // Indices chosen up front so the demo always shows the same edge cases.
  const order = shuffled(rng, [...Array(people.length).keys()]);
  const expired = new Set(order.slice(0, 5));
  const notYetValid = new Set(order.slice(5, 8));
  const stillInside = new Set(order.slice(8, 8 + CARDS_LEFT_INSIDE));

  for (let i = 0; i < people.length; i++) {
    const person = people[i];
    const dwelling = buildDwelling(rng);

    const dateIni = notYetValid.has(i)
      ? isoDate(randomDateBetween(rng, daysAgo(-45), daysAgo(-10)))
      : isoDate(randomDateBetween(rng, new Date("2024-02-01"), daysAgo(120)));

    const dateEnd = expired.has(i)
      ? isoDate(randomDateBetween(rng, daysAgo(50), daysAgo(2)))
      : chance(rng, 0.08)
        ? null
        : isoDate(randomDateBetween(rng, daysAgo(-500), daysAgo(-180)));

    const created = await createCard(ct.id, TENANT_ID, null, {
      [fPhoto.id]: photoKeys[i],
      [fName.id]: person.name,
      [fSurname.id]: person.surname,
      [fStreet.id]: pick(rng, streets),
      [fNum.id]: dwelling.floor,
      [fLetter.id]: dwelling.letter,
      [fDateIni.id]: dateIni,
      ...(dateEnd ? { [fDateEnd.id]: dateEnd } : {}),
      [fSpecial.id]: chance(rng, 0.18),
    });

    plans.push({
      card: { id: created.id, code: created.code, cardTypeId: ct.id },
      person,
      sessions: buildSessions(rng, stillInside.has(i)),
    });
  }

  return plans;
}

/** Entry/exit pairs spread over the history window, newest last. */
function buildSessions(
  rng: Rng,
  leaveOpen: boolean,
): Array<{ enter: Date; exit: Date | null }> {
  const count = intBetween(rng, 3, 14);
  const days = shuffled(rng, dayOffsets()).slice(0, count);
  days.sort((a, b) => b - a);

  const sessions = days.map((d) => {
    const day = daysAgo(d);
    const enter = timeOfDay(rng, day, chance(rng, 0.55) ? "morning" : "evening");
    const exit = new Date(enter.getTime() + intBetween(rng, 25, 320) * 60_000);
    return { enter, exit: exit > NOW ? null : exit };
  });

  if (leaveOpen) {
    // A holder currently inside: entered a few hours ago and has not scanned out.
    const enter = new Date(NOW.getTime() - intBetween(rng, 20, 600) * 60_000);
    sessions.push({ enter, exit: null });
  }

  return sessions;
}

interface BonoPlan {
  card: SeededCard;
  /** Passes bought at issue time. */
  initial: number;
  /** Instants at which one pass was spent, oldest first. */
  uses: Date[];
  /** Seconds the operator took to press the button, one per use. */
  delays: number[];
}

/**
 * A bono is issued to a dwelling, not to a person: it carries no name, and its
 * photo is the same guest graphic on every card, so this takes a count where
 * the personal cards take people.
 */
async function createBonoCards(
  ct: CardTypeContext,
  count: number,
  photoKey: string,
  rng: Rng,
): Promise<BonoPlan[]> {
  const fPhoto = requireField(ct, "photo");
  const fStreet = requireField(ct, "street");
  const fNum = requireField(ct, "num");
  const fLetter = requireField(ct, "letter");
  const fAccess = requireField(ct, "num_access");

  const streets = selectOptions(fStreet);
  const order = shuffled(rng, [...Array(count).keys()]);
  const exhausted = new Set(order.slice(0, BONO_CARDS_EXHAUSTED));

  const plans: BonoPlan[] = [];

  for (let i = 0; i < count; i++) {
    const dwelling = buildDwelling(rng);
    const initial = exhausted.has(i)
      ? pick(rng, [5, 10])
      : pick(rng, [5, 10, 20, 30]);
    const useCount = exhausted.has(i)
      ? initial
      : intBetween(rng, 0, Math.min(initial - 1, 12));

    const created = await createCard(ct.id, TENANT_ID, null, {
      [fPhoto.id]: photoKey,
      [fStreet.id]: pick(rng, streets),
      [fNum.id]: dwelling.floor,
      ...(chance(rng, 0.85) ? { [fLetter.id]: dwelling.letter } : {}),
      [fAccess.id]: initial,
    });

    const days = shuffled(rng, dayOffsets()).slice(0, useCount);
    days.sort((a, b) => b - a);

    plans.push({
      card: { id: created.id, code: created.code, cardTypeId: ct.id },
      initial,
      uses: days.map((d) => timeOfDay(rng, daysAgo(d), chance(rng, 0.5) ? "morning" : "evening")),
      delays: days.map(() => intBetween(rng, 6, 25)),
    });
  }

  return plans;
}

// ─── History simulation ──────────────────────────────────────────────────────

/**
 * One operational scan of a presence-controlled card: the scan row is logged
 * against the state it observed, then the auto-executed toggle flips the
 * presence flag and logs its own row carrying `scanLogId`, which is what makes
 * the feed render the pair as a single entry.
 */
function presenceScanEvent(args: {
  card: SeededCard;
  at: Date;
  presenceField: FieldDef;
  actionDefinitionId: string;
  entering: boolean;
  operatorId: string;
}): DemoEvent {
  return {
    at: args.at,
    card: args.card,
    run: async (at) => {
      const observed = await snapshotAt(args.card.id, at);
      const scanLogId = await insertLog({
        cardId: args.card.id,
        logType: "scan",
        at,
        executedBy: args.operatorId,
        metadata: { method: "operational_scan", cardCode: args.card.code },
        snapshotId: observed.snapshotId,
        snapshotCreated: observed.created,
      });

      const actionAt = new Date(at.getTime() + 900);
      await writeFieldValue(args.card.id, args.presenceField, args.entering, actionAt);
      const after = await snapshotAt(args.card.id, actionAt);

      await insertLog({
        cardId: args.card.id,
        logType: "action",
        at: actionAt,
        executedBy: args.operatorId,
        actionDefinitionId: args.actionDefinitionId,
        metadata: {
          action_type: "toggle",
          target_field: args.presenceField.name,
          before_value: !args.entering,
          after_value: args.entering,
          [SCAN_LOG_ID_METADATA_KEY]: scanLogId,
        },
        snapshotId: after.snapshotId,
        snapshotCreated: after.created,
      });
    },
  };
}

/**
 * One pass spent on a bono card. "Registrar entrada" is not auto-executed, so
 * the operator scans (one row) and then presses the button (a second row with
 * no `scanLogId` — that absence is what marks an action as manual).
 */
function bonoUseEvent(args: {
  card: SeededCard;
  at: Date;
  accessField: FieldDef;
  actionDefinitionId: string;
  before: number;
  /** Seconds between the scan and the operator pressing the button. */
  delaySeconds: number;
  operatorId: string;
}): DemoEvent {
  return {
    at: args.at,
    card: args.card,
    run: async (at) => {
      const observed = await snapshotAt(args.card.id, at);
      await insertLog({
        cardId: args.card.id,
        logType: "scan",
        at,
        executedBy: args.operatorId,
        metadata: { method: "operational_scan", cardCode: args.card.code },
        snapshotId: observed.snapshotId,
        snapshotCreated: observed.created,
      });

      const actionAt = new Date(at.getTime() + args.delaySeconds * 1000);
      const after = args.before - 1;
      await writeFieldValue(args.card.id, args.accessField, after, actionAt);
      const snap = await snapshotAt(args.card.id, actionAt);

      await insertLog({
        cardId: args.card.id,
        logType: "action",
        at: actionAt,
        executedBy: args.operatorId,
        actionDefinitionId: args.actionDefinitionId,
        metadata: {
          action_type: "decrement",
          target_field: args.accessField.name,
          before_value: args.before,
          after_value: after,
        },
        snapshotId: snap.snapshotId,
        snapshotCreated: snap.created,
      });
    },
  };
}

/** An administrator correcting or extending one field — a `card_edit` row. */
function cardEditEvent(args: {
  card: SeededCard;
  at: Date;
  field: FieldDef;
  value: unknown;
  operatorId: string;
}): DemoEvent {
  return {
    at: args.at,
    card: args.card,
    run: async (at) => {
      await writeFieldValue(args.card.id, args.field, args.value, at);
      const snap = await snapshotAt(args.card.id, at);
      if (!snap.created) return;

      await insertLog({
        cardId: args.card.id,
        logType: "card_edit",
        at,
        executedBy: args.operatorId,
        snapshotId: snap.snapshotId,
        snapshotCreated: true,
      });
    },
  };
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Deactivate or archive a handful of cards so the status filter and the trash
 * view have something to show. Mirrors what `src/lib/server/lifecycle/cards.ts`
 * writes, with the timestamp supplied.
 */
async function applyLifecycle(
  plans: PersonalPlan[],
  operatorId: string,
  rng: Rng,
): Promise<{ deactivated: number; archived: number }> {
  const picked = shuffled(rng, plans).slice(0, 5);
  const toDeactivate = picked.slice(0, 3);
  const toArchive = picked.slice(3);

  for (const plan of toDeactivate) {
    const at = daysAgo(intBetween(rng, 2, 30));
    await db
      .update(schema.cards)
      .set({ status: "inactive", updatedAt: at })
      .where(eq(schema.cards.id, plan.card.id));
    await insertLog({
      cardId: plan.card.id,
      logType: "lifecycle",
      at,
      executedBy: operatorId,
      metadata: { from: "active", to: "inactive", transition: "deactivate" },
    });
  }

  for (const plan of toArchive) {
    const at = daysAgo(intBetween(rng, 1, 14));
    await db
      .update(schema.cards)
      .set({
        status: "archived",
        archivedAt: at,
        archivedBy: operatorId,
        statusBeforeArchive: "active",
        updatedAt: at,
      })
      .where(eq(schema.cards.id, plan.card.id));
    await insertLog({
      cardId: plan.card.id,
      logType: "lifecycle",
      at,
      executedBy: operatorId,
      metadata: { from: "active", to: "archived", transition: "archive" },
    });
  }

  return { deactivated: toDeactivate.length, archived: toArchive.length };
}

// ─── Designs ─────────────────────────────────────────────────────────────────

async function writeDesigns(
  personal: CardTypeContext,
  bono: CardTypeContext,
): Promise<void> {
  await writeDesign({
    tenantId: TENANT_ID,
    cardTypeId: personal.id,
    name: DESIGN_PERSONAL_NAME,
    description:
      "Carnet CR80 del acceso personal: cabecera de comunidad, foto del titular, vivienda, vigencia y código de barras.",
    layout: buildAccesoPersonalLayout({
      photo: requireField(personal, "photo").id,
      name: requireField(personal, "name").id,
      surname: requireField(personal, "surname").id,
      street: requireField(personal, "street").id,
      num: requireField(personal, "num").id,
      letter: requireField(personal, "letter").id,
      dateIni: requireField(personal, "date_ini").id,
      dateEnd: requireField(personal, "date_end").id,
      specialPass: requireField(personal, "special_pass").id,
    }),
  });

  await writeDesign({
    tenantId: TENANT_ID,
    cardTypeId: bono.id,
    name: DESIGN_BONO_NAME,
    description:
      "Carnet CR80 del bono de accesos: vivienda, contador de pases y código de barras.",
    layout: buildBonoAccesosLayout({
      photo: requireField(bono, "photo").id,
      street: requireField(bono, "street").id,
      num: requireField(bono, "num").id,
      letter: requireField(bono, "letter").id,
    }),
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const rng = createRng(RNG_SEED);

  if (DESIGNS_ONLY) {
    const { personal, bono } = await ensureTenantSchema();
    await writeDesigns(personal, bono);
    console.log("Diseños reescritos. Nada más se ha tocado.");
    return;
  }

  if (RESET) {
    const removed = await resetTenant();
    console.log(
      removed.tenants > 0
        ? `Borrado el tenant demo entero (${removed.users} cuentas incluidas).`
        : "No había tenant demo que borrar.",
    );
  }

  // ── Tenant, esquema y cuentas ──────────────────────────────────────────────
  const { personal, bono, tenantCreated } = await ensureTenantSchema();
  console.log(
    `Tenant "${TENANT_NAME}" ${tenantCreated ? "creado" : "reutilizado"} · ` +
      `tipos "${personal.name}" y "${bono.name}"`,
  );

  await ensureAccounts();
  console.log(
    `Cuentas: ${DEMO_ACCOUNTS.map((a) => `${a.username}/${a.password} (${a.role})`).join(" · ")}`,
  );

  const existing = await countCards();
  if (existing > 0) {
    throw new Error(
      `El tenant demo ya tiene ${existing} carnets. Vuelve a ejecutar con --reset para reconstruirlo desde cero.`,
    );
  }

  const operatorId = await loadOperatorUserId();

  // ── Cards ──────────────────────────────────────────────────────────────────
  const people = buildPeople(rng, CARDS_PER_TYPE);

  console.log(`Descargando y subiendo ${people.length} avatares…`);
  const photoKeys = await uploadDemoAvatars(
    TENANT_ID,
    people.map((p) => p.avatarSeed),
    (done, total) => {
      if (done % 20 === 0 || done === total) console.log(`  avatares ${done}/${total}`);
    },
  );
  const guestPhotoKey = await uploadGuestPhoto(TENANT_ID);
  console.log("Subida la foto fija de los bonos (acceso invitado).");

  const personalPlans = await createPersonalCards(personal, people, photoKeys, rng);
  const bonoPlans = await createBonoCards(bono, CARDS_PER_TYPE, guestPhotoKey, rng);
  console.log(`Creados ${personalPlans.length + bonoPlans.length} carnets.`);

  // Age the cards so they predate the history they are about to accumulate.
  await backdateCards([...personalPlans.map((p) => p.card), ...bonoPlans.map((p) => p.card)], rng);

  // ── History ────────────────────────────────────────────────────────────────
  const presenceField = requireField(personal, "__presence");
  const accessField = requireField(bono, "num_access");
  const presenceActionId = await loadActionDefinitionId(personal.id, "toggle");
  const bonoActionId = await loadActionDefinitionId(bono.id, "decrement");

  const events: DemoEvent[] = [];

  for (const plan of personalPlans) {
    for (const session of plan.sessions) {
      events.push(
        presenceScanEvent({
          card: plan.card,
          at: session.enter,
          presenceField,
          actionDefinitionId: presenceActionId,
          entering: true,
          operatorId,
        }),
      );
      if (session.exit) {
        events.push(
          presenceScanEvent({
            card: plan.card,
            at: session.exit,
            presenceField,
            actionDefinitionId: presenceActionId,
            entering: false,
            operatorId,
          }),
        );
      }
    }
  }

  for (const plan of bonoPlans) {
    let remaining = plan.initial;
    plan.uses.forEach((at, i) => {
      events.push(
        bonoUseEvent({
          card: plan.card,
          at,
          accessField,
          actionDefinitionId: bonoActionId,
          before: remaining,
          delaySeconds: plan.delays[i],
          operatorId,
        }),
      );
      remaining -= 1;
    });
  }

  events.push(...buildEditEvents(personal, personalPlans, operatorId, rng));

  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  console.log(`Simulando ${events.length} eventos de historial…`);

  let processed = 0;
  for (const event of events) {
    await event.run(event.at);
    processed++;
    if (processed % 250 === 0) console.log(`  eventos ${processed}/${events.length}`);
  }

  // The card's updated_at should reflect its last event, not the seed run.
  await syncCardUpdatedAt();

  const lifecycle = await applyLifecycle(personalPlans, operatorId, rng);
  console.log(
    `Ciclo de vida: ${lifecycle.deactivated} desactivados, ${lifecycle.archived} archivados.`,
  );

  // ── Diseños ────────────────────────────────────────────────────────────────
  // The display configuration was already applied by `ensureTenantSchema`.
  await writeDesigns(personal, bono);

  await report();
}

/** Push each card's creation date behind the history it will accumulate. */
async function backdateCards(cards: SeededCard[], rng: Rng): Promise<void> {
  for (const card of cards) {
    const at = daysAgo(intBetween(rng, HISTORY_DAYS + 5, HISTORY_DAYS + 400));
    await db
      .update(schema.cards)
      .set({ createdAt: at, updatedAt: at })
      .where(eq(schema.cards.id, card.id));
    // Only the V0 exists at this point, so this dates the card's birth state.
    await db
      .update(schema.cardSnapshots)
      .set({ createdAt: at })
      .where(eq(schema.cardSnapshots.cardId, card.id));
    await db
      .update(schema.fieldValues)
      .set({ createdAt: at })
      .where(eq(schema.fieldValues.cardId, card.id));
  }
}

/** Align `cards.updated_at` with the newest log row each card carries. */
async function syncCardUpdatedAt(): Promise<void> {
  await db.execute(sql`
    UPDATE cards c
    SET updated_at = latest.at
    FROM (
      SELECT card_id, max(executed_at) AS at
      FROM action_logs
      WHERE tenant_id = ${TENANT_ID}::uuid
      GROUP BY card_id
    ) AS latest
    WHERE c.id = latest.card_id
      AND c.tenant_id = ${TENANT_ID}::uuid
  `);
}

async function loadActionDefinitionId(
  cardTypeId: string,
  actionType: "toggle" | "decrement",
): Promise<string> {
  const [row] = await db
    .select({ id: schema.actionDefinitions.id })
    .from(schema.actionDefinitions)
    .where(
      and(
        eq(schema.actionDefinitions.cardTypeId, cardTypeId),
        eq(schema.actionDefinitions.actionType, actionType),
        eq(schema.actionDefinitions.isActive, true),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error(`No hay acción "${actionType}" activa en el tipo ${cardTypeId}.`);
  }
  return row.id;
}

/** A few administrative corrections, so `/history` is not only scans. */
function buildEditEvents(
  ct: CardTypeContext,
  plans: PersonalPlan[],
  operatorId: string,
  rng: Rng,
): DemoEvent[] {
  const fLetter = requireField(ct, "letter");
  const fDateEnd = requireField(ct, "date_end");
  const fSpecial = requireField(ct, "special_pass");

  const chosen = shuffled(rng, plans).slice(0, 9);

  return chosen.map((plan, i) => {
    const at = daysAgo(intBetween(rng, 1, HISTORY_DAYS - 5));
    if (i % 3 === 0) {
      return cardEditEvent({
        card: plan.card,
        at,
        field: fDateEnd,
        value: isoDate(randomDateBetween(rng, daysAgo(-900), daysAgo(-600))),
        operatorId,
      });
    }
    if (i % 3 === 1) {
      return cardEditEvent({
        card: plan.card,
        at,
        field: fSpecial,
        value: true,
        operatorId,
      });
    }
    return cardEditEvent({
      card: plan.card,
      at,
      field: fLetter,
      value: pick(rng, ["A", "B", "C", "D"]),
      operatorId,
    });
  });
}

/** Final counts, so a run can be checked at a glance. */
async function report(): Promise<void> {
  const rows = await db.execute<{ label: string; total: number }>(sql`
    SELECT 'carnets' AS label, count(*)::int AS total FROM cards WHERE tenant_id = ${TENANT_ID}::uuid
    UNION ALL SELECT 'valores', count(*)::int FROM field_values fv
      JOIN cards c ON c.id = fv.card_id WHERE c.tenant_id = ${TENANT_ID}::uuid
    UNION ALL SELECT 'instantáneas', count(*)::int FROM card_snapshots WHERE tenant_id = ${TENANT_ID}::uuid
    UNION ALL SELECT 'registros', count(*)::int FROM action_logs WHERE tenant_id = ${TENANT_ID}::uuid
    UNION ALL SELECT 'dentro ahora', count(*)::int FROM field_values fv
      JOIN cards c ON c.id = fv.card_id
      JOIN card_types ct ON ct.id = c.card_type_id
      WHERE c.tenant_id = ${TENANT_ID}::uuid
        AND fv.field_definition_id = ct.presence_field_definition_id
        AND fv.value_boolean IS TRUE
        AND c.status = 'active'
  `);

  console.log("\nResumen:");
  for (const row of rows.rows) {
    console.log(`  ${row.label.padEnd(14)} ${row.total}`);
  }

  console.log("\nAcceso a la demo (http://localhost:3000):");
  for (const account of DEMO_ACCOUNTS) {
    console.log(
      `  ${account.role.padEnd(8)} usuario "${account.username}" · contraseña "${account.password}"`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
