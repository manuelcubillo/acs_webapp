/**
 * /cards — Carnets List
 *
 * Shows all cards for the selected card type with search + scan support.
 * Accessible to: operator | admin | master
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, QrCode } from "lucide-react";
import { requireOperator, getCurrentUserProfile, AuthenticationError, AuthorizationError } from "@/lib/api";
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
import { Button } from "@/components/ui/button";
import type { FieldDefinition, PaginatedResult, CardWithFields } from "@/lib/dal/types";

export const dynamic = "force-dynamic";

const TEXT = {
  TITLE:          "Carnets",
  ITEM_SINGLE:    "carnet",
  ITEM_PLURAL:    "carnets",
  BTN_SCAN:       "Escanear",
  BTN_NEW:        "Nuevo carnet",
  NO_CARD_TYPES:  "No hay tipos de tarjeta configurados.",
  BTN_CREATE_TYPE: "Crear tipo de tarjeta",
} as const;

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
  const [cardTypes, tenant, userProfile] = await Promise.all([
    listCardTypes(tenantId).catch(() => []),
    getTenantById(tenantId).catch(() => null),
    getCurrentUserProfile(),
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
    <DashboardShell
      title={TEXT.TITLE}
      role={role}
      userName={userProfile.name ?? undefined}
      userAvatarUrl={userProfile.avatarUrl}
    >
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-foreground">
            {TEXT.TITLE}
          </h1>
          {activeCardType && (
            <p className="mt-1 text-sm text-muted-foreground">
              {initialData.total}{" "}
              {initialData.total !== 1 ? TEXT.ITEM_PLURAL : TEXT.ITEM_SINGLE} ·{" "}
              {activeCardType.name}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          {/* Scan shortcut */}
          <Button asChild variant="outline" size="sm">
            <Link href="/cards/scan">
              <QrCode className="size-3.5" strokeWidth={1.8} />
              {TEXT.BTN_SCAN}
            </Link>
          </Button>

          {isAdmin && activeCardType && (
            <Button asChild size="sm">
              <Link
                href={
                  cardTypes.length > 1
                    ? "/cards/new"
                    : `/cards/new?cardTypeId=${activeCardType.id}`
                }
              >
                <Plus className="size-4" strokeWidth={2} />
                {TEXT.BTN_NEW}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* No card types */}
      {cardTypes.length === 0 && (
        <div className="px-6 py-16 text-center text-muted-foreground">
          <p className="mb-3">{TEXT.NO_CARD_TYPES}</p>
          {role === "master" && (
            <Button asChild>
              <Link href="/card-types/new">{TEXT.BTN_CREATE_TYPE}</Link>
            </Button>
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
