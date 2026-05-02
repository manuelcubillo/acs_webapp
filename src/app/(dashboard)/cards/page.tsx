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
  getSummaryFieldsForCardType,
} from "@/lib/dal";
import { signCardListPhotos } from "@/lib/dal/photo-urls";
import DashboardShell from "@/components/layout/DashboardShell";
import CardList from "@/components/cards/CardList";
import type { FieldDefinition, PaginatedResult, CardWithFields } from "@/lib/dal/types";

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
  let initialData: PaginatedResult<CardWithFields> = { data: [], total: 0, limit: 50, offset: 0 };
  let summaryFieldIds: string[] = [];

  if (activeCardType) {
    try {
      const [schema, summaryFields, searchResult] = await Promise.all([
        getCardTypeWithFullSchema(activeCardType.id, tenantId),
        getSummaryFieldsForCardType(activeCardType.id).catch(() => []),
        searchCards(
          [activeCardType.id],
          tenantId,
          { codeContains: q || undefined },
          { limit: 50 },
        ),
      ]);
      fieldDefs = schema.fieldDefinitions.filter((f) => f.isActive);
      summaryFieldIds = summaryFields.map((sf) => sf.fieldDefinitionId);
      // Sign every photo key in the page batch so client renderers receive URLs.
      const signedCards = await signCardListPhotos(searchResult.data);
      initialData = { ...searchResult, data: signedCards };
    } catch {
      // Non-fatal — show empty state.
    }
  }

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
              {initialData.total} carnet{initialData.total !== 1 ? "s" : ""} ·{" "}
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

      {/* Card list — card type multi-select is managed inside CardList */}
      {activeCardType && (
        <CardList
          initialData={initialData}
          fields={fieldDefs}
          cardTypes={cardTypes}
          initialCardTypeId={activeCardType.id}
          scanMode={scanMode}
          initialSearch={q}
          summaryFieldIds={summaryFieldIds}
        />
      )}
    </DashboardShell>
  );
}
