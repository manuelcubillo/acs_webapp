"use client";

/**
 * ConfirmActionModal
 *
 * Shown when an operator attempts to execute a manual action on a card that
 * has error-level validation failures AND allow_override_on_error is enabled.
 *
 * State semantics:
 *   - The modal frames an OVERRIDE decision → state-override (orange).
 *   - The error list inside uses state-denied (red) — these are the blocking
 *     failures the operator is overriding.
 *   - The "you are about to execute X" context uses muted neutral.
 *
 * Behavior preserved EXACTLY — only presentation changes.
 * The execution is logged with operator_override=true on confirm.
 */

import { useEffect, useRef } from "react";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";

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

const TEXT = {
  TITLE:        "Errores de validación detectados",
  SUBTITLE:     "Este carnet tiene errores que requieren confirmación.",
  ABOUT_TO:     "Vas a ejecutar:",
  WARNING:      "Si continúas, la acción quedará registrada como intervención manual del operador.",
  BTN_CANCEL:   "Cancelar",
  BTN_CONFIRM:  "Confirmar y ejecutar",
} as const;

export interface ConfirmActionModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  actionName: string;
  validationErrors: ScanValidationCheck[];
  isLoading?: boolean;
}

export default function ConfirmActionModal({
  isOpen,
  onConfirm,
  onCancel,
  actionName,
  validationErrors,
  isLoading = false,
}: ConfirmActionModalProps) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Focus cancel on open — safer default.
  useEffect(() => {
    if (isOpen) {
      // Defer one tick so Dialog's portal has mounted.
      const t = setTimeout(() => cancelBtnRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const handleOpenChange = (open: boolean) => {
    if (!open && !isLoading) onCancel();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isLoading}
        className="max-w-lg gap-0 overflow-hidden p-0"
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

        <div className="flex flex-col gap-4 p-5">
          {/* Validation errors */}
          <ul className="flex flex-col gap-1.5">
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

          {/* Action context */}
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {TEXT.ABOUT_TO}{" "}
            <strong className="text-foreground">{actionName}</strong>
          </div>

          {/* Decision warning */}
          <p
            className={cn(
              "rounded-md border px-3 py-2 text-xs",
              "bg-state-override border-state-override-border text-state-override-foreground",
            )}
          >
            {TEXT.WARNING}
          </p>
        </div>

        <DialogFooter className="border-t border-border bg-muted/40 px-5 py-3">
          <Button
            ref={cancelBtnRef}
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            {TEXT.BTN_CANCEL}
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
            {TEXT.BTN_CONFIRM}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
