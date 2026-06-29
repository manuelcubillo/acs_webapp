"use client";

/**
 * ConfirmActionModal — generic confirmation modal for member management actions.
 * Supports a default (neutral) and destructive variant.
 *
 * Built on the shadcn Dialog primitive. The "destructive" flag frames an
 * irreversible/disabling action and maps to the --destructive role; it is NOT
 * an access-control state, so --state-* tokens are intentionally not used here.
 */

import { AlertTriangle, Loader2, Info } from "lucide-react";

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

const TEXT = {
  PROCESSING: "Procesando…",
} as const;

export interface ConfirmActionModalProps {
  isOpen: boolean;
  isLoading: boolean;
  /** Modal title. */
  title: string;
  /** Subtitle shown under the title (e.g. "Esta acción no se puede deshacer."). */
  subtitle?: string;
  /** Body text. */
  body: string;
  /** Cancel button label. */
  cancelLabel?: string;
  /** Confirm button label. */
  confirmLabel: string;
  /** Label shown while loading. */
  confirmingLabel?: string;
  /** When true, uses destructive styling. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmActionModal({
  isOpen,
  isLoading,
  title,
  subtitle,
  body,
  cancelLabel = "Cancelar",
  confirmLabel,
  confirmingLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmActionModalProps) {
  const handleOpenChange = (open: boolean) => {
    if (!open && !isLoading) onCancel();
  };

  const Icon = destructive ? AlertTriangle : Info;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isLoading}
        className="max-w-md gap-0 overflow-hidden p-0"
      >
        {/* Header */}
        <DialogHeader
          className={cn(
            "flex-row items-start gap-3 space-y-0 border-b p-5",
            destructive ? "bg-destructive/5" : "bg-muted/40",
          )}
        >
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg border bg-card",
              destructive ? "border-destructive/30" : "border-border",
            )}
          >
            <Icon
              aria-hidden
              strokeWidth={2}
              className={cn(
                "size-5",
                destructive ? "text-destructive" : "text-primary",
              )}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <DialogTitle
              className={cn(
                "text-[15px] font-bold",
                destructive ? "text-destructive" : "text-foreground",
              )}
            >
              {title}
            </DialogTitle>
            {subtitle && (
              <DialogDescription
                className={cn(
                  "text-xs",
                  destructive ? "text-destructive/90" : "text-muted-foreground",
                )}
              >
                {subtitle}
              </DialogDescription>
            )}
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="p-5">
          <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>

        {/* Footer */}
        <DialogFooter className="border-t bg-muted/40 px-5 py-3.5">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="animate-spin" />}
            {isLoading ? confirmingLabel ?? TEXT.PROCESSING : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
