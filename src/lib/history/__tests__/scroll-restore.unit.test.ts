/**
 * History scroll-restore tests
 *
 * Pure unit tests — `window` is stubbed with a minimal sessionStorage, which is
 * all the module touches. The mechanism itself lives in
 * `src/lib/navigation/return-scroll.ts`; these exercise it through the history
 * binding, and `src/lib/cards/__tests__` covers that two bindings stay apart.
 *
 * The two rules that matter:
 *   1. One-shot — a stored offset is consumed on read, so a later plain visit
 *      to /history opens at the top.
 *   2. Key-matched — offsets are only restored into the view they were taken
 *      under, never into a result set the operator has re-filtered meanwhile.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  rememberHistoryScroll,
  consumeHistoryScroll,
} from "../scroll-restore";

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

let sessionStorage: Storage;

beforeEach(() => {
  sessionStorage = createStorage();
  vi.stubGlobal("window", { sessionStorage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rememberHistoryScroll / consumeHistoryScroll", () => {
  it("returns the offsets stored under the same query", () => {
    rememberHistoryScroll("?code=A1", { page: 120, container: 340 });
    expect(consumeHistoryScroll("?code=A1")).toEqual({ page: 120, container: 340 });
  });

  it("restores nothing when no offsets were stored", () => {
    expect(consumeHistoryScroll("?code=A1")).toBeNull();
  });

  it("consumes the entry, so a second read restores nothing", () => {
    rememberHistoryScroll("?code=A1", { page: 10, container: 20 });
    consumeHistoryScroll("?code=A1");
    expect(consumeHistoryScroll("?code=A1")).toBeNull();
  });

  it("refuses offsets taken under a different query", () => {
    rememberHistoryScroll("?code=A1", { page: 10, container: 20 });
    expect(consumeHistoryScroll("?code=B2")).toBeNull();
  });

  it("discards a mismatched entry rather than leaving it for later", () => {
    rememberHistoryScroll("?code=A1", { page: 10, container: 20 });
    consumeHistoryScroll("?code=B2");
    expect(consumeHistoryScroll("?code=A1")).toBeNull();
  });

  it("treats the unfiltered view as its own key", () => {
    rememberHistoryScroll("", { page: 5, container: 15 });
    expect(consumeHistoryScroll("?code=A1")).toBeNull();
    rememberHistoryScroll("", { page: 5, container: 15 });
    expect(consumeHistoryScroll("")).toEqual({ page: 5, container: 15 });
  });

  it("ignores a corrupted or half-written entry", () => {
    sessionStorage.setItem("acs:history:scroll", "{not json");
    expect(consumeHistoryScroll("?code=A1")).toBeNull();

    sessionStorage.setItem(
      "acs:history:scroll",
      JSON.stringify({ query: "?code=A1", page: "top" }),
    );
    expect(consumeHistoryScroll("?code=A1")).toBeNull();
  });

  it("never throws when storage is unavailable", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("quota");
        },
        removeItem: () => {},
      },
    });

    expect(() => rememberHistoryScroll("?code=A1", { page: 1, container: 2 })).not.toThrow();
    expect(consumeHistoryScroll("?code=A1")).toBeNull();
  });
});
