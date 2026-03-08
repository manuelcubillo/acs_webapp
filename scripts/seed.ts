/**
 * Database Seed Script
 *
 * Populates the database with test data for development.
 * Run with: pnpm db:seed
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/lib/db/schema";

const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

async function seed() {
  console.log("Seeding database...\n");

  // ─── Tenants ────────────────────────────────────────────────────────────────

  const [tenant1, tenant2] = await db
    .insert(schema.tenants)
    .values([
      { name: "Urbanización Los Olivos" },
      { name: "Residencial El Pinar" },
    ])
    .returning();

  console.log(`✓ Tenants: ${tenant1.name}, ${tenant2.name}`);

  // ─── Card Types ─────────────────────────────────────────────────────────────

  const [ctResidente, ctVisitante, ctTrabajador] = await db
    .insert(schema.cardTypes)
    .values([
      {
        tenantId: tenant1.id,
        name: "Residente",
        description: "Carnet de residente de la urbanización",
      },
      {
        tenantId: tenant1.id,
        name: "Visitante",
        description: "Pase temporal para visitantes",
      },
      {
        tenantId: tenant2.id,
        name: "Trabajador",
        description: "Carnet de trabajador del residencial",
      },
    ])
    .returning();

  console.log(
    `✓ Card Types: ${ctResidente.name}, ${ctVisitante.name}, ${ctTrabajador.name}`,
  );

  // ─── Field Definitions ────────────────────────────────────────────────────

  // Residente fields
  const fdResidente = await db
    .insert(schema.fieldDefinitions)
    .values([
      {
        cardTypeId: ctResidente.id,
        name: "nombre_completo",
        label: "Nombre completo",
        fieldType: "text",
        isRequired: true,
        position: 0,
        validationRules: { minLength: 2, maxLength: 100 },
      },
      {
        cardTypeId: ctResidente.id,
        name: "direccion",
        label: "Dirección",
        fieldType: "text",
        isRequired: true,
        position: 1,
      },
      {
        cardTypeId: ctResidente.id,
        name: "telefono",
        label: "Teléfono",
        fieldType: "text",
        isRequired: false,
        position: 2,
        validationRules: { pattern: "^\\+?[0-9]{6,15}$" },
      },
      {
        cardTypeId: ctResidente.id,
        name: "foto",
        label: "Foto de perfil",
        fieldType: "photo",
        isRequired: false,
        position: 3,
      },
      {
        cardTypeId: ctResidente.id,
        name: "numero_vivienda",
        label: "Número de vivienda",
        fieldType: "number",
        isRequired: true,
        position: 4,
        validationRules: { min: 1, max: 999 },
      },
    ])
    .returning();

  // Visitante fields
  const fdVisitante = await db
    .insert(schema.fieldDefinitions)
    .values([
      {
        cardTypeId: ctVisitante.id,
        name: "nombre",
        label: "Nombre del visitante",
        fieldType: "text",
        isRequired: true,
        position: 0,
      },
      {
        cardTypeId: ctVisitante.id,
        name: "dni",
        label: "DNI / Documento",
        fieldType: "text",
        isRequired: true,
        position: 1,
      },
      {
        cardTypeId: ctVisitante.id,
        name: "visita_a",
        label: "Visita a (vivienda)",
        fieldType: "number",
        isRequired: true,
        position: 2,
      },
      {
        cardTypeId: ctVisitante.id,
        name: "motivo",
        label: "Motivo de la visita",
        fieldType: "select",
        isRequired: true,
        position: 3,
        validationRules: { options: ["Personal", "Paquetería", "Mantenimiento", "Otro"] },
      },
    ])
    .returning();

  // Trabajador fields
  const fdTrabajador = await db
    .insert(schema.fieldDefinitions)
    .values([
      {
        cardTypeId: ctTrabajador.id,
        name: "nombre_completo",
        label: "Nombre completo",
        fieldType: "text",
        isRequired: true,
        position: 0,
      },
      {
        cardTypeId: ctTrabajador.id,
        name: "puesto",
        label: "Puesto",
        fieldType: "select",
        isRequired: true,
        position: 1,
        validationRules: { options: ["Jardinería", "Seguridad", "Limpieza", "Mantenimiento", "Administración"] },
      },
      {
        cardTypeId: ctTrabajador.id,
        name: "fecha_alta",
        label: "Fecha de alta",
        fieldType: "date",
        isRequired: true,
        position: 2,
      },
      {
        cardTypeId: ctTrabajador.id,
        name: "activo",
        label: "En activo",
        fieldType: "boolean",
        isRequired: true,
        position: 3,
        defaultValue: "true",
      },
    ])
    .returning();

  console.log(
    `✓ Field Definitions: ${fdResidente.length + fdVisitante.length + fdTrabajador.length} fields`,
  );

  // ─── Action Definitions ───────────────────────────────────────────────────

  const actionDefs = await db
    .insert(schema.actionDefinitions)
    .values([
      // Visitante: increment/decrement on "visita_a" (number field)
      {
        cardTypeId: ctVisitante.id,
        name: "Registrar entrada",
        actionType: "increment" as const,
        targetFieldDefinitionId: fdVisitante[2].id,  // visita_a (number)
        config: { amount: 1 },
        position: 0,
      },
      {
        cardTypeId: ctVisitante.id,
        name: "Registrar salida",
        actionType: "decrement" as const,
        targetFieldDefinitionId: fdVisitante[2].id,  // visita_a (number)
        config: { amount: 1 },
        position: 1,
      },
      // Trabajador: check/uncheck on "activo" (boolean field)
      {
        cardTypeId: ctTrabajador.id,
        name: "Marcar activo",
        actionType: "check" as const,
        targetFieldDefinitionId: fdTrabajador[3].id,  // activo (boolean)
        config: null,
        position: 0,
      },
      {
        cardTypeId: ctTrabajador.id,
        name: "Marcar inactivo",
        actionType: "uncheck" as const,
        targetFieldDefinitionId: fdTrabajador[3].id,  // activo (boolean)
        config: null,
        position: 1,
      },
    ])
    .returning();

  console.log(`✓ Action Definitions: ${actionDefs.length}`);

  // ─── Cards ──────────────────────────────────────────────────────────────────

  const cardsData = await db
    .insert(schema.cards)
    .values([
      // Residentes (tenant 1)
      { code: "RES-001", cardTypeId: ctResidente.id, tenantId: tenant1.id },
      { code: "RES-002", cardTypeId: ctResidente.id, tenantId: tenant1.id },
      { code: "RES-003", cardTypeId: ctResidente.id, tenantId: tenant1.id },
      // Visitantes (tenant 1)
      { code: "VIS-001", cardTypeId: ctVisitante.id, tenantId: tenant1.id },
      { code: "VIS-002", cardTypeId: ctVisitante.id, tenantId: tenant1.id },
      // Trabajadores (tenant 2)
      { code: "TRB-001", cardTypeId: ctTrabajador.id, tenantId: tenant2.id },
      { code: "TRB-002", cardTypeId: ctTrabajador.id, tenantId: tenant2.id },
      // Same code in different tenant (proves cross-tenant uniqueness works)
      { code: "RES-001", cardTypeId: ctTrabajador.id, tenantId: tenant2.id },
    ])
    .returning();

  console.log(`✓ Cards: ${cardsData.length}`);

  // ─── Field Values ─────────────────────────────────────────────────────────

  const [res1, res2, res3, vis1, vis2, trb1, trb2] = cardsData;

  const fieldValuesData = await db
    .insert(schema.fieldValues)
    .values([
      // Residente 1
      { cardId: res1.id, fieldDefinitionId: fdResidente[0].id, valueText: "María García López" },
      { cardId: res1.id, fieldDefinitionId: fdResidente[1].id, valueText: "Calle del Olivo, 12" },
      { cardId: res1.id, fieldDefinitionId: fdResidente[2].id, valueText: "+34612345678" },
      { cardId: res1.id, fieldDefinitionId: fdResidente[4].id, valueNumber: 12 },
      // Residente 2
      { cardId: res2.id, fieldDefinitionId: fdResidente[0].id, valueText: "Carlos Fernández Ruiz" },
      { cardId: res2.id, fieldDefinitionId: fdResidente[1].id, valueText: "Calle del Olivo, 5" },
      { cardId: res2.id, fieldDefinitionId: fdResidente[2].id, valueText: "+34698765432" },
      { cardId: res2.id, fieldDefinitionId: fdResidente[4].id, valueNumber: 5 },
      // Residente 3
      { cardId: res3.id, fieldDefinitionId: fdResidente[0].id, valueText: "Ana Martínez Sánchez" },
      { cardId: res3.id, fieldDefinitionId: fdResidente[1].id, valueText: "Avenida del Pino, 22" },
      { cardId: res3.id, fieldDefinitionId: fdResidente[4].id, valueNumber: 22 },
      // Visitante 1
      { cardId: vis1.id, fieldDefinitionId: fdVisitante[0].id, valueText: "Pedro Jiménez" },
      { cardId: vis1.id, fieldDefinitionId: fdVisitante[1].id, valueText: "12345678A" },
      { cardId: vis1.id, fieldDefinitionId: fdVisitante[2].id, valueNumber: 12 },
      { cardId: vis1.id, fieldDefinitionId: fdVisitante[3].id, valueText: "Personal" },
      // Visitante 2
      { cardId: vis2.id, fieldDefinitionId: fdVisitante[0].id, valueText: "Laura Torres" },
      { cardId: vis2.id, fieldDefinitionId: fdVisitante[1].id, valueText: "87654321B" },
      { cardId: vis2.id, fieldDefinitionId: fdVisitante[2].id, valueNumber: 5 },
      { cardId: vis2.id, fieldDefinitionId: fdVisitante[3].id, valueText: "Paquetería" },
      // Trabajador 1
      { cardId: trb1.id, fieldDefinitionId: fdTrabajador[0].id, valueText: "José Ramírez" },
      { cardId: trb1.id, fieldDefinitionId: fdTrabajador[1].id, valueText: "Seguridad" },
      { cardId: trb1.id, fieldDefinitionId: fdTrabajador[2].id, valueDate: new Date("2024-03-15") },
      { cardId: trb1.id, fieldDefinitionId: fdTrabajador[3].id, valueBoolean: true },
      // Trabajador 2
      { cardId: trb2.id, fieldDefinitionId: fdTrabajador[0].id, valueText: "Marta Díaz" },
      { cardId: trb2.id, fieldDefinitionId: fdTrabajador[1].id, valueText: "Jardinería" },
      { cardId: trb2.id, fieldDefinitionId: fdTrabajador[2].id, valueDate: new Date("2023-11-01") },
      { cardId: trb2.id, fieldDefinitionId: fdTrabajador[3].id, valueBoolean: true },
    ])
    .returning();

  console.log(`✓ Field Values: ${fieldValuesData.length}`);

  // ─── Action Logs ──────────────────────────────────────────────────────────

  const actionLogsData = await db
    .insert(schema.actionLogs)
    .values([
      {
        tenantId: tenant1.id,
        cardId: vis1.id,
        actionDefinitionId: actionDefs[0].id,
        logType: "action" as const,
        executedAt: new Date("2026-03-05T09:30:00"),
        metadata: { gate: "Entrada principal" },
      },
      {
        tenantId: tenant1.id,
        cardId: vis1.id,
        actionDefinitionId: actionDefs[1].id,
        logType: "action" as const,
        executedAt: new Date("2026-03-05T11:45:00"),
        metadata: { gate: "Entrada principal" },
      },
      {
        tenantId: tenant1.id,
        cardId: vis2.id,
        actionDefinitionId: actionDefs[0].id,
        logType: "action" as const,
        executedAt: new Date("2026-03-05T14:00:00"),
        metadata: { gate: "Entrada lateral" },
      },
    ])
    .returning();

  console.log(`✓ Action Logs: ${actionLogsData.length}`);

  console.log("\n✅ Seed completed successfully!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
