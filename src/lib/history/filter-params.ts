/**
 * History view state ↔ URL query string.
 *
 * `/history` keeps its filters, scan toggle and page number in the URL rather
 * than in React state alone. Three things depend on that:
 *
 *   1. The page server-renders the *filtered* result set, so arriving with
 *      filters costs one query, not one unfiltered query plus a client refetch.
 *   2. A filtered view is shareable and survives a reload.
 *   3. Leaving for a card detail and coming back restores the exact view — the
 *      row carries this query string along and the back link rebuilds it.
 *
 * Deliberately dependency-free: imported by the server page AND by client
 * components, so it must not pull in anything `server-only`.
 *
 * The readers come from `src/lib/navigation/query-codec.ts`, shared with
 * `/cards`. They are defensive by design: the input is a URL, which anyone can
 * type, so an unparseable value is dropped rather than thrown and becomes "no
 * filter" instead of a Zod error at the Server Action boundary (which would
 * surface as a silently empty table). The Zod schema in
 * `src/lib/actions/action-history.ts` remains the source of truth.
 */

import {
  parseDate,
  parseFieldFilters,
  parsePage,
  parseUuidList,
  readParam,
  type RawParams,
} from "@/lib/navigation/query-codec";
import type { ActionHistoryFilters } from "@/lib/dal/types";

// ─── Query keys ───────────────────────────────────────────────────────────────

/**
 * Short keys, one per filter dimension. `df`/`dt` rather than `from`/`to`:
 * `from` is already the card-detail origin param, and the two meet whenever a
 * history query is round-tripped through `/cards/[code]`.
 */
export const HISTORY_PARAM = {
  DATE_FROM:     "df",
  DATE_TO:       "dt",
  CARD_TYPES:    "ct",
  ACTIONS:       "act",
  USER:          "user",
  CARD_CODE:     "code",
  FIELD_FILTERS: "ff",
  SCANS:         "scans",
  PAGE:          "page",
} as const;

/** Everything a history query may contain. Anything else is dropped. */
export const HISTORY_PARAM_KEYS: readonly string[] = Object.values(HISTORY_PARAM);

/** The complete restorable state of the history view. */
export interface HistoryViewState {
  /**
   * User-chosen filters, WITHOUT `logTypes` — the scan toggle owns that
   * dimension and is merged in by `toEffectiveFilters`.
   */
  filters: ActionHistoryFilters;
  /** Scan entries visible. Default true (no filter = show everything). */
  showScans: boolean;
  /** 1-based page number. */
  page: number;
}

/** Matches the Zod cap on `cardCode`. */
const MAX_CARD_CODE_LENGTH = 500;
/** Better Auth user ids are opaque strings, so only a sanity cap applies. */
const MAX_USER_ID_LENGTH = 128;

// ─── Reading ──────────────────────────────────────────────────────────────────

/** What a Next.js server page receives, or what a client component builds. */
export type HistoryRawParams = RawParams;

/**
 * Read the history view state out of a query string.
 * Never throws — an unreadable value simply does not filter.
 */
export function parseHistoryParams(raw: HistoryRawParams): HistoryViewState {
  const filters: ActionHistoryFilters = {};

  const dateFrom = parseDate(readParam(raw, HISTORY_PARAM.DATE_FROM));
  if (dateFrom) filters.dateFrom = dateFrom;

  const dateTo = parseDate(readParam(raw, HISTORY_PARAM.DATE_TO));
  if (dateTo) filters.dateTo = dateTo;

  const cardTypeIds = parseUuidList(readParam(raw, HISTORY_PARAM.CARD_TYPES));
  if (cardTypeIds.length > 0) filters.cardTypeIds = cardTypeIds;

  const actionDefinitionIds = parseUuidList(readParam(raw, HISTORY_PARAM.ACTIONS));
  if (actionDefinitionIds.length > 0) {
    filters.actionDefinitionIds = actionDefinitionIds;
  }

  const executedBy = readParam(raw, HISTORY_PARAM.USER)?.trim();
  if (executedBy) filters.executedBy = executedBy.slice(0, MAX_USER_ID_LENGTH);

  const cardCode = readParam(raw, HISTORY_PARAM.CARD_CODE)?.trim();
  if (cardCode) filters.cardCode = cardCode.slice(0, MAX_CARD_CODE_LENGTH);

  const fieldFilters = parseFieldFilters(readParam(raw, HISTORY_PARAM.FIELD_FILTERS));
  if (fieldFilters.length > 0) filters.fieldFilters = fieldFilters;

  return {
    filters,
    showScans: readParam(raw, HISTORY_PARAM.SCANS) !== "0",
    page: parsePage(readParam(raw, HISTORY_PARAM.PAGE)),
  };
}

// ─── Writing ──────────────────────────────────────────────────────────────────

/**
 * Serialize the view state. Defaults are omitted, so the untouched view stays
 * at a bare `/history`.
 *
 * @returns A query string starting with `?`, or `""` when nothing is set.
 */
export function buildHistoryQuery(state: HistoryViewState): string {
  const { filters, showScans, page } = state;
  const params = new URLSearchParams();

  if (filters.dateFrom) {
    params.set(HISTORY_PARAM.DATE_FROM, filters.dateFrom.toISOString());
  }
  if (filters.dateTo) {
    params.set(HISTORY_PARAM.DATE_TO, filters.dateTo.toISOString());
  }
  if (filters.cardTypeIds?.length) {
    params.set(HISTORY_PARAM.CARD_TYPES, filters.cardTypeIds.join(","));
  }
  if (filters.actionDefinitionIds?.length) {
    params.set(HISTORY_PARAM.ACTIONS, filters.actionDefinitionIds.join(","));
  }
  if (filters.executedBy) {
    params.set(HISTORY_PARAM.USER, filters.executedBy);
  }
  if (filters.cardCode) {
    params.set(HISTORY_PARAM.CARD_CODE, filters.cardCode);
  }
  if (filters.fieldFilters?.length) {
    params.set(HISTORY_PARAM.FIELD_FILTERS, JSON.stringify(filters.fieldFilters));
  }
  if (!showScans) params.set(HISTORY_PARAM.SCANS, "0");
  if (page > 1) params.set(HISTORY_PARAM.PAGE, String(page));

  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Rebuild a history query received from somewhere else — in practice the `hq`
 * blob a card detail page carries so its back link can return to the view the
 * operator came from.
 *
 * Sanitizing is the round trip itself: parse validates and drops, build emits
 * only known keys. The result is therefore always a history query and can
 * never be an absolute URL, a path, or a foreign parameter, whatever arrives.
 */
export function sanitizeHistoryQuery(raw: string | null | undefined): string {
  if (!raw) return "";
  const stripped = raw.startsWith("?") ? raw.slice(1) : raw;
  return buildHistoryQuery(parseHistoryParams(new URLSearchParams(stripped)));
}

// ─── Effective filters ────────────────────────────────────────────────────────

/**
 * Merge the scan toggle into the filters actually sent to the DAL.
 *
 * Off → only action rows. On → no `logTypes` constraint at all, so the query
 * covers both; `lifecycle` rows are excluded by the DAL regardless.
 *
 * Single definition on purpose: the server page and the client view must send
 * identical filters or the first client refetch would silently change the
 * result set.
 */
export function toEffectiveFilters(
  base: ActionHistoryFilters,
  showScans: boolean,
): ActionHistoryFilters {
  if (!showScans) return { ...base, logTypes: ["action"] };
  const rest = { ...base };
  delete rest.logTypes;
  return rest;
}
