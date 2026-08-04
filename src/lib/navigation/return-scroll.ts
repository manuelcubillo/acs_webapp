/**
 * Scroll memory for a list → detail → back round trip.
 *
 * The filters travel in the URL (see `query-codec.ts` and its two callers), but
 * a scroll offset is not view state worth putting there — it is per-visit,
 * meaningless in a shared link, and changes on every wheel tick. It lives in
 * `sessionStorage` instead: written once when a row navigates away, read once
 * on the way back.
 *
 * The offset is stored against the query string it was taken under, so it is
 * only ever restored into the same result set. Change a filter before coming
 * back and the entry is discarded rather than scrolling to a row that is no
 * longer there.
 *
 * Each surface takes its own memory (its own storage key) from the factory, so
 * a `/cards` offset can never be restored into `/history`.
 */

/**
 * `data-slot` marking the element a dashboard page actually scrolls in.
 *
 * `DashboardShell` renders its content area as `flex-1 overflow-y-auto`, so
 * inside the dashboard `window.scrollY` is permanently 0 and an offset read
 * from the window would restore nothing. Anything that measures or restores a
 * page offset must go through `readPageScroll` / `applyPageScroll`.
 */
export const PAGE_SCROLL_SLOT = "page-scroll";

function pageScrollElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(`[data-slot="${PAGE_SCROLL_SLOT}"]`);
}

/** Current page offset, falling back to the window outside the dashboard. */
export function readPageScroll(): number {
  const element = pageScrollElement();
  if (element) return element.scrollTop;
  return typeof window === "undefined" ? 0 : window.scrollY;
}

/** Restore a page offset read by `readPageScroll`. */
export function applyPageScroll(top: number): void {
  const element = pageScrollElement();
  if (element) {
    element.scrollTop = top;
    return;
  }
  if (typeof window !== "undefined") window.scrollTo({ top });
}

/** How long to keep trying before accepting that the offset is unreachable. */
const RESTORE_TIMEOUT_MS = 2000;
/** Frames the offset must hold before the restore is considered done. */
const RESTORE_SETTLED_FRAMES = 5;
/** Browsers round `scrollTop` to device pixels; anything closer is "there". */
const RESTORE_TOLERANCE_PX = 1;

const RESTORE_CANCEL_EVENTS = ["wheel", "touchstart", "keydown"] as const;

/**
 * Restore a page offset against a client-side navigation that is still
 * settling.
 *
 * A single assignment does not survive, for two independent reasons:
 *
 *   - The App Router resets the scroll container to the top after the incoming
 *     page commits, which can be several frames after this runs.
 *   - The rows arrive progressively (and their photos load lazily), so for the
 *     first frames the container is barely taller than the viewport and the
 *     assignment clamps to 0 no matter how often it is repeated.
 *
 * So the offset is applied at once — the server-rendered rows are usually
 * already committed, and going through the first paint at the wrong offset
 * would show as a flash — and then re-applied every frame until it has held for
 * a few consecutive frames, or until the timeout. A list that came back shorter
 * (fewer rows than the offset assumed) simply lands at the bottom.
 *
 * Any real scroll input cancels it: insisting past the point where the operator
 * has taken over would be fighting them.
 *
 * @returns A cleanup function; call it when the component unmounts.
 */
export function restorePageScroll(top: number): () => void {
  if (typeof window === "undefined") return () => {};

  applyPageScroll(top);

  let active = true;
  let settled = 0;
  const deadline = Date.now() + RESTORE_TIMEOUT_MS;

  const stop = () => {
    active = false;
    for (const event of RESTORE_CANCEL_EVENTS) {
      window.removeEventListener(event, stop);
    }
  };
  for (const event of RESTORE_CANCEL_EVENTS) {
    window.addEventListener(event, stop, { passive: true, once: true });
  }

  const tick = () => {
    if (!active) return;
    applyPageScroll(top);

    settled =
      Math.abs(readPageScroll() - top) <= RESTORE_TOLERANCE_PX ? settled + 1 : 0;
    if (settled >= RESTORE_SETTLED_FRAMES || Date.now() > deadline) {
      stop();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return stop;
}

export interface ScrollOffsets {
  /** Page offset — see `readPageScroll`. */
  page: number;
  /**
   * `scrollTop` of an inner scroll container, for a surface that has one (the
   * history table scrolls inside `max-h-… overflow-auto`, so the page offset
   * alone would restore nothing). `0` when the surface scrolls with the page.
   */
  container: number;
}

interface StoredEntry extends ScrollOffsets {
  /** The query string these offsets were taken under. */
  query: string;
}

export interface ScrollMemory {
  /**
   * Remember where the operator was before leaving for a detail view.
   * Silently does nothing when storage is unavailable (private mode, quota).
   */
  remember(query: string, offsets: ScrollOffsets): void;
  /**
   * Read and clear the stored offsets, but only if they belong to `query`.
   *
   * Consuming on read is what keeps this a one-shot: a later plain visit to the
   * list must open at the top, not wherever a past visit ended.
   */
  consume(query: string): ScrollOffsets | null;
}

export function createScrollMemory(storageKey: string): ScrollMemory {
  return {
    remember(query, offsets) {
      if (typeof window === "undefined") return;
      const entry: StoredEntry = { query, ...offsets };
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(entry));
      } catch {
        // Scroll position is a nicety — never break navigation over it.
      }
    },

    consume(query) {
      if (typeof window === "undefined") return null;

      let raw: string | null = null;
      try {
        raw = window.sessionStorage.getItem(storageKey);
        if (raw !== null) window.sessionStorage.removeItem(storageKey);
      } catch {
        return null;
      }
      if (!raw) return null;

      try {
        const entry = JSON.parse(raw) as Partial<StoredEntry>;
        if (entry.query !== query) return null;
        if (
          typeof entry.page !== "number" ||
          typeof entry.container !== "number"
        ) {
          return null;
        }
        return { page: entry.page, container: entry.container };
      } catch {
        return null;
      }
    },
  };
}
