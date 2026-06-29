"use client";

import { useEffect, useState } from "react";
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

const CONFIRM_PHRASE = "confirmar borrado de datos";

const LABELS = {
  title: "Eliminar cuenta y organización",
  subtitle: "Todos los datos serán eliminados permanentemente.",
  warningIntro: (tenantName: string) =>
    `Eres el único master activo de ${tenantName}. Si eliminas tu cuenta, toda la información de la organización será eliminada de forma permanente e irrecuperable.`,
  warningListTitle: "Se eliminará permanentemente:",
  warningItems: [
    "Todos los tipos de carnet y sus definiciones",
    "Todos los carnets emitidos y sus datos",
    "El historial completo de acciones",
    "La configuración del panel",
    "Todos los miembros del tenant",
  ],
  phraseLabel: "Para confirmar, escribe exactamente:",
  phrasePlaceholder: CONFIRM_PHRASE,
  cancel: "Cancelar",
  confirm: "Eliminar cuenta y todos los datos",
  confirming: "Eliminando…",
} as const;

export interface DeleteTenantAccountModalProps {
  isOpen: boolean;
  isLoading: boolean;
  tenantName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteTenantAccountModal({
  isOpen,
  isLoading,
  tenantName,
  onConfirm,
  onCancel,
}: DeleteTenantAccountModalProps) {
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const canConfirm = confirmPhrase.trim() === CONFIRM_PHRASE;

  useEffect(() => {
    if (!isOpen) setConfirmPhrase("");
  }, [isOpen]);

  const handleOpenChange = (open: boolean) => {
    if (!open && !isLoading) onCancel();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isLoading}
        className="max-w-[500px] gap-0 overflow-hidden p-0"
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
        <div className="flex flex-col gap-3.5 p-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {LABELS.warningIntro(tenantName)}
          </p>

          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-xs leading-relaxed text-destructive">
            <strong>{LABELS.warningListTitle}</strong>
            <ul className="mt-1.5 list-disc pl-4.5">
              {LABELS.warningItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div>
            <Label htmlFor="delete-tenant-phrase" className="mb-1.5 block text-xs font-semibold text-foreground">
              {LABELS.phraseLabel}{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-destructive">
                {CONFIRM_PHRASE}
              </code>
            </Label>
            <Input
              id="delete-tenant-phrase"
              type="text"
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              placeholder={LABELS.phrasePlaceholder}
              disabled={isLoading}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="border-t bg-muted/40 px-5 py-3.5">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            {LABELS.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={!canConfirm || isLoading}
          >
            {isLoading && <Loader2 className="animate-spin" />}
            {isLoading ? LABELS.confirming : LABELS.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
