"use client";

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

const LABELS = {
  title: "Eliminar cuenta",
  subtitle: "Esta acción no se puede deshacer.",
  body: "Tu cuenta y datos de perfil serán eliminados permanentemente. Los datos del tenant no se verán afectados.",
  cancel: "Cancelar",
  confirm: "Eliminar mi cuenta",
  confirming: "Eliminando…",
} as const;

export interface DeleteAccountModalProps {
  isOpen: boolean;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteAccountModal({
  isOpen,
  isLoading,
  onConfirm,
  onCancel,
}: DeleteAccountModalProps) {
  const handleOpenChange = (open: boolean) => {
    if (!open && !isLoading) onCancel();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isLoading}
        className="max-w-md gap-0 overflow-hidden p-0"
      >
        {/* Header — destructive-themed */}
        <DialogHeader className="flex-row items-start gap-3 space-y-0 border-b border-destructive/20 bg-destructive/5 p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-destructive/30 bg-card">
            <AlertTriangle aria-hidden className="size-5 text-destructive" strokeWidth={2} />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <DialogTitle className="text-[15px] font-bold text-destructive">
              {LABELS.title}
            </DialogTitle>
            <DialogDescription className="text-xs text-destructive/90">
              {LABELS.subtitle}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="p-5">
          <p className="text-sm leading-relaxed text-muted-foreground">{LABELS.body}</p>
        </div>

        {/* Footer */}
        <DialogFooter className="border-t bg-muted/40 px-5 py-3.5">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            {LABELS.cancel}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={isLoading}>
            {isLoading && <Loader2 className="animate-spin" />}
            {isLoading ? LABELS.confirming : LABELS.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
