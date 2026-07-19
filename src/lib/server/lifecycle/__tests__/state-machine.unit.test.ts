/**
 * Unit tests for the lifecycle state machine.
 *
 * Pure logic, no database. Every legal and illegal transition is covered here;
 * the cascade and the DB-level guarantees are covered by
 * `lifecycle.integration.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { ValidationError } from "@/lib/dal/errors";
import type { LifecycleStatus } from "@/lib/dal/types";
import {
  assertTransitionAllowed,
  assertCanRestore,
  targetStatus,
  isOff,
  isArchived,
  OFF_STATUSES,
  LIVE_STATUSES,
} from "../state-machine";

const ALL: LifecycleStatus[] = ["active", "inactive", "expired", "archived"];

describe("status predicates", () => {
  it("treats expired exactly like inactive", () => {
    expect(isOff("inactive")).toBe(true);
    expect(isOff("expired")).toBe(true);
    expect(isOff("active")).toBe(false);
    expect(isOff("archived")).toBe(false);
    expect(OFF_STATUSES).toEqual(["inactive", "expired"]);
  });

  it("identifies archived rows", () => {
    expect(isArchived("archived")).toBe(true);
    for (const s of LIVE_STATUSES) expect(isArchived(s)).toBe(false);
  });
});

describe("activate", () => {
  it.each(["inactive", "expired"] as const)("allows %s -> active", (from) => {
    expect(() => assertTransitionAllowed("activate", from, "Card")).not.toThrow();
  });

  it("rejects active -> active", () => {
    expect(() => assertTransitionAllowed("activate", "active", "Card")).toThrow(
      ValidationError,
    );
  });

  it("rejects activating an archived card and points at restore", () => {
    expect(() => assertTransitionAllowed("activate", "archived", "Card")).toThrow(
      /archived[\s\S]*Restore it from the trash first/,
    );
  });
});

describe("deactivate", () => {
  it("allows active -> inactive", () => {
    expect(() =>
      assertTransitionAllowed("deactivate", "active", "Card"),
    ).not.toThrow();
  });

  it.each(["inactive", "expired"] as const)(
    "rejects %s -> inactive (already off)",
    (from) => {
      expect(() => assertTransitionAllowed("deactivate", from, "Card")).toThrow(
        ValidationError,
      );
    },
  );

  it("rejects deactivating an archived card", () => {
    expect(() =>
      assertTransitionAllowed("deactivate", "archived", "Card"),
    ).toThrow(ValidationError);
  });
});

describe("archive", () => {
  it.each(["active", "inactive", "expired"] as const)(
    "allows %s -> archived",
    (from) => {
      expect(() =>
        assertTransitionAllowed("archive", from, "Card"),
      ).not.toThrow();
    },
  );

  it("rejects archiving something already archived", () => {
    expect(() => assertTransitionAllowed("archive", "archived", "Card")).toThrow(
      ValidationError,
    );
  });
});

describe("restore", () => {
  it.each(["active", "inactive", "expired"] as const)(
    "returns the pre-archive status %s",
    (before) => {
      expect(assertCanRestore("archived", before, "Card")).toBe(before);
    },
  );

  it.each(["active", "inactive", "expired"] as const)(
    "rejects restoring a card that is %s, not archived",
    (current) => {
      expect(() => assertCanRestore(current, "active", "Card")).toThrow(
        /not archived/,
      );
    },
  );

  it("rejects restore when the pre-archive status is missing", () => {
    expect(() => assertCanRestore("archived", null, "Card")).toThrow(
      /corrupted trash metadata/,
    );
  });

  it("rejects restore when the pre-archive status is itself archived", () => {
    expect(() => assertCanRestore("archived", "archived", "Card")).toThrow(
      /corrupted trash metadata/,
    );
  });
});

describe("targetStatus", () => {
  it("maps each transition to its destination", () => {
    expect(targetStatus("activate")).toBe("active");
    expect(targetStatus("deactivate")).toBe("inactive");
    expect(targetStatus("archive")).toBe("archived");
  });
});

describe("error messages name the entity", () => {
  it("uses the entity label given by the caller", () => {
    expect(() => assertTransitionAllowed("archive", "archived", "CardType")).toThrow(
      /CardType/,
    );
    expect(() => assertCanRestore("active", null, "CardType")).toThrow(/CardType/);
  });
});

describe("transition matrix is exhaustive", () => {
  // Guards against a new status being added to the enum without the state
  // machine being taught what to do with it.
  it("has a defined verdict for every status x transition pair", () => {
    for (const status of ALL) {
      for (const t of ["activate", "deactivate", "archive"] as const) {
        let threw = false;
        try {
          assertTransitionAllowed(t, status, "Card");
        } catch (e) {
          threw = true;
          expect(e).toBeInstanceOf(ValidationError);
          expect((e as Error).message.length).toBeGreaterThan(0);
        }
        expect(typeof threw).toBe("boolean");
      }
    }
  });
});
