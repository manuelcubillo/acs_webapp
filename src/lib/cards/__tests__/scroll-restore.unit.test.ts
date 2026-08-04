/**
 * Card list scroll-restore tests
 *
 * Pure unit tests — `window` is stubbed with a minimal sessionStorage plus a
 * `scrollY`. There is no `document`, so `readPageScroll` finds no dashboard
 * scroll container and falls back to the window, which is what these assert on.
 *
 * The history binding (`src/lib/history/__tests__/scroll-restore.unit.test.ts`)
 * covers the one-shot and key-match rules of the shared mechanism. What matters
 * here is the card list's own contract: it stores the *current* window offset,
 * `0` survives the round trip as a real value, and the two surfaces keep
 * separate storage so one can never restore into the other.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rememberCardListScroll, consumeCardListScroll } from "../scroll-restore";
import {
  rememberHistoryScroll,
  consumeHistoryScroll,
} from "@/lib/history/scroll-restore";

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

function stubWindow(scrollY: number, sessionStorage: Storage) {
  vi.stubGlobal("window", { scrollY, sessionStorage });
}

let sessionStorage: Storage;

beforeEach(() => {
  sessionStorage = createStorage();
  stubWindow(0, sessionStorage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rememberCardListScroll / consumeCardListScroll", () => {
  it("stores the offset the page is at when the operator leaves", () => {
    stubWindow(840, sessionStorage);
    rememberCardListScroll("?q=A1");
    expect(consumeCardListScroll("?q=A1")).toBe(840);
  });

  it("restores nothing when no offset was stored", () => {
    expect(consumeCardListScroll("?q=A1")).toBeNull();
  });

  it("distinguishes the top of the list from nothing stored", () => {
    stubWindow(0, sessionStorage);
    rememberCardListScroll("?q=A1");
    expect(consumeCardListScroll("?q=A1")).toBe(0);
  });

  it("consumes the entry, so a later plain visit opens at the top", () => {
    stubWindow(300, sessionStorage);
    rememberCardListScroll("?q=A1");
    consumeCardListScroll("?q=A1");
    expect(consumeCardListScroll("?q=A1")).toBeNull();
  });

  it("refuses an offset taken under a different view", () => {
    stubWindow(300, sessionStorage);
    rememberCardListScroll("?q=A1");
    expect(consumeCardListScroll("?q=A1&status=active")).toBeNull();
  });

  it("keeps the card list and history offsets apart", () => {
    stubWindow(300, sessionStorage);
    rememberCardListScroll("?q=A1");
    rememberHistoryScroll("?q=A1", { page: 10, container: 20 });

    // Same query string, two surfaces — neither may consume the other's entry.
    expect(consumeCardListScroll("?q=A1")).toBe(300);
    expect(consumeHistoryScroll("?q=A1")).toEqual({ page: 10, container: 20 });
  });

  it("never throws when storage is unavailable", () => {
    vi.stubGlobal("window", {
      scrollY: 100,
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

    expect(() => rememberCardListScroll("?q=A1")).not.toThrow();
    expect(consumeCardListScroll("?q=A1")).toBeNull();
  });
});
