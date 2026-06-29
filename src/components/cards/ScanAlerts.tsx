"use client";

/**
 * ScanAlerts — dismissible banners for failing scan validation checks.
 *
 * Token-driven. Severity → state token:
 *   - "error"   → state-denied  (red)
 *   - "warning" → state-warning (amber)
 *
 * Each row = icon + field label + message (color is never the only cue).
 * If all checks pass, the component renders nothing.
 */

import { useState } from "react";
import { AlertCircle, AlertTriangle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScanValidationResult } from "@/lib/validation/scan-validator";

const TEXT = {
  ARIA_DISMISS: "Descartar alerta",
} as const;

interface ScanAlertsProps {
  scanResult: ScanValidationResult;
}

export default function ScanAlerts({ scanResult }: ScanAlertsProps) {
  const failing = scanResult.results.filter((r) => !r.passed);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = failing.filter((r) => !dismissed.has(r.scanValidationId));
  if (visible.length === 0) return null;

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      {visible.map((check) => {
        const isError = check.severity === "error";
        const Icon = isError ? AlertCircle : AlertTriangle;

        return (
          <div
            key={check.scanValidationId}
            className={cn(
              "flex items-start gap-3 rounded-lg border-2 px-4 py-3 text-sm",
              isError
                ? "bg-state-denied border-state-denied-border text-state-denied-foreground"
                : "bg-state-warning border-state-warning-border text-state-warning-foreground",
            )}
          >
            <Icon
              aria-hidden
              strokeWidth={1.8}
              className={cn(
                "mt-0.5 size-5 shrink-0",
                isError ? "text-state-denied-icon" : "text-state-warning-icon",
              )}
            />
            <div className="min-w-0 flex-1">
              <span className="font-semibold">{check.fieldLabel}</span>
              <span className="ml-1.5 opacity-90">{check.message}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={TEXT.ARIA_DISMISS}
              onClick={() => dismiss(check.scanValidationId)}
              className={cn(
                "shrink-0",
                isError
                  ? "text-state-denied-foreground hover:bg-state-denied-border/40"
                  : "text-state-warning-foreground hover:bg-state-warning-border/40",
              )}
            >
              <X />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
