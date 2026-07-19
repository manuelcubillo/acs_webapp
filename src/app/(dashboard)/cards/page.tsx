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
import FlashMessage from "@/components/shared/FlashMessage";
import { Button } from "@/components/ui/button";
import type {
  FieldDefinition,
  PaginatedResult,
  CardWithFields,
  CardSearchStatus,
} from "@/lib/dal/types";

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

/** Flash codes surfaced after a lifecycle redirect (see FlashMessage). */
const FLASH_MESSAGES: Record<string, string> = {
  "card-archived": "Carnet archivado. Se ha movido a la papelera.",
};

/** Coerce a raw query value into a valid card search status. */
function parseStatus(raw?: string): CardSearchStatus {
  return raw === "active" || raw === "inactive" ? raw : "all";
}

interface CardsPageProps {
  searchParams: Promise<{
    cardTypeId?: string;
    q?: string;
    status?: string;
    flash?: string;
  }>;
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
  const { cardTypeId: rawCardTypeId, q = "", status: rawStatus, flash } =
    await searchParams;
  const statusFilter = parseStatus(rawStatus);
  const flashMessage = flash ? FLASH_MESSAGES[flash] : undefined;

  // ── Data ──────────────────────────────────────────────────────────────────
  const [cardTypes, tenant, userProfile] = await Promise.all([
    listCardTypes(tenantId).catch(() => []),
    getTenantById(tenantId).catch(() => null),
    getCurrentUserProfile(),
  ]);

  const scanMode = tenant?.scanMode ?? "both";

  // Explicit URL selection (deep link) vs. the default "All" view.
  const requestedCardType = cardTypes.find((ct) => ct.id === rawCardTypeId) ?? null;
  // Reference card type for schema/columns/"new card" link — falls back to the first type.
  const activeCardType = requestedCardType ?? cardTypes[0] ?? null;
  const initialSelectedTypeIds: string[] = requestedCardType ? [requestedCardType.id] : [];

  let fieldDefs: FieldDefinition[] = [];
  let initialData: PaginatedResult<CardWithFields> = { data: [], total: 0, limit: 50, offset: 0 };
  let summaryFieldIds: string[] = [];

  if (activeCardType) {
    try {
      const searchTypeIds = requestedCardType
        ? [requestedCardType.id]
        : cardTypes.map((ct) => ct.id);
      const [schema, summaryFields, searchResult] = await Promise.all([
        getCardTypeWithFullSchema(activeCardType.id, tenantId),
        getSummaryFieldsForCardType(activeCardType.id).catch(() => []),
        searchCards(
          searchTypeIds,
          tenantId,
          { codeContains: q || undefined, status: statusFilter },
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
      {/* One-shot confirmation after a lifecycle redirect. */}
      <FlashMessage message={flashMessage} />

      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-foreground">
            {TEXT.TITLE}
          </h1>
          {activeCardType && (
            <p className="mt-1 text-sm text-muted-foreground">
              {initialData.total}{" "}
              {initialData.total !== 1 ? TEXT.ITEM_PLURAL : TEXT.ITEM_SINGLE}
              {requestedCardType && <> · {requestedCardType.name}</>}
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
          initialSelectedTypeIds={initialSelectedTypeIds}
          scanMode={scanMode}
          initialSearch={q}
          initialStatus={statusFilter}
          summaryFieldIds={summaryFieldIds}
        />
      )}
    </DashboardShell>
  );
}
