/**
 * Scroll restoration for the round trip `/history` → `/cards/[code]` → back.
 *
 * The mechanism (one-shot, keyed by the query the offsets were taken under)
 * lives in `src/lib/navigation/return-scroll.ts` and is shared with `/cards`.
 * This module only pins the storage key, so the two surfaces can never restore
 * into each other.
 *
 * Both offsets matter here: the history table scrolls INSIDE its own container
 * (`max-h-… overflow-auto`), so the window offset alone would restore nothing.
 */

import {
  createScrollMemory,
  type ScrollOffsets,
} from "@/lib/navigation/return-scroll";

export type { ScrollOffsets as HistoryScrollOffsets };

const memory = createScrollMemory("acs:history:scroll");

export const rememberHistoryScroll = memory.remember;
export const consumeHistoryScroll = memory.consume;
