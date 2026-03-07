/**
 * /cards/[code]/edit — Edit card field values
 *
 * The card code itself cannot be changed here.
 * Accessible to: admin | master
 */

import { redirect } from "next/navigation";
import { requireAdmin, AuthenticationError, AuthorizationError } from "@/lib/api";
import {
  getCardByCode,
  getCardTypeWithFullSchema,
} from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import CardEditClient from "./CardEditClient";
import type { FieldDefinitionShape } from "@/lib/validation/types";
import type { ValidationRules } from "@/lib/validation/types";

export const dynamic = "force-dynamic";

interface EditCardPageProps {
  params: Promise<{ code: string }>;
}

export default async function EditCardPage({ params }: EditCardPageProps) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireAdmin();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/cards");
    redirect("/login");
  }

  const { tenantId, role } = context;
  const { code } = await params;
  const decodedCode = decodeURIComponent(code);

  // ── Data ──────────────────────────────────────────────────────────────────
  let card;
  try {
    card = await getCardByCode(decodedCode, tenantId);
  } catch {
    redirect("/cards");
  }

  let schema;
  try {
    schema = await getCardTypeWithFullSchema(card.cardTypeId, tenantId);
  } catch {
    redirect("/cards");
  }

  const fields: FieldDefinitionShape[] = schema.fieldDefinitions
    .filter((f) => f.isActive)
    .map((f) => ({
      id: f.id,
      name: f.name,
      label: f.label,
      fieldType: f.fieldType,
      isRequired: f.isRequired,
      validationRules: f.validationRules as ValidationRules | null,
    }));

  // Build initial values map from existing field values.
  const initialValues: Record<string, unknown> = {};
  for (const fv of card.fields) {
    initialValues[fv.fieldDefinitionId] = fv.value;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardShell title="Editar carnet" role={role}>
      <div
        style={{
          maxWidth: 600,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 14,
          border: "1px solid var(--color-border)",
          padding: 28,
        }}
      >
        <h1
          style={{
            fontSize: 20,
            fontWeight: 800,
            fontFamily: "var(--font-heading)",
            color: "var(--color-dark)",
            margin: "0 0 4px",
          }}
        >
          Editar carnet
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-muted)",
            marginBottom: 24,
          }}
        >
          Código:{" "}
          <span style={{ fontFamily: "monospace", fontWeight: 700 }}>
            {decodedCode}
          </span>
        </p>

        <CardEditClient
          cardCode={decodedCode}
          fields={fields}
          initialValues={initialValues}
          tenantId={tenantId}
        />
      </div>
    </DashboardShell>
  );
}
