/**
 * /cards — Carnets List
 *
 * Shows all cards for the selected card type with search + scan support.
 * Accessible to: operator | admin | master
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireOperator, getCurrentUserProfile, AuthenticationError, AuthorizationError } from "@/lib/api";
import {
  listCardTypes,
  getFieldDefinitionsByCardType,
  getTenantById,
  searchCards,
  getSummaryFieldsForCardTypes,
} from "@/lib/dal";
import { stripCardListPhotoKeys } from "@/lib/dal/photo-urls";
import {
  parseCardListParams,
  toPagination,
  type CardListRawParams,
} from "@/lib/cards/list-params";
import { excludeSystemFields } from "@/lib/fields/system";
import DashboardShell from "@/components/layout/DashboardShell";
import CardList from "@/components/cards/CardList";
import FlashMessage from "@/components/shared/FlashMessage";
import { Button } from "@/components/ui/button";
import type {
  FieldDefinition,
  PaginatedResult,
  CardWithFields,
} from "@/lib/dal/types";

export const dynamic = "force-dynamic";

const TEXT = {
  TITLE:          "Carnets",
  ITEM_SINGLE:    "carnet",
  ITEM_PLURAL:    "carnets",
  BTN_NEW:        "Nuevo carnet",
  NO_CARD_TYPES:  "No hay tipos de tarjeta configurados.",
  BTN_CREATE_TYPE: "Crear tipo de tarjeta",
} as const;

/** Flash codes surfaced after a lifecycle redirect (see FlashMessage). */
const FLASH_MESSAGES: Record<string, string> = {
  "card-archived": "Carnet archivado. Se ha movido a la papelera.",
};

interface CardsPageProps {
  /**
   * The whole list view — card types, search, status, field filters, view mode
   * and page — is read from here, so the first render is already the requested
   * result set. See `src/lib/cards/list-params.ts`. `flash` is separate: it is
   * a one-shot message, not view state, and `FlashMessage` strips it.
   */
  searchParams: Promise<CardListRawParams & { flash?: string }>;
}

export default async function CardsPage({ searchParams }: CardsPageProps) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireOperator();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/login");
    throw e;
  }

  const { tenantId, role } = context;
  const isAdmin = role === "admin" || role === "master";

  // ── Params ────────────────────────────────────────────────────────────────
  const rawParams = await searchParams;
  const viewState = parseCardListParams(rawParams);
  const flashMessage = rawParams.flash
    ? FLASH_MESSAGES[rawParams.flash]
    : undefined;

  // ── Data ──────────────────────────────────────────────────────────────────
  const [cardTypes, tenant, userProfile] = await Promise.all([
    listCardTypes(tenantId).catch(() => []),
    getTenantById(tenantId).catch(() => null),
    getCurrentUserProfile(),
  ]);

  const scanMode = tenant?.scanMode ?? "both";

  // Explicit URL selection (deep link, or a restored view) vs. the default
  // "All". Ids that no longer belong to this tenant are dropped rather than
  // searched — the type filter is a tenant-scoped whitelist, not free input.
  const selectedTypeIds = viewState.cardTypeIds.filter((id) =>
    cardTypes.some((ct) => ct.id === id),
  );
  // Reference card type for the "new card" link — falls back to the first type.
  const activeCardType =
    cardTypes.find((ct) => ct.id === selectedTypeIds[0]) ?? cardTypes[0] ?? null;
  // Column-visibility storage key: distinct from any single type's id so the
  // merged "all types" field set never collides with a single-type view.
  const columnsStorageKey =
    selectedTypeIds.length === 1 ? selectedTypeIds[0] : "all";

  let fieldDefs: FieldDefinition[] = [];
  let initialData: PaginatedResult<CardWithFields> = { data: [], total: 0, limit: 50, offset: 0 };
  let summaryFieldIds: string[] = [];

  if (activeCardType) {
    try {
      const searchTypeIds =
        selectedTypeIds.length > 0
          ? selectedTypeIds
          : cardTypes.map((ct) => ct.id);
      // Field defs are fetched per searched type and merged — a card belongs to
      // exactly one type, so scoping the schema to a single "reference" type
      // (e.g. only the first one) would leave every other type's cards with no
      // matching field_definition_id and render as empty dashes.
      const [fieldDefsByType, summaryFieldsByType, searchResult] = await Promise.all([
        Promise.all(searchTypeIds.map((id) => getFieldDefinitionsByCardType(id))),
        getSummaryFieldsForCardTypes(searchTypeIds, tenantId).catch(() => new Map()),
        searchCards(
          searchTypeIds,
          tenantId,
          {
            codeContains: viewState.search || undefined,
            status: viewState.status,
            filters:
              viewState.fieldFilters.length > 0
                ? viewState.fieldFilters
                : undefined,
          },
          toPagination(viewState),
        ),
      ]);
      // Drives the table/profile columns and the column picker — a
      // configuration surface, so system fields are dropped here rather than
      // in the DAL read the scan pipeline also uses.
      fieldDefs = excludeSystemFields(fieldDefsByType.flat());
      summaryFieldIds = [...summaryFieldsByType.values()]
        .flat()
        .map((sf) => sf.fieldDefinitionId);
      // The list renders photos through the stable route, not a signed URL, so
      // the keys are redacted rather than signed — nothing here would consume a
      // signature, and CardList's client-side refetches carry none either.
      initialData = {
        ...searchResult,
        data: stripCardListPhotoKeys(searchResult.data),
      };
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
              {selectedTypeIds.length === 1 && <> · {activeCardType.name}</>}
            </p>
          )}
        </div>

        {/* The scan shortcut lives in the list toolbar (see CardSearch). */}
        <div className="flex gap-2">
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
          initialCardTypeId={columnsStorageKey}
          initialState={{ ...viewState, cardTypeIds: selectedTypeIds }}
          scanMode={scanMode}
          summaryFieldIds={summaryFieldIds}
        />
      )}
    </DashboardShell>
  );
}
