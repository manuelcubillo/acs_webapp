"use client";

/**
 * TemplatePicker — modal that lets the user load a starter template into
 * the current design. Only templates whose kind matches the design's kind
 * are shown. Each tile previews the template via renderDesignToDataURL.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import {
  SAMPLE_TEMPLATES,
  cloneTemplateLayout,
  type DesignTemplate,
} from "@/lib/card-designs/templates";
import type { CardDesignLayout } from "@/lib/card-designs/types";
import { renderDesignToDataURL } from "@/lib/card-designs/render";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const LABELS = {
  title: "Cargar plantilla",
  subtitle:
    "Las plantillas reemplazan completamente el diseño actual. Después puedes editar cualquier elemento.",
  empty: "No hay plantillas disponibles para este tipo de diseño.",
  apply: "Usar esta plantilla",
  cancel: "Cancelar",
  thumbLoading: "Generando vista previa…",
  customizable: "Personalizable",
  warningTitle: "Reemplazar diseño actual",
  warningBody:
    "Vas a sobrescribir el diseño actual con la plantilla seleccionada. Esta acción se puede deshacer con Ctrl+Z.",
  warningConfirm: "Reemplazar",
  close: "Cerrar",
} as const;

interface Props {
  /** Restrict the picker to templates of this kind (matches the current design). */
  kind: "card" | "passbook";
  /** True when the current design has nodes — used to show the replace warning. */
  designHasContent: boolean;
  onApply: (layout: CardDesignLayout) => void;
  onClose: () => void;
}

export default function TemplatePicker({
  kind,
  designHasContent,
  onApply,
  onClose,
}: Props) {
  const templates = useMemo(
    () => SAMPLE_TEMPLATES.filter((t) => t.kind === kind),
    [kind],
  );

  const [pendingTemplate, setPendingTemplate] = useState<DesignTemplate | null>(null);

  function handleApply(template: DesignTemplate) {
    if (designHasContent) {
      setPendingTemplate(template);
      return;
    }
    onApply(cloneTemplateLayout(template));
    onClose();
  }

  function confirmApply() {
    if (!pendingTemplate) return;
    onApply(cloneTemplateLayout(pendingTemplate));
    setPendingTemplate(null);
    onClose();
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-h-[90vh] max-w-[920px] gap-0 overflow-hidden p-0">
          {/* Header */}
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b p-5">
            <Sparkles className="size-4.5 text-primary" strokeWidth={1.8} />
            <div className="flex-1">
              <DialogTitle className="font-heading text-base font-bold">
                {LABELS.title}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                {LABELS.subtitle}
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto bg-muted/40 p-5">
            {templates.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {LABELS.empty}
              </p>
            ) : (
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                {templates.map((tpl) => (
                  <TemplateCard
                    key={tpl.id}
                    template={tpl}
                    onApply={() => handleApply(tpl)}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation modal for replace warning */}
      {pendingTemplate && (
        <ConfirmReplace
          template={pendingTemplate}
          onCancel={() => setPendingTemplate(null)}
          onConfirm={confirmApply}
        />
      )}
    </>
  );
}

// ─── Template card ──────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onApply,
}: {
  template: DesignTemplate;
  onApply: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [thumbErr, setThumbErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    renderDesignToDataURL({
      layout: template.layout,
      fieldValues: {},
      photoValues: {},
      cardCode: "VRD-DEMO-0001",
      scale: 1,
    })
      .then((url) => {
        if (!cancelled) setThumb(url);
      })
      .catch(() => {
        if (!cancelled) setThumbErr(true);
      });
    return () => {
      cancelled = true;
    };
  }, [template]);

  const aspect =
    template.layout.canvas.width / Math.max(1, template.layout.canvas.height);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Thumbnail — aspectRatio is data-driven (template dimensions). */}
      <div
        className="flex items-center justify-center bg-muted p-3"
        style={{ aspectRatio: String(aspect) }}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={template.name}
            className="max-h-full max-w-full rounded-md object-contain shadow-md"
          />
        ) : thumbErr ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <Loader2 className="size-5 animate-spin text-muted-foreground" strokeWidth={2} />
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2 px-3.5 pt-3 pb-3.5">
        <div>
          <div className="font-heading text-sm font-bold text-foreground">
            {template.name}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {template.description}
          </div>
        </div>

        {template.customizableHints.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {template.customizableHints.map((hint) => (
              <Badge key={hint} className="bg-accent text-accent-foreground">
                {hint}
              </Badge>
            ))}
          </div>
        )}

        <Button type="button" onClick={onApply} className="mt-1">
          {LABELS.apply}
        </Button>
      </div>
    </div>
  );
}

// ─── Confirmation overlay ───────────────────────────────────────────────────

function ConfirmReplace({
  template,
  onCancel,
  onConfirm,
}: {
  template: DesignTemplate;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{LABELS.warningTitle}</DialogTitle>
          <DialogDescription>{LABELS.warningBody}</DialogDescription>
        </DialogHeader>
        <p className="text-xs italic text-muted-foreground">{template.name}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {LABELS.cancel}
          </Button>
          <Button onClick={onConfirm}>{LABELS.warningConfirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
