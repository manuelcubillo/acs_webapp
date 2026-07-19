"use client";

/**
 * ConfirmDialog
 *
 * Generic confirmation modal for a single side-effecting action. Composed on the
 * shared `Dialog` primitive (see `src/components/ui/dialog.tsx`) — deliberately
 * NOT a new UI primitive, since `Dialog` already serves. Mirrors the destructive
 * confirmation pattern established by `DeleteAccountModal`.
 *
 * `tone` picks the accent: `default` (neutral) or `destructive` (danger zone,
 * e.g. archiving). It maps only to the `destructive` Layer-2 semantic token — it
 * never touches the reserved `--state-*` scan/action colours (constraint #18).
 */

import { Loader2 } from "lucide-react";

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

export type ConfirmDialogTone = "default" | "destructive";

export interface ConfirmDialogProps {
  open: boolean;
  isLoading?: boolean;
  /** Modal heading. */
  title: string;
  /** Short subtitle under the title (optional). */
  description?: string;
  /** Icon shown in the header badge. */
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  /** Body content — plain text or richer nodes (e.g. a highlighted count). */
  children?: React.ReactNode;
  confirmLabel: string;
  confirmingLabel: string;
  cancelLabel: string;
  tone?: ConfirmDialogTone;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  isLoading = false,
  title,
  description,
  icon: Icon,
  children,
  confirmLabel,
  confirmingLabel,
  cancelLabel,
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const isDestructive = tone === "destructive";

  const handleOpenChange = (next: boolean) => {
    if (!next && !isLoading) onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isLoading}
        className="max-w-md gap-0 overflow-hidden p-0"
      >
        {/* Header */}
        <DialogHeader
          className={cn(
            "flex-row items-start gap-3 space-y-0 border-b p-5",
            isDestructive
              ? "border-destructive/20 bg-destructive/5"
              : "border-border bg-muted/40",
          )}
        >
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg border bg-card",
              isDestructive ? "border-destructive/30" : "border-border",
            )}
          >
            <Icon
              aria-hidden
              className={cn(
                "size-5",
                isDestructive ? "text-destructive" : "text-foreground",
              )}
              strokeWidth={2}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <DialogTitle
              className={cn(
                "text-[15px] font-bold",
                isDestructive ? "text-destructive" : "text-foreground",
              )}
            >
              {title}
            </DialogTitle>
            {description && (
              <DialogDescription
                className={cn(
                  "text-xs",
                  isDestructive ? "text-destructive/90" : "text-muted-foreground",
                )}
              >
                {description}
              </DialogDescription>
            )}
          </div>
        </DialogHeader>

        {/* Body */}
        {children && (
          <div className="p-5 text-sm leading-relaxed text-muted-foreground">
            {children}
          </div>
        )}

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
            variant={isDestructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="animate-spin" />}
            {isLoading ? confirmingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
