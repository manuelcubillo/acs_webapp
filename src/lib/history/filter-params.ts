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
import type { ActionHistoryFilters, LogType } from "@/lib/dal/types";
import { HISTORY_LOG_TYPES } from "./log-types";

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
  LOG_TYPES:     "lt",
  SCANS:         "scans",
  PAGE:          "page",
} as const;

/** Everything a history query may contain. Anything else is dropped. */
export const HISTORY_PARAM_KEYS: readonly string[] = Object.values(HISTORY_PARAM);

/** The complete restorable state of the history view. */
export interface HistoryViewState {
  /**
   * User-chosen filters. `logTypes` here is the panel's selection, which may be
   * empty meaning "no preference"; the scan toggle is a SEPARATE control over
   * the same dimension and the two are composed by `toEffectiveFilters`. Never
   * send `filters` straight to the DAL.
   */
  filters: ActionHistoryFilters;
  /**
   * Scan entries visible. The default when the URL is silent is injected —
   * see `parseHistoryParams`.
   */
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
 * The scan toggle's default when the URL says nothing.
 *
 * Historically `true` unconditionally ("absent = show everything"). It is now
 * INJECTED, because with presence control enabled every operational scan writes
 * both a scan row and a presence action row, so the default view doubles up and
 * is more useful with scans hidden.
 *
 * This module stays dependency-free by design — it is imported by the server
 * page AND by client components — so it must not become tenant-aware itself.
 * The caller resolves the default (`tenantHasPresenceEnabled`) and passes it in.
 */
export const DEFAULT_SHOW_SCANS = true;

/**
 * Read the history view state out of a query string.
 * Never throws — an unreadable value simply does not filter.
 *
 * @param raw              - The query string or params object.
 * @param defaultShowScans - What `scans` means when absent. Defaults to the
 *                           historical `true`; the history page passes the
 *                           tenant-derived value.
 */
export function parseHistoryParams(
  raw: HistoryRawParams,
  defaultShowScans: boolean = DEFAULT_SHOW_SCANS,
): HistoryViewState {
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

  const logTypes = parseLogTypes(readParam(raw, HISTORY_PARAM.LOG_TYPES));
  if (logTypes.length > 0) filters.logTypes = logTypes;

  return {
    filters,
    showScans: readScansParam(readParam(raw, HISTORY_PARAM.SCANS), defaultShowScans),
    page: parsePage(readParam(raw, HISTORY_PARAM.PAGE)),
  };
}

/**
 * Read the log-type selection, dropping anything that is not a real log type.
 * A hand-typed `lt=nonsense` therefore filters nothing rather than erroring at
 * the Server Action boundary, where it would surface as a silently empty table.
 */
function parseLogTypes(value: string | null | undefined): LogType[] {
  if (!value) return [];
  const known = new Set<string>(HISTORY_LOG_TYPES);
  return [
    ...new Set(
      value
        .split(",")
        .map((v) => v.trim())
        .filter((v): v is LogType => known.has(v)),
    ),
  ];
}

/**
 * `scans` is explicit in every query this module writes, so absence only ever
 * means "hand-typed URL" — in which case the caller's default applies.
 */
function readScansParam(value: string | null | undefined, fallback: boolean): boolean {
  if (value === "0") return false;
  if (value === "1") return true;
  return fallback;
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
  if (filters.logTypes?.length) {
    params.set(HISTORY_PARAM.LOG_TYPES, filters.logTypes.join(","));
  }
  // ALWAYS serialized, unlike every other key, which is omitted at its default.
  // With a tenant-dependent default, absence no longer has a single meaning —
  // an explicit 0/1 is what makes a shared link, a reload and the `hq` return
  // blob all reproduce the view the operator actually had.
  params.set(HISTORY_PARAM.SCANS, showScans ? "1" : "0");
  if (page > 1) params.set(HISTORY_PARAM.PAGE, String(page));

  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Rebuild a history query received from somewhere else — in practice the `hq`
 * blob a card detail page carries so its back link can return to the view the
 * operator came from.
 *
 * `defaultShowScans` is rarely worth passing: `buildHistoryQuery` always emits
 * `scans`, so every blob this app produces carries an explicit value and round
 * trips exactly. It matters only for a hand-edited URL. This is why the card
 * detail page — which is deliberately tenant-unaware — can keep calling it with
 * one argument.
 *
 * Sanitizing is the round trip itself: parse validates and drops, build emits
 * only known keys. The result is therefore always a history query and can
 * never be an absolute URL, a path, or a foreign parameter, whatever arrives.
 */
export function sanitizeHistoryQuery(
  raw: string | null | undefined,
  defaultShowScans: boolean = DEFAULT_SHOW_SCANS,
): string {
  if (!raw) return "";
  const stripped = raw.startsWith("?") ? raw.slice(1) : raw;
  return buildHistoryQuery(
    parseHistoryParams(new URLSearchParams(stripped), defaultShowScans),
  );
}

// ─── Effective filters ────────────────────────────────────────────────────────

/**
 * Compose the two controls over the log-type dimension into the list actually
 * sent to the DAL.
 *
 * There are two, deliberately: the filter panel's "Tipo de registro" selection
 * says WHICH types interest the operator, and the inline scan toggle is the
 * fast way to silence the scan rows that presence control doubles up. They
 * intersect — the toggle can only ever remove `scan`.
 *
 * The result is ALWAYS an explicit list, never `undefined`. Before A2 this
 * function deleted the key when the toggle was on, which meant no log-type
 * predicate was applied at all — which is how `lifecycle` rows had been
 * reaching `/history` for a month while three documents claimed they could not.
 *
 * An empty result is meaningful and is passed through as such: it happens only
 * when the operator selected `scan` alone and then hid scans, and `buildWhere`
 * honours it as "match nothing" rather than "match everything".
 *
 * Single definition on purpose: the server page and the client view must send
 * identical filters or the first client refetch would silently change the
 * result set.
 */
export function toEffectiveFilters(
  base: ActionHistoryFilters,
  showScans: boolean,
): ActionHistoryFilters {
  const chosen = base.logTypes?.length ? base.logTypes : HISTORY_LOG_TYPES;
  return {
    ...base,
    logTypes: showScans ? [...chosen] : chosen.filter((t) => t !== "scan"),
  };
}
