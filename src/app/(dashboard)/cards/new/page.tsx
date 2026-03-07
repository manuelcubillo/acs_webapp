/**
 * /cards/new — Create card
 *
 * Requires ?cardTypeId=uuid in the URL.
 * If missing, shows a card type picker instead.
 * Accessible to: admin | master
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin, AuthenticationError, AuthorizationError } from "@/lib/api";
import {
  listCardTypes,
  getCardTypeWithFullSchema,
} from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import CardNewClient from "./CardNewClient";
import type { FieldDefinitionShape } from "@/lib/validation/types";
import type { ValidationRules } from "@/lib/validation/types";

export const dynamic = "force-dynamic";

interface NewCardPageProps {
  searchParams: Promise<{ cardTypeId?: string }>;
}

export default async function NewCardPage({ searchParams }: NewCardPageProps) {
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
  const { cardTypeId } = await searchParams;

  // ── No card type selected → show picker ──────────────────────────────────
  if (!cardTypeId) {
    const cardTypes = await listCardTypes(tenantId).catch(() => []);
    return (
      <DashboardShell title="Nuevo carnet" role={role}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              fontFamily: "var(--font-heading)",
              color: "var(--color-dark)",
              marginBottom: 6,
            }}
          >
            Nuevo carnet
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--color-muted)",
              marginBottom: 24,
            }}
          >
            Selecciona el tipo de tarjeta:
          </p>

          {cardTypes.length === 0 ? (
            <div style={{ color: "var(--color-muted)", fontSize: 14 }}>
              No hay tipos de tarjeta. Crea uno primero en{" "}
              <Link
                href="/card-types/new"
                style={{ color: "var(--color-primary)" }}
              >
                Tipos de Tarjeta
              </Link>
              .
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {cardTypes.map((ct) => (
                <Link
                  key={ct.id}
                  href={`/cards/new?cardTypeId=${ct.id}`}
                  style={{
                    display: "block",
                    padding: "14px 18px",
                    borderRadius: 10,
                    border: "1.5px solid var(--color-border)",
                    background: "#fff",
                    textDecoration: "none",
                    color: "var(--color-dark)",
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  {ct.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </DashboardShell>
    );
  }

  // ── Card type selected → show form ────────────────────────────────────────
  let schema;
  try {
    schema = await getCardTypeWithFullSchema(cardTypeId, tenantId);
  } catch {
    redirect("/cards/new");
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

  return (
    <DashboardShell title="Nuevo carnet" role={role}>
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
          Nuevo carnet
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-muted)",
            marginBottom: 24,
          }}
        >
          Tipo: <strong>{schema.name}</strong>
        </p>

        <CardNewClient
          cardTypeId={cardTypeId}
          fields={fields}
          tenantId={tenantId}
        />
      </div>
    </DashboardShell>
  );
}
