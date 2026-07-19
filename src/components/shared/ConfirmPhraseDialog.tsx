"use client";

/**
 * ConfirmPhraseDialog
 *
 * Strong confirmation modal for an irreversible, destructive action: the user
 * must type an exact phrase before the confirm button enables. Generalized from
 * `settings/account/DeleteTenantAccountModal` (which stays as its bespoke
 * caller) so the trash view's hard-delete and empty-trash flows reuse the same
 * pattern instead of hand-rolling another one.
 *
 * Composed on the shared `Dialog` primitive — NOT a new UI primitive. Always
 * destructive-themed: it maps only to the `destructive` Layer-2 semantic token
 * and never touches the reserved `--state-*` scan/action colours (constraint #18).
 */

import { useId, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ConfirmPhraseDialogProps {
  open: boolean;
  isLoading?: boolean;
  /** Modal heading. */
  title: string;
  /** Short subtitle under the title (optional). */
  description?: string;
  /** Intro paragraph shown above the warning box (optional). */
  children?: React.ReactNode;
  /** Highlighted warning content — e.g. the cascade size (optional). */
  warning?: React.ReactNode;
  /** The exact phrase the user must type to enable confirmation. */
  confirmPhrase: string;
  /** Instruction shown above the phrase input. */
  phraseLabel: string;
  confirmLabel: string;
  confirmingLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmPhraseDialog({
  open,
  isLoading = false,
  title,
  description,
  children,
  warning,
  confirmPhrase,
  phraseLabel,
  confirmLabel,
  confirmingLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmPhraseDialogProps) {
  const inputId = useId();
  const [typed, setTyped] = useState("");
  const canConfirm = typed.trim() === confirmPhrase;

  // Clear the field whenever the dialog transitions closed, so a reopen starts
  // blank. Done by adjusting state during render (tracking the previous `open`)
  // rather than in an effect — the React-recommended pattern, and it avoids the
  // cascading re-render an effect-based reset would cause.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setTyped("");
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && !isLoading) onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isLoading}
        className="max-w-[500px] gap-0 overflow-hidden p-0"
      >
        {/* Header — destructive-themed */}
        <DialogHeader className="flex-row items-start gap-3 space-y-0 border-b border-destructive/20 bg-destructive/5 p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-destructive/30 bg-card">
            <AlertTriangle
              aria-hidden
              className="size-5 text-destructive"
              strokeWidth={2}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <DialogTitle className="text-[15px] font-bold text-destructive">
              {title}
            </DialogTitle>
            {description && (
              <DialogDescription className="text-xs text-destructive/90">
                {description}
              </DialogDescription>
            )}
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex flex-col gap-3.5 p-5">
          {children && (
            <div className="text-sm leading-relaxed text-muted-foreground">
              {children}
            </div>
          )}

          {warning && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-xs leading-relaxed text-destructive">
              {warning}
            </div>
          )}

          <div>
            <Label
              htmlFor={inputId}
              className="mb-1.5 block text-xs font-semibold text-foreground"
            >
              {phraseLabel}{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-destructive">
                {confirmPhrase}
              </code>
            </Label>
            <Input
              id={inputId}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmPhrase}
              disabled={isLoading}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
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
            variant="destructive"
            onClick={onConfirm}
            disabled={!canConfirm || isLoading}
          >
            {isLoading && <Loader2 className="animate-spin" />}
            {isLoading ? confirmingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
