/**
 * /cards — Carnets List
 *
 * Shows all cards for the selected card type with search + scan support.
 * Accessible to: operator | admin | master
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, QrCode } from "lucide-react";
import { requireOperator, AuthenticationError, AuthorizationError } from "@/lib/api";
import {
  listCardTypes,
  getCardTypeWithFullSchema,
  getTenantById,
  searchCards,
} from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import CardList from "@/components/cards/CardList";
import type { FieldDefinitionShape } from "@/lib/validation/types";
import type { ValidationRules } from "@/lib/validation/types";
import type { FieldDefinition } from "@/lib/dal/types";

export const dynamic = "force-dynamic";

interface CardsPageProps {
  searchParams: Promise<{ cardTypeId?: string; q?: string }>;
}

export default async function CardsPage({ searchParams }: CardsPageProps) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireOperator();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/login");
    redirect("/login");
  }

  const { tenantId, role } = context;
  const isAdmin = role === "admin" || role === "master";

  // ── Params ────────────────────────────────────────────────────────────────
  const { cardTypeId: rawCardTypeId, q = "" } = await searchParams;

  // ── Data ──────────────────────────────────────────────────────────────────
  const [cardTypes, tenant] = await Promise.all([
    listCardTypes(tenantId).catch(() => []),
    getTenantById(tenantId).catch(() => null),
  ]);

  const scanMode = tenant?.scanMode ?? "both";

  // Pick the active card type (from URL param or default to first).
  const activeCardType =
    cardTypes.find((ct) => ct.id === rawCardTypeId) ?? cardTypes[0] ?? null;

  let fieldDefs: FieldDefinition[] = [];
  let cards: Awaited<ReturnType<typeof searchCards>>["data"] = [];
  let totalCards = 0;

  if (activeCardType) {
    try {
      const schema = await getCardTypeWithFullSchema(
        activeCardType.id,
        tenantId,
      );
      fieldDefs = schema.fieldDefinitions.filter((f) => f.isActive);

      const result = await searchCards(
        activeCardType.id,
        tenantId,
        { codeContains: q || undefined },
        { limit: 100 },
      );
      cards = result.data;
      totalCards = result.total;
    } catch {
      // Non-fatal — show empty state.
    }
  }

  // Cast field definitions to the shape expected by the validation engine.
  const fieldShapes: FieldDefinitionShape[] = fieldDefs.map((f) => ({
    id: f.id,
    name: f.name,
    label: f.label,
    fieldType: f.fieldType,
    isRequired: f.isRequired,
    validationRules: f.validationRules as ValidationRules | null,
  }));
  void fieldShapes; // currently passed via fieldDefs to CardList

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardShell title="Carnets" role={role}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              fontFamily: "var(--font-heading)",
              color: "var(--color-dark)",
              margin: 0,
            }}
          >
            Carnets
          </h1>
          {activeCardType && (
            <p
              style={{
                fontSize: 13.5,
                color: "var(--color-secondary)",
                marginTop: 4,
              }}
            >
              {totalCards} carnet{totalCards !== 1 ? "s" : ""} ·{" "}
              {activeCardType.name}
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {/* Scan shortcut */}
          <Link
            href="/cards/scan"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 16px",
              borderRadius: 8,
              border: "1.5px solid var(--color-border)",
              background: "#fff",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-dark)",
            }}
          >
            <QrCode size={15} strokeWidth={1.8} />
            Escanear
          </Link>

          {isAdmin && activeCardType && (
            <Link
              href={`/cards/new?cardTypeId=${activeCardType.id}`}
              className="btn btn-primary"
            >
              <Plus size={16} strokeWidth={2} />
              Nuevo carnet
            </Link>
          )}
        </div>
      </div>

      {/* Card type selector */}
      {cardTypes.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          {cardTypes.map((ct) => {
            const active = ct.id === activeCardType?.id;
            return (
              <Link
                key={ct.id}
                href={`/cards?cardTypeId=${ct.id}`}
                style={{
                  padding: "6px 14px",
                  borderRadius: 20,
                  border: `1.5px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`,
                  background: active ? "#e0e7ff" : "#fff",
                  color: active ? "var(--color-primary)" : "var(--color-dark)",
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {ct.name}
              </Link>
            );
          })}
        </div>
      )}

      {/* No card types */}
      {cardTypes.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 24px",
            color: "var(--color-muted)",
          }}
        >
          <p style={{ marginBottom: 12 }}>
            No hay tipos de tarjeta configurados.
          </p>
          {role === "master" && (
            <Link href="/card-types/new" className="btn btn-primary">
              Crear tipo de tarjeta
            </Link>
          )}
        </div>
      )}

      {/* Card list */}
      {activeCardType && (
        <CardList
          cards={cards}
          fields={fieldDefs}
          cardTypeId={activeCardType.id}
          scanMode={scanMode}
          initialSearch={q}
        />
      )}
    </DashboardShell>
  );
}
