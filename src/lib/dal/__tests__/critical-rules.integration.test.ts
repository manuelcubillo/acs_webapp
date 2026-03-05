/**
 * Integration tests for critical DAL business rules.
 *
 * These tests run against the real Neon database (using .env.local)
 * to validate rules that depend on actual DB state:
 *
 * 1. Cannot change field_type when field values exist
 * 2. Required fields must have values when creating a card
 * 3. Tenant isolation — data from one tenant is invisible to another
 * 4. Duplicate card code within a tenant is rejected
 * 5. Same card code across different tenants is allowed
 *
 * WARNING: These tests create and delete real data. They use unique names
 * prefixed with "__test_" so they can be cleaned up safely.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";

// Load env before any imports that use DATABASE_URL.
config({ path: ".env.local" });

import { eq, and, like } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tenants,
  cardTypes,
  fieldDefinitions,
  cards,
  fieldValues,
} from "@/lib/db/schema";

import { createTenant, deleteTenant } from "../tenants";
import {
  createCardType,
  getCardTypeById,
} from "../card-types";
import {
  addFieldDefinition,
  updateFieldDefinition,
} from "../field-definitions";
import { createCard, getCardByCode, getCardById } from "../cards";
import {
  ForbiddenOperationError,
  ValidationError,
  DuplicateCodeError,
  NotFoundError,
} from "../errors";
import type { Tenant, CardType, FieldDefinition } from "../types";

// ─── Test fixtures ──────────────────────────────────────────────────────────

const TEST_PREFIX = "__test_integration_";
let tenantA: Tenant;
let tenantB: Tenant;
let cardTypeA: CardType;
let cardTypeB: CardType;
let fdText: FieldDefinition;
let fdRequired: FieldDefinition;
let fdNumber: FieldDefinition;

beforeAll(async () => {
  // Create two isolated tenants for testing.
  tenantA = await createTenant({ name: `${TEST_PREFIX}Tenant_A` });
  tenantB = await createTenant({ name: `${TEST_PREFIX}Tenant_B` });

  // Card type in tenant A with field definitions.
  const ctA = await createCardType(tenantA.id, {
    name: `${TEST_PREFIX}CardType_A`,
    description: "Test card type for tenant A",
    fieldDefinitions: [
      {
        name: "nombre",
        label: "Nombre",
        fieldType: "text",
        isRequired: true,
        position: 0,
      },
      {
        name: "edad",
        label: "Edad",
        fieldType: "number",
        isRequired: false,
        position: 1,
      },
    ],
  });
  cardTypeA = ctA;
  fdRequired = ctA.fieldDefinitions[0]; // nombre — required
  fdNumber = ctA.fieldDefinitions[1]; // edad — optional

  // Card type in tenant B with one text field.
  const ctB = await createCardType(tenantB.id, {
    name: `${TEST_PREFIX}CardType_B`,
    fieldDefinitions: [
      {
        name: "note",
        label: "Note",
        fieldType: "text",
        isRequired: false,
        position: 0,
      },
    ],
  });
  cardTypeB = ctB;
  fdText = ctB.fieldDefinitions[0];
});

afterAll(async () => {
  // Cascade-delete both test tenants and all associated data.
  await db
    .delete(tenants)
    .where(like(tenants.name, `${TEST_PREFIX}%`));
});

// ─── 1. Cannot change field_type when values exist ──────────────────────────

describe("Rule: field_type immutability with existing values", () => {
  it("allows changing field_type when no values exist", async () => {
    // Create a fresh field definition with no values.
    const fd = await addFieldDefinition(cardTypeA.id, {
      name: `${TEST_PREFIX}empty_field`,
      label: "Empty field",
      fieldType: "text",
    });

    // Should succeed — no values stored yet.
    const updated = await updateFieldDefinition(fd.id, {
      fieldType: "number",
    });
    expect(updated.fieldType).toBe("number");
  });

  it("rejects changing field_type when values exist", async () => {
    // Create a card with a value for fdRequired (text field).
    await createCard(cardTypeA.id, tenantA.id, `${TEST_PREFIX}IMMUT-001`, {
      [fdRequired.id]: "María García",
    });

    // Now try to change fdRequired's type — should fail.
    await expect(
      updateFieldDefinition(fdRequired.id, { fieldType: "number" }),
    ).rejects.toThrow(ForbiddenOperationError);

    await expect(
      updateFieldDefinition(fdRequired.id, { fieldType: "number" }),
    ).rejects.toThrow(/Cannot change field_type/);
  });

  it("allows updating other properties even when values exist", async () => {
    // Changing label (not fieldType) should always work.
    const updated = await updateFieldDefinition(fdRequired.id, {
      label: "Nombre completo",
    });
    expect(updated.label).toBe("Nombre completo");
  });
});

// ─── 2. Required fields validation ──────────────────────────────────────────

describe("Rule: required fields must have values", () => {
  it("rejects card creation when a required field is missing", async () => {
    // fdRequired (nombre) is required — omit it entirely.
    await expect(
      createCard(cardTypeA.id, tenantA.id, `${TEST_PREFIX}REQ-MISSING`, {}),
    ).rejects.toThrow(ValidationError);

    await expect(
      createCard(cardTypeA.id, tenantA.id, `${TEST_PREFIX}REQ-MISSING`, {}),
    ).rejects.toThrow(/Required field/);
  });

  it("rejects card creation when required field is null", async () => {
    await expect(
      createCard(cardTypeA.id, tenantA.id, `${TEST_PREFIX}REQ-NULL`, {
        [fdRequired.id]: null,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects card creation when required field is empty string", async () => {
    await expect(
      createCard(cardTypeA.id, tenantA.id, `${TEST_PREFIX}REQ-EMPTY`, {
        [fdRequired.id]: "",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("accepts card creation when required field has a value", async () => {
    const card = await createCard(
      cardTypeA.id,
      tenantA.id,
      `${TEST_PREFIX}REQ-OK`,
      { [fdRequired.id]: "Juan Pérez" },
    );
    expect(card.code).toBe(`${TEST_PREFIX}REQ-OK`);
    expect(card.fields.length).toBeGreaterThanOrEqual(1);
  });

  it("accepts optional fields being omitted", async () => {
    // fdNumber (edad) is optional — card should be created with only the
    // required field.
    const card = await createCard(
      cardTypeA.id,
      tenantA.id,
      `${TEST_PREFIX}OPT-SKIP`,
      { [fdRequired.id]: "Ana López" },
    );
    expect(card.code).toBe(`${TEST_PREFIX}OPT-SKIP`);
  });
});

// ─── 3. Tenant isolation ────────────────────────────────────────────────────

describe("Rule: tenant isolation", () => {
  it("cannot find tenant A's card using tenant B's ID", async () => {
    // Create card in tenant A.
    const card = await createCard(
      cardTypeA.id,
      tenantA.id,
      `${TEST_PREFIX}ISO-A`,
      { [fdRequired.id]: "Aislado" },
    );

    // Lookup from tenant B should fail.
    await expect(
      getCardByCode(`${TEST_PREFIX}ISO-A`, tenantB.id),
    ).rejects.toThrow(NotFoundError);

    // Lookup by UUID from tenant B should also fail.
    await expect(getCardById(card.id, tenantB.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("card type from tenant A is invisible to tenant B", async () => {
    await expect(
      getCardTypeById(cardTypeA.id, tenantB.id),
    ).rejects.toThrow(NotFoundError);
  });

  it("returns card when correct tenant is used", async () => {
    const card = await getCardByCode(`${TEST_PREFIX}ISO-A`, tenantA.id);
    expect(card.code).toBe(`${TEST_PREFIX}ISO-A`);
    expect(card.tenantId).toBe(tenantA.id);
  });
});

// ─── 4. Duplicate code within tenant ────────────────────────────────────────

describe("Rule: unique card code per tenant", () => {
  it("rejects duplicate code within the same tenant", async () => {
    await createCard(cardTypeA.id, tenantA.id, `${TEST_PREFIX}DUP-001`, {
      [fdRequired.id]: "Primero",
    });

    await expect(
      createCard(cardTypeA.id, tenantA.id, `${TEST_PREFIX}DUP-001`, {
        [fdRequired.id]: "Duplicado",
      }),
    ).rejects.toThrow(DuplicateCodeError);
  });

  it("allows same code in different tenants", async () => {
    const code = `${TEST_PREFIX}CROSS-001`;

    await createCard(cardTypeA.id, tenantA.id, code, {
      [fdRequired.id]: "Tenant A",
    });

    // Same code in tenant B — should succeed.
    const cardB = await createCard(cardTypeB.id, tenantB.id, code, {
      [fdText.id]: "Tenant B",
    });

    expect(cardB.code).toBe(code);
    expect(cardB.tenantId).toBe(tenantB.id);

    // Verify each tenant sees its own card.
    const fromA = await getCardByCode(code, tenantA.id);
    const fromB = await getCardByCode(code, tenantB.id);
    expect(fromA.tenantId).toBe(tenantA.id);
    expect(fromB.tenantId).toBe(tenantB.id);
    expect(fromA.id).not.toBe(fromB.id);
  });
});

// ─── 5. Type mismatch validation ────────────────────────────────────────────

describe("Rule: field value type must match definition", () => {
  it("rejects a number value for a text field", async () => {
    await expect(
      createCard(cardTypeA.id, tenantA.id, `${TEST_PREFIX}TYPE-BAD`, {
        [fdRequired.id]: 12345, // fdRequired is type "text"
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a string value for a number field", async () => {
    await expect(
      createCard(cardTypeA.id, tenantA.id, `${TEST_PREFIX}TYPE-BAD2`, {
        [fdRequired.id]: "Valid name",
        [fdNumber.id]: "not a number", // fdNumber is type "number"
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("accepts correct types", async () => {
    const card = await createCard(
      cardTypeA.id,
      tenantA.id,
      `${TEST_PREFIX}TYPE-OK`,
      {
        [fdRequired.id]: "Carlos Ruiz",
        [fdNumber.id]: 30,
      },
    );
    expect(card.fields).toHaveLength(2);
    const nombre = card.fields.find((f) => f.name === "nombre");
    const edad = card.fields.find((f) => f.name === "edad");
    expect(nombre?.value).toBe("Carlos Ruiz");
    expect(edad?.value).toBe(30);
  });
});
