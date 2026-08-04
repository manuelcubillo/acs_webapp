/**
 * Where a card detail came from, and how to get back there.
 *
 * `/cards/[code]` is reachable from four surfaces, and two of them are filtered
 * lists whose exact view has to survive the trip. The origin therefore travels
 * as three query params:
 *
 *   `from` — the origin surface, which picks the back link's target and label.
 *   `cq`   — the `/cards` view to return to (`buildCardListQuery`).
 *   `hq`   — the `/history` view to return to (`buildHistoryQuery`).
 *
 * One module owns both directions: the lists build the link here, and the
 * detail and edit pages read it back here. A key renamed in one place without
 * the other would silently degrade to "back to the dashboard", which is exactly
 * the kind of failure nothing errors on.
 *
 * Both blobs are re-validated on every read (they arrive from the URL), so a
 * rebuilt href can only ever be `/cards` or `/history` with known parameters.
 */

import { sanitizeCardListQuery } from "@/lib/cards/list-params";
import { sanitizeHistoryQuery } from "@/lib/history/filter-params";

export const ORIGIN_PARAM = {
  FROM:          "from",
  CARDS_QUERY:   "cq",
  HISTORY_QUERY: "hq",
} as const;

/**
 * Surfaces that link to a card detail. `dashboard` is the fallback for a card
 * opened from anywhere else (or directly by URL) — it names the back link's
 * destination, and is never written as a `from` value.
 */
export type CardOrigin = "cards" | "archived" | "history" | "dashboard";

/** The raw origin params, as a Next.js page receives them. */
export interface RawOriginParams {
  from?: string;
  cq?: string;
  hq?: string;
}

export interface ResolvedOrigin {
  origin: CardOrigin;
  /** Fully rebuilt and re-validated destination for the back link. */
  backHref: string;
  /**
   * The same origin re-encoded, to carry one step further (detail → edit), so
   * an edit returns to the detail with its back link still intact. Starts with
   * `?`, or is `""` when there is no origin worth carrying.
   */
  forwardQuery: string;
  /**
   * The sanitized `/cards` query alone — for a redirect that must land on the
   * list rather than go "back" to it (archiving from the edit page). `""`
   * unless the origin is the card list.
   */
  cardListQuery: string;
}

/** Build a card detail link from a filtered list, carrying its view along. */
export function cardDetailHref(
  code: string,
  origin: "cards" | "history",
  viewQuery: string,
): string {
  const params = new URLSearchParams({ [ORIGIN_PARAM.FROM]: origin });
  if (viewQuery) {
    params.set(
      origin === "cards" ? ORIGIN_PARAM.CARDS_QUERY : ORIGIN_PARAM.HISTORY_QUERY,
      viewQuery,
    );
  }
  return `/cards/${encodeURIComponent(code)}?${params.toString()}`;
}

/** Read the origin params back into a destination, a label key and a carrier. */
export function resolveCardOrigin(raw: RawOriginParams): ResolvedOrigin {
  const origin: CardOrigin =
    raw.from === "cards" || raw.from === "archived" || raw.from === "history"
      ? raw.from
      : "dashboard";

  const cardListQuery = origin === "cards" ? sanitizeCardListQuery(raw.cq) : "";
  const historyQuery = origin === "history" ? sanitizeHistoryQuery(raw.hq) : "";

  const backHref =
    origin === "cards"
      ? `/cards${cardListQuery}`
      : origin === "archived"
        ? "/archived"
        : origin === "history"
          ? `/history${historyQuery}`
          : "/dashboard";

  // Nothing to carry for a card reached from the dashboard or by direct URL:
  // its back link needs no state, so the edit page inherits a bare href.
  let forwardQuery = "";
  if (origin !== "dashboard") {
    const params = new URLSearchParams({ [ORIGIN_PARAM.FROM]: origin });
    if (cardListQuery) params.set(ORIGIN_PARAM.CARDS_QUERY, cardListQuery);
    if (historyQuery) params.set(ORIGIN_PARAM.HISTORY_QUERY, historyQuery);
    forwardQuery = `?${params.toString()}`;
  }

  return { origin, backHref, forwardQuery, cardListQuery };
}
