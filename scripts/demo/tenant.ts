/**
 * The demo tenant's own definition — everything a client sees configured
 * before a single card exists.
 *
 * This file is the seed's answer to "could I rebuild the demo on an empty
 * database?". The tenant row, its two card types, their fields, actions, scan
 * validations, presence control, dashboard settings and the two per-card-type
 * display configurations are all declared here as data and applied idempotently.
 *
 * The tenant id is a constant, not generated: bookmarks, screenshots and the
 * `demo-tenant-comercial` note all name it, and a rebuilt demo that changed its
 * id would invalidate every one of them.
 *
 * Idempotent throughout — a second run finds what the first created and leaves
 * it alone. `--reset` (in `seed.ts`) is the only path that destroys anything.
 */

import { and, eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import * as schema from "../../src/lib/db/schema";
import { addFieldDefinition } from "../../src/lib/dal/field-definitions";
import { createActionDefinition } from "../../src/lib/dal/actions";
import { createScanValidation } from "../../src/lib/dal/scan-validations";
import { upsertDashboardSettings, setCardTypeSummaryFields } from "../../src/lib/dal/dashboard-settings";
import { setCardTypeActiveZoneFields } from "../../src/lib/dal/active-card-zone-fields";
import { enablePresenceControl } from "../../src/lib/server/presence/provisioning";
import type { FieldType } from "../../src/lib/dal/types";

// ─── Identity ────────────────────────────────────────────────────────────────

export const TENANT_ID = "4285d806-1517-47a9-bdfd-ca3c8155e56c";
export const TENANT_NAME = "Comunidad de vecinos";

export const CARD_TYPE_PERSONAL = "Acceso personal";
export const CARD_TYPE_BONO = "Bono accesos";

/** Street options, per card type. They differ — that is how the tenant has them. */
const STREETS_PERSONAL = ["Avenida Madrid 11", "Constitución 30"];
const STREETS_BONO = ["Av Madrid 11", "Constitución 30"];

// ─── Declarative schema ──────────────────────────────────────────────────────

interface FieldSpec {
  name: string;
  label: string;
  fieldType: FieldType;
  isRequired?: boolean;
  options?: string[];
}

interface ValidationSpec {
  field: string;
  rule: string;
  value: unknown;
  errorMessage: string;
  severity: "error" | "warning";
}

interface ActionSpec {
  name: string;
  actionType: "increment" | "decrement" | "check" | "uncheck" | "toggle";
  field: string;
  config?: Record<string, unknown> | null;
  isAutoExecute: boolean;
}

interface CardTypeSpec {
  name: string;
  description: string;
  /** Presence control provisions the `__presence` field and its toggle action. */
  presence: boolean;
  fields: FieldSpec[];
  actions: ActionSpec[];
  validations: ValidationSpec[];
  /** Feed row: up to 3 values shown inline under the card code. */
  summaryFields: string[];
  /** Last-scanned panel: 3×3 grid, `position` 0-8. A photo may span two rows. */
  activeZone: Array<{ field: string; position: number; rowSpan?: 1 | 2 }>;
}

const PERSONAL: CardTypeSpec = {
  name: CARD_TYPE_PERSONAL,
  description: "Acceso personal de los propietarios",
  presence: true,
  fields: [
    { name: "photo", label: "Foto", fieldType: "photo" },
    { name: "name", label: "Nombre", fieldType: "text", isRequired: true },
    { name: "surname", label: "Apellido", fieldType: "text" },
    { name: "street", label: "Calle", fieldType: "select", isRequired: true, options: STREETS_PERSONAL },
    { name: "num", label: "Piso", fieldType: "number", isRequired: true },
    { name: "letter", label: "Letra", fieldType: "text", isRequired: true },
    { name: "date_ini", label: "Fecha inicio", fieldType: "date" },
    { name: "date_end", label: "Fecha fin", fieldType: "date" },
    { name: "special_pass", label: "Pase especial", fieldType: "boolean", isRequired: true },
  ],
  // The toggle that flips `__presence` is provisioned by presence control, not
  // declared here — it is a system action and belongs to that mechanism.
  actions: [],
  validations: [
    {
      field: "date_ini",
      rule: "date_before",
      value: { relative: "today" },
      errorMessage: "Carnet no permitido aún",
      severity: "error",
    },
    {
      field: "date_end",
      rule: "date_after",
      value: { relative: "today" },
      errorMessage: "El carnet está fuera de fecha",
      severity: "error",
    },
  ],
  summaryFields: ["photo", "name", "surname"],
  activeZone: [
    { field: "photo", position: 0, rowSpan: 2 },
    { field: "name", position: 1 },
    { field: "surname", position: 2 },
    { field: "date_end", position: 4 },
    { field: "special_pass", position: 5 },
    { field: "street", position: 6 },
    { field: "num", position: 7 },
    { field: "letter", position: 8 },
  ],
};

const BONO: CardTypeSpec = {
  name: CARD_TYPE_BONO,
  description: "Bono accesos",
  presence: false,
  fields: [
    { name: "photo", label: "Foto", fieldType: "photo" },
    { name: "street", label: "Calle", fieldType: "select", isRequired: true, options: STREETS_BONO },
    { name: "num", label: "Piso", fieldType: "number", isRequired: true },
    { name: "letter", label: "Letra", fieldType: "text" },
    { name: "num_access", label: "Número de pases", fieldType: "number", isRequired: true },
  ],
  actions: [
    {
      name: "Registrar entrada",
      actionType: "decrement",
      field: "num_access",
      config: { amount: 1 },
      // Not auto-executed: the operator scans, sees the card, and then decides
      // to spend a pass. That is what makes its log row a manual action.
      // `is_operator_visible` is not passed because the column defaults to
      // true, which is exactly what an operator-pressed action wants.
      isAutoExecute: false,
    },
  ],
  validations: [
    {
      field: "num_access",
      rule: "number_gt",
      value: { target: 0 },
      errorMessage: "No quedan pases",
      severity: "error",
    },
  ],
  summaryFields: ["street", "num", "num_access"],
  activeZone: [
    { field: "photo", position: 0, rowSpan: 2 },
    { field: "street", position: 1 },
    { field: "num_access", position: 2 },
    { field: "num", position: 4 },
    { field: "letter", position: 5 },
  ],
};

export const CARD_TYPE_SPECS = [PERSONAL, BONO];

// ─── Applied shape ───────────────────────────────────────────────────────────

export interface FieldDef {
  id: string;
  name: string;
  fieldType: FieldType;
  validationRules: unknown;
}

export interface CardTypeContext {
  id: string;
  name: string;
  fields: Map<string, FieldDef>;
}

export function requireField(ct: CardTypeContext, name: string): FieldDef {
  const f = ct.fields.get(name);
  if (!f) {
    throw new Error(
      `El tipo "${ct.name}" no tiene el campo "${name}". Campos: ${[...ct.fields.keys()].join(", ")}.`,
    );
  }
  return f;
}

/**
 * Read a select field's allowed options straight from its validation rules, so
 * a caller can never write a value the form would reject.
 */
export function selectOptions(field: FieldDef): string[] {
  const rules = (field.validationRules as { rules?: Array<{ rule: string; value: unknown }> } | null)
    ?.rules;
  const options = rules?.find((r) => r.rule === "options")?.value;
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error(`El campo "${field.name}" no declara opciones.`);
  }
  return options.map(String);
}

// ─── Provisioning ────────────────────────────────────────────────────────────

/** Create the tenant row under its fixed id, or return the existing one. */
export async function ensureTenant(): Promise<{ created: boolean }> {
  const [existing] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, TENANT_ID))
    .limit(1);

  if (existing) return { created: false };

  await db.insert(schema.tenants).values({
    id: TENANT_ID,
    name: TENANT_NAME,
    // Both input paths on, so a demo can be given either a phone camera or a
    // USB reader without touching settings first.
    scanMode: "both",
    scanStrategy: "standard",
    archiveRetentionDays: 30,
  });

  return { created: true };
}

/** Feed limits and the override policy. */
export async function ensureDashboardSettings(): Promise<void> {
  await upsertDashboardSettings(TENANT_ID, {
    feedLimit: 10,
    showScanEntries: true,
    showActionEntries: true,
    // Off: a failed validation stops the auto-actions outright, which is the
    // stricter behaviour and the one worth demonstrating first.
    allowOverrideOnError: false,
  });
}

async function loadFields(cardTypeId: string): Promise<Map<string, FieldDef>> {
  const rows = await db
    .select()
    .from(schema.fieldDefinitions)
    .where(
      and(
        eq(schema.fieldDefinitions.cardTypeId, cardTypeId),
        eq(schema.fieldDefinitions.isActive, true),
      ),
    );

  return new Map(
    rows.map((r) => [
      r.name,
      {
        id: r.id,
        name: r.name,
        fieldType: r.fieldType as FieldType,
        validationRules: r.validationRules,
      },
    ]),
  );
}

/** `validation_rules` for a field, or null when it needs none. */
function rulesFor(spec: FieldSpec): Record<string, unknown> | null {
  if (!spec.options) return null;
  return { rules: [{ rule: "options", value: spec.options }] };
}

/**
 * Create one card type with its fields, actions, validations and presence
 * control, or top up whatever is missing from an existing one.
 */
async function ensureCardType(spec: CardTypeSpec): Promise<CardTypeContext> {
  const [existing] = await db
    .select()
    .from(schema.cardTypes)
    .where(
      and(
        eq(schema.cardTypes.tenantId, TENANT_ID),
        eq(schema.cardTypes.name, spec.name),
      ),
    )
    .limit(1);

  let cardTypeId: string;
  if (existing) {
    cardTypeId = existing.id;
  } else {
    const [created] = await db
      .insert(schema.cardTypes)
      .values({
        tenantId: TENANT_ID,
        name: spec.name,
        description: spec.description,
      })
      .returning();
    cardTypeId = created.id;
  }

  // Fields, in declaration order — `position` is what the form renders by.
  let fields = await loadFields(cardTypeId);
  for (let i = 0; i < spec.fields.length; i++) {
    const fieldSpec = spec.fields[i];
    if (fields.has(fieldSpec.name)) continue;
    await addFieldDefinition(cardTypeId, {
      name: fieldSpec.name,
      label: fieldSpec.label,
      fieldType: fieldSpec.fieldType,
      isRequired: fieldSpec.isRequired ?? false,
      position: i,
      validationRules: rulesFor(fieldSpec),
    });
  }
  fields = await loadFields(cardTypeId);

  // Presence control, before the declared actions so `__presence` exists for
  // anything that might target it.
  if (spec.presence) {
    await enablePresenceControl(TENANT_ID, cardTypeId);
    fields = await loadFields(cardTypeId);
  }

  const existingActions = await db
    .select({ name: schema.actionDefinitions.name })
    .from(schema.actionDefinitions)
    .where(eq(schema.actionDefinitions.cardTypeId, cardTypeId));
  const actionNames = new Set(existingActions.map((a) => a.name));

  for (const action of spec.actions) {
    if (actionNames.has(action.name)) continue;
    await createActionDefinition(cardTypeId, {
      name: action.name,
      actionType: action.actionType,
      targetFieldDefinitionId: requireField(
        { id: cardTypeId, name: spec.name, fields },
        action.field,
      ).id,
      config: action.config ?? null,
      isAutoExecute: action.isAutoExecute,
    });
  }

  const existingValidations = await db
    .select({
      fieldDefinitionId: schema.scanValidations.fieldDefinitionId,
      rule: schema.scanValidations.rule,
    })
    .from(schema.scanValidations)
    .where(eq(schema.scanValidations.cardTypeId, cardTypeId));
  const validationKeys = new Set(
    existingValidations.map((v) => `${v.fieldDefinitionId}:${v.rule}`),
  );

  const ctx: CardTypeContext = { id: cardTypeId, name: spec.name, fields };

  for (const validation of spec.validations) {
    const field = requireField(ctx, validation.field);
    if (validationKeys.has(`${field.id}:${validation.rule}`)) continue;
    await createScanValidation(cardTypeId, {
      fieldDefinitionId: field.id,
      rule: validation.rule,
      value: validation.value,
      errorMessage: validation.errorMessage,
      severity: validation.severity,
    });
  }

  return ctx;
}

/**
 * Which fields the feed row and the last-scanned panel show.
 *
 * Rewritten on every run rather than topped up: both are ordered layouts, and a
 * half-applied order is worse than no order at all. Without them the feed rows
 * and the panel render bare card codes, which makes a populated history look
 * empty.
 */
async function applyDisplayConfig(
  spec: CardTypeSpec,
  ctx: CardTypeContext,
): Promise<void> {
  await setCardTypeSummaryFields(ctx.id, TENANT_ID, {
    fieldDefinitionIds: spec.summaryFields.map((n) => requireField(ctx, n).id),
  });

  await setCardTypeActiveZoneFields(ctx.id, TENANT_ID, {
    cells: spec.activeZone.map((cell) => ({
      fieldDefinitionId: requireField(ctx, cell.field).id,
      position: cell.position,
      rowSpan: cell.rowSpan ?? 1,
    })),
  });
}

/** Bring the whole tenant definition into being. Safe to re-run. */
export async function ensureTenantSchema(): Promise<{
  personal: CardTypeContext;
  bono: CardTypeContext;
  tenantCreated: boolean;
}> {
  const { created } = await ensureTenant();
  await ensureDashboardSettings();

  const contexts: CardTypeContext[] = [];
  for (const spec of CARD_TYPE_SPECS) {
    const ctx = await ensureCardType(spec);
    await applyDisplayConfig(spec, ctx);
    contexts.push(ctx);
  }

  return { personal: contexts[0], bono: contexts[1], tenantCreated: created };
}
