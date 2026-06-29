"use client";

/**
 * AutoActionFeedback
 *
 * Displays the results of auto-executed actions after an operational scan.
 *
 * State semantics:
 *   - All actions succeeded → bordered with state-granted (green).
 *   - Any failure OR stoppedByValidation → bordered with state-warning (amber).
 *   - Per-result: success row uses state-granted, failure row uses state-denied.
 *   - The "stopped by validation" notice itself is state-denied (red) — it is
 *     the failure that aborted the loop.
 *
 * Auto-dismisses after `autoDismissMs` only when the run was fully clean.
 */

import { useEffect } from "react";
import { CheckCircle2, XCircle, Zap, X, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AutoActionResult } from "@/lib/dal";

const TEXT = {
  HEADER_OK:        "Acciones automáticas ejecutadas",
  HEADER_PARTIAL:   "Acciones automáticas — con errores",
  STOPPED_PREFIX:   "Ejecución detenida tras",
  STOPPED_SUFFIX:   ": la validación detectó errores. Las acciones restantes no se ejecutaron.",
  ARIA_DISMISS:     "Cerrar resumen",
} as const;

interface AutoActionFeedbackProps {
  results: AutoActionResult[];
  onDismiss: () => void;
  /** Auto-dismiss timeout in ms (only when all succeeded). Default: 4000. */
  autoDismissMs?: number;
  stoppedByValidation?: boolean;
  stoppedAtAction?: string | null;
}

export default function AutoActionFeedback({
  results,
  onDismiss,
  autoDismissMs = 4000,
  stoppedByValidation = false,
  stoppedAtAction = null,
}: AutoActionFeedbackProps) {
  const allSucceeded = results.every((r) => r.success) && !stoppedByValidation;

  useEffect(() => {
    if (!allSucceeded) return;
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [allSucceeded, autoDismissMs, onDismiss]);

  if (results.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-xl border-2 p-3",
        allSucceeded
          ? "bg-state-granted border-state-granted-border text-state-granted-foreground"
          : "bg-state-warning border-state-warning-border text-state-warning-foreground",
      )}
    >
      {stoppedByValidation && (
        <div
          className={cn(
            "mb-3 flex items-start gap-2 rounded-md border px-3 py-2",
            "bg-state-denied border-state-denied-border text-state-denied-foreground",
          )}
        >
          <ShieldAlert aria-hidden strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-state-denied-icon" />
          <p className="text-xs">
            {TEXT.STOPPED_PREFIX}{" "}
            <span className="font-semibold">{stoppedAtAction}</span>
            {TEXT.STOPPED_SUFFIX}
          </p>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Zap
            aria-hidden
            strokeWidth={2}
            className={cn(
              "size-4",
              allSucceeded ? "text-state-granted-icon" : "text-state-warning-icon",
            )}
          />
          {allSucceeded ? TEXT.HEADER_OK : TEXT.HEADER_PARTIAL}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onDismiss}
          aria-label={TEXT.ARIA_DISMISS}
          className={cn(
            allSucceeded
              ? "text-state-granted-foreground hover:bg-state-granted-border/40"
              : "text-state-warning-foreground hover:bg-state-warning-border/40",
          )}
        >
          <X />
        </Button>
      </div>

      <ul className="flex flex-col gap-1.5">
        {results.map((r) => (
          <li
            key={r.actionDefinitionId}
            className={cn(
              "flex items-start gap-2 rounded-md border bg-card px-3 py-2",
              r.success
                ? "border-state-granted-border"
                : "border-state-denied-border",
            )}
          >
            {r.success ? (
              <CheckCircle2
                aria-hidden
                strokeWidth={2}
                className="mt-0.5 size-4 shrink-0 text-state-granted-icon"
              />
            ) : (
              <XCircle
                aria-hidden
                strokeWidth={2}
                className="mt-0.5 size-4 shrink-0 text-state-denied-icon"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">{r.actionName}</div>
              {!r.success && r.error && (
                <div className="mt-0.5 text-xs text-state-denied-foreground">{r.error}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
