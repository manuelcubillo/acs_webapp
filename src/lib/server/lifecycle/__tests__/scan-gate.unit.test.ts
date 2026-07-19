/**
 * Unit tests for the lifecycle scan gate.
 *
 * Pure logic, no database. Covers the full status × override-flag matrix and
 * the synthetic scan-validation check builder.
 */

import { describe, it, expect } from "vitest";
import type { LifecycleStatus } from "@/lib/dal/types";
import { LIFECYCLE_SCAN_MESSAGES } from "@/lib/validation/messages";
import { resolveLifecycleGate, buildLifecycleScanCheck } from "../scan-gate";

const ALL: LifecycleStatus[] = ["active", "inactive", "expired", "archived"];

describe("resolveLifecycleGate — status × flag matrix", () => {
  it("allows an active card regardless of the override flag", () => {
    for (const flag of [false, true]) {
      const g = resolveLifecycleGate("active", flag);
      expect(g.outcome).toBe("allowed");
      expect(g.overridable).toBe(false);
      expect(g.reason).toBeNull();
    }
  });

  it.each(["inactive", "expired"] as const)(
    "%s requires an override when the tenant allows overriding",
    (status) => {
      const g = resolveLifecycleGate(status, true);
      expect(g.outcome).toBe("requires_override");
      expect(g.overridable).toBe(true);
      expect(g.reason).toBe(LIFECYCLE_SCAN_MESSAGES[status]);
    },
  );

  it.each(["inactive", "expired"] as const)(
    "%s is blocked when the tenant does not allow overriding",
    (status) => {
      const g = resolveLifecycleGate(status, false);
      expect(g.outcome).toBe("blocked");
      expect(g.overridable).toBe(false);
      expect(g.reason).toBe(LIFECYCLE_SCAN_MESSAGES[status]);
    },
  );

  it("denies an archived card and never marks it overridable", () => {
    for (const flag of [false, true]) {
      const g = resolveLifecycleGate("archived", flag);
      expect(g.outcome).toBe("denied_archived");
      expect(g.overridable).toBe(false);
      expect(g.reason).toBe(LIFECYCLE_SCAN_MESSAGES.archived);
    }
  });

  it("echoes back the status it was given", () => {
    for (const s of ALL) {
      expect(resolveLifecycleGate(s, true).status).toBe(s);
      expect(resolveLifecycleGate(s, false).status).toBe(s);
    }
  });
});

describe("buildLifecycleScanCheck", () => {
  it.each(["inactive", "expired", "archived"] as const)(
    "builds a failed, error-level check for %s",
    (status) => {
      const c = buildLifecycleScanCheck(status);
      expect(c.passed).toBe(false);
      expect(c.severity).toBe("error");
      expect(c.rule).toBe("lifecycle_status");
      expect(c.scanValidationId).toBe(`lifecycle:${status}`);
      expect(c.fieldDefinitionId).toBe("");
      expect(c.message).toBe(LIFECYCLE_SCAN_MESSAGES[status]);
    },
  );
});
