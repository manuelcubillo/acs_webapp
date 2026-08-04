/**
 * Scroll restoration for the round trip `/cards` → `/cards/[code]` → back.
 *
 * The mechanism (one-shot, keyed by the query the offset was taken under) lives
 * in `src/lib/navigation/return-scroll.ts` and is shared with `/history`. This
 * module pins the storage key, so neither surface can restore into the other.
 *
 * Only the page offset is meaningful here: both card list views grow with the
 * page (the table's own container scrolls horizontally only), so there is no
 * inner vertical scroller to remember — unlike the history table.
 */

import {
  createScrollMemory,
  readPageScroll,
} from "@/lib/navigation/return-scroll";

const memory = createScrollMemory("acs:cards:scroll");

/** Remember where the operator was before opening a card. */
export function rememberCardListScroll(viewQuery: string): void {
  memory.remember(viewQuery, { page: readPageScroll(), container: 0 });
}

/**
 * Read and clear the offset stored for `viewQuery`.
 *
 * @returns The page offset to restore (see `applyPageScroll`), or `null` when
 *   there is nothing to restore — including when the list was re-filtered
 *   before coming back. `0` is a real offset, so callers must test for `null`.
 */
export function consumeCardListScroll(viewQuery: string): number | null {
  return memory.consume(viewQuery)?.page ?? null;
}
