/**
 * Card list view state ↔ URL query string.
 *
 * `/cards` keeps its card-type selection, code search, status filter, field
 * filters, view mode and page number in the URL rather than in React state
 * alone. Three things depend on that:
 *
 *   1. The page server-renders the *requested* result set, so arriving with
 *      filters costs one query, not one unfiltered query plus a client refetch.
 *   2. A filtered list is shareable and survives a reload.
 *   3. Leaving for a card detail (or its edit page) and coming back restores
 *      the exact view — the row carries this query string along and the back
 *      link rebuilds it. See `return-origin.ts`.
 *
 * Same design as `src/lib/history/filter-params.ts`, sharing its readers; that
 * module's ADR (`2026-08-02-history-url-state-and-return.md`) has the reasoning.
 *
 * Deliberately dependency-free: imported by the server page AND by client
 * components, so it must not pull in anything `server-only`.
 */

import {
  parseFieldFilters,
  parsePage,
  parseUuidList,
  readParam,
  type RawParams,
} from "@/lib/navigation/query-codec";
import type { CardSearchStatus, FieldFilter } from "@/lib/dal/types";

// ─── Query keys ───────────────────────────────────────────────────────────────

export const CARDS_PARAM = {
  CARD_TYPES:    "ct",
  SEARCH:        "q",
  STATUS:        "status",
  FIELD_FILTERS: "ff",
  VIEW:          "view",
  PAGE:          "page",
} as const;

/**
 * Pre-existing single-type deep link (`/cards?cardTypeId=…`), still honoured
 * when `ct` is absent so older links and bookmarks keep working. `ct` is what
 * gets written, because the type selector is a multi-select and one key that
 * cannot express two types would lose the selection on every reload.
 */
export const LEGACY_CARD_TYPE_PARAM = "cardTypeId";

/** Everything a card list query may contain. Anything else is dropped. */
export const CARDS_PARAM_KEYS: readonly string[] = [
  ...Object.values(CARDS_PARAM),
  LEGACY_CARD_TYPE_PARAM,
];

// ─── View state ───────────────────────────────────────────────────────────────

/** The two list renderings. `CardViewToggle` re-exports this as `ViewMode`. */
export type CardListView = "table" | "profile";

/**
 * Rows per page, by view. The gallery's cards are much taller than a table row,
 * so it pages sooner. Defined here because the server page and `CardList` must
 * agree — the offset the server renders has to be the one the client refetches.
 */
export const CARD_LIST_PAGE_SIZE: Record<CardListView, number> = {
  table:   50,
  profile: 25,
};

/** The complete restorable state of the card list. */
export interface CardListViewState {
  /** Selected card type ids. Empty means "Todos" — no type restriction. */
  cardTypeIds: string[];
  /** Partial match on card code. */
  search: string;
  status: CardSearchStatus;
  fieldFilters: FieldFilter[];
  view: CardListView;
  /** 1-based page number. */
  page: number;
}

/** The untouched list: every default, so `buildCardListQuery` emits nothing. */
export const DEFAULT_CARD_LIST_STATE: CardListViewState = {
  cardTypeIds:  [],
  search:       "",
  status:       "all",
  fieldFilters: [],
  view:         "table",
  page:         1,
};

/**
 * Sanity cap on the searched code. `codeContains` is uncapped at the Server
 * Action boundary, but a card code is `max(100)`, so nothing longer can match.
 */
const MAX_SEARCH_LENGTH = 100;

// ─── Reading ──────────────────────────────────────────────────────────────────

export type CardListRawParams = RawParams;

function parseStatus(value: string | undefined): CardSearchStatus {
  return value === "active" || value === "inactive" ? value : "all";
}

function parseView(value: string | undefined): CardListView {
  return value === "profile" ? "profile" : "table";
}

/**
 * Read the card list view state out of a query string.
 * Never throws — an unreadable value simply does not filter.
 */
export function parseCardListParams(raw: CardListRawParams): CardListViewState {
  const cardTypeIds = parseUuidList(readParam(raw, CARDS_PARAM.CARD_TYPES));

  return {
    cardTypeIds:
      cardTypeIds.length > 0
        ? cardTypeIds
        : parseUuidList(readParam(raw, LEGACY_CARD_TYPE_PARAM)),
    search: (readParam(raw, CARDS_PARAM.SEARCH) ?? "")
      .trim()
      .slice(0, MAX_SEARCH_LENGTH),
    status: parseStatus(readParam(raw, CARDS_PARAM.STATUS)),
    fieldFilters: parseFieldFilters(readParam(raw, CARDS_PARAM.FIELD_FILTERS)),
    view: parseView(readParam(raw, CARDS_PARAM.VIEW)),
    page: parsePage(readParam(raw, CARDS_PARAM.PAGE)),
  };
}

// ─── Writing ──────────────────────────────────────────────────────────────────

/**
 * Serialize the view state. Defaults are omitted, so the untouched list stays
 * at a bare `/cards`.
 *
 * @returns A query string starting with `?`, or `""` when nothing is set.
 */
export function buildCardListQuery(state: CardListViewState): string {
  const params = new URLSearchParams();

  if (state.cardTypeIds.length > 0) {
    params.set(CARDS_PARAM.CARD_TYPES, state.cardTypeIds.join(","));
  }
  if (state.search) params.set(CARDS_PARAM.SEARCH, state.search);
  if (state.status !== "all") params.set(CARDS_PARAM.STATUS, state.status);
  if (state.fieldFilters.length > 0) {
    params.set(CARDS_PARAM.FIELD_FILTERS, JSON.stringify(state.fieldFilters));
  }
  if (state.view !== "table") params.set(CARDS_PARAM.VIEW, state.view);
  if (state.page > 1) params.set(CARDS_PARAM.PAGE, String(state.page));

  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Rebuild a card list query received from somewhere else — in practice the `cq`
 * blob a card detail or edit page carries so its back link can return to the
 * list the operator came from.
 *
 * Sanitizing is the round trip itself: parse validates and drops, build emits
 * only known keys. The result is therefore always a card list query and can
 * never be an absolute URL, a path, or a foreign parameter, whatever arrives.
 */
export function sanitizeCardListQuery(raw: string | null | undefined): string {
  if (!raw) return "";
  const stripped = raw.startsWith("?") ? raw.slice(1) : raw;
  return buildCardListQuery(parseCardListParams(new URLSearchParams(stripped)));
}

// ─── Pagination ───────────────────────────────────────────────────────────────

/**
 * The slice of results this view state asks for.
 *
 * Single definition on purpose: the server page and `CardList` must request
 * identical windows, or returning to page 3 of the gallery would render the
 * table's page 3 and then correct itself on the first refetch.
 */
export function toPagination(state: CardListViewState): {
  limit: number;
  offset: number;
} {
  const limit = CARD_LIST_PAGE_SIZE[state.view];
  return { limit, offset: (state.page - 1) * limit };
}
