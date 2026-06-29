"use client";

/**
 * AutoActionConfirmModal
 *
 * Shown when the auto-action loop pauses mid-execution because a re-validation
 * after an action produced error-level failures, AND allow_override_on_error
 * is enabled for the tenant.
 *
 * State semantics:
 *   - The modal as a whole frames an OVERRIDE decision → state-override (orange).
 *   - The validation errors listed inside use state-denied (red) — they ARE the
 *     blocking failure.
 *   - The "stopped at" action uses state-warning (amber) — it ran, but produced
 *     errors after.
 *   - Completed actions use state-granted (green).
 *
 * Behavior preserved EXACTLY — only presentation changes.
 */

import { AlertTriangle, CheckCircle2, Circle, Loader2, ShieldAlert } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScanValidationCheck } from "@/lib/validation/scan-validator";
import type { AutoActionResult } from "@/lib/dal";

const TEXT = {
  TITLE:               "Acciones automáticas pausadas",
  SUBTITLE:            "Se detectaron errores de validación durante la ejecución.",
  SECTION_PROGRESS:    "Progreso de acciones",
  SECTION_ERRORS:      "Errores de validación detectados",
  COMPLETED_TAG:       "Completada",
  STOPPED_AT_DETAIL:   "ejecutada — errores detectados después",
  PENDING_TAG:         "Pendiente",
  WARNING_PRE:         "Se detectaron errores después de ejecutar",
  WARNING_POST:        ". Puedes continuar con las acciones restantes o detener aquí. Tu decisión quedará registrada.",
  BTN_STOP:            "Detener aquí",
  BTN_CONTINUE:        "Continuar acciones automáticas",
} as const;

export interface AutoActionConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  completedActions: AutoActionResult[];
  stoppedAtAction: string;
  validationErrors: ScanValidationCheck[];
  remainingActions: string[];
  isLoading?: boolean;
}

export default function AutoActionConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  completedActions,
  stoppedAtAction,
  validationErrors,
  remainingActions,
  isLoading = false,
}: AutoActionConfirmModalProps) {
  // Block dialog dismissal while the resume call is in-flight.
  const handleOpenChange = (open: boolean) => {
    if (!open && !isLoading) onCancel();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isLoading}
        className="max-w-xl gap-0 overflow-hidden p-0"
      >
        {/* Header — override-themed (orange) */}
        <DialogHeader
          className={cn(
            "flex-row items-start gap-3 space-y-0 border-b p-5",
            "bg-state-override border-state-override-border",
          )}
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border-2 border-state-override-border bg-card">
            <ShieldAlert
              aria-hidden
              strokeWidth={2}
              className="size-5 text-state-override-icon"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <DialogTitle className="text-base font-bold text-state-override-foreground">
              {TEXT.TITLE}
            </DialogTitle>
            <DialogDescription className="text-sm text-state-override-foreground/90">
              {TEXT.SUBTITLE}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto p-5">
          {/* Progress */}
          <section>
            <SectionLabel>{TEXT.SECTION_PROGRESS}</SectionLabel>
            <ul className="mt-2 flex flex-col gap-1.5">
              {completedActions.filter((a) => a.success).map((a) => (
                <li
                  key={a.actionDefinitionId}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold",
                    "bg-state-granted border-state-granted-border text-state-granted-foreground",
                  )}
                >
                  <CheckCircle2 aria-hidden className="size-4 shrink-0 text-state-granted-icon" />
                  <span className="flex-1 truncate">{a.actionName}</span>
                  <span className="text-[10px] uppercase tracking-wider opacity-70">
                    {TEXT.COMPLETED_TAG}
                  </span>
                </li>
              ))}

              <li
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold",
                  "bg-state-warning border-state-warning-border text-state-warning-foreground",
                )}
              >
                <AlertTriangle aria-hidden className="size-4 shrink-0 text-state-warning-icon" />
                <span className="flex-1 truncate">{stoppedAtAction}</span>
                <span className="text-[10px] uppercase tracking-wider opacity-70">
                  {TEXT.STOPPED_AT_DETAIL}
                </span>
              </li>

              {remainingActions.map((name, idx) => (
                <li
                  key={`${name}-${idx}`}
                  className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground"
                >
                  <Circle aria-hidden className="size-4 shrink-0" />
                  <span className="flex-1 truncate">{name}</span>
                  <span className="text-[10px] uppercase tracking-wider opacity-70">
                    {TEXT.PENDING_TAG}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Validation errors — red */}
          <section>
            <SectionLabel>{TEXT.SECTION_ERRORS}</SectionLabel>
            <ul className="mt-2 flex flex-col gap-1.5">
              {validationErrors.map((check) => (
                <li
                  key={check.scanValidationId}
                  className={cn(
                    "flex items-start gap-2 rounded-md border-l-4 px-3 py-2 text-sm",
                    "bg-state-denied border-l-state-denied-icon text-state-denied-foreground",
                  )}
                >
                  <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-state-denied-icon" />
                  <div className="min-w-0">
                    <span className="font-semibold">{check.fieldLabel}:</span>{" "}
                    <span className="opacity-90">{check.message}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Decision context — orange */}
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-xs",
              "bg-state-override border-state-override-border text-state-override-foreground",
            )}
          >
            {TEXT.WARNING_PRE}{" "}
            <strong>{stoppedAtAction}</strong>
            {TEXT.WARNING_POST}
          </div>
        </div>

        <DialogFooter className="border-t border-border bg-muted/40 px-5 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            {TEXT.BTN_STOP}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              "bg-state-override-icon text-white",
              "hover:bg-state-override-icon/90 focus-visible:ring-state-override-icon/50",
            )}
          >
            {isLoading && <Loader2 className="animate-spin" />}
            {TEXT.BTN_CONTINUE}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}
