"use client";

/**
 * ReviewStep (Step 4)
 *
 * Shows a read-only summary of all wizard data before submission.
 */

import {
  Type, Hash, ToggleLeft, Calendar, Camera, List,
  TrendingUp, TrendingDown, CheckSquare, Square,
  AlertCircle, AlertTriangle, CheckCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  BasicInfo,
  FieldDefinitionDraft,
  ActionDefinitionDraft,
  ScanValidationDraft,
  FieldType,
  ActionType,
  ScanValidationSeverity,
} from "@/hooks/useCardTypeWizard";

const TEXT = {
  HEADING:      "Revisión final",
  HEADING_EDIT: "guardar los cambios",
  HEADING_NEW:  "crear el tipo de tarjeta",
  ERROR_TITLE:  "Error al guardar",
  S_BASIC:      "Información básica",
  KV_NAME:      "Nombre",
  KV_DESC:      "Descripción",
  NO_DESC:      "Sin descripción",
  EMPTY_FIELDS: "No se han definido campos.",
  EMPTY_ACTIONS: "No se han definido acciones.",
  EMPTY_SCANVAL: "No se han definido validaciones de escaneo.",
  REQUIRED:     "Obligatorio",
  READY_PRE:    "Todo listo. Pulsa",
  READY_EDIT:   "«Guardar cambios»",
  READY_NEW:    "«Crear tipo de tarjeta»",
  READY_POST:   "para continuar.",
} as const;

// Decorative field/action category accents (Tailwind palette + brand/neutral).
const FIELD_META: Record<FieldType, { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; chip: string; label: string }> = {
  text:    { icon: Type,       chip: "bg-accent text-primary", label: "Texto" },
  number:  { icon: Hash,       chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", label: "Número" },
  boolean: { icon: ToggleLeft, chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400", label: "Sí/No" },
  date:    { icon: Calendar,   chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400", label: "Fecha" },
  photo:   { icon: Camera,     chip: "bg-pink-500/15 text-pink-600 dark:text-pink-400", label: "Foto" },
  select:  { icon: List,       chip: "bg-sky-500/15 text-sky-600 dark:text-sky-400", label: "Selección" },
};

const ACTION_META: Record<ActionType, { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; chip: string; label: string }> = {
  increment: { icon: TrendingUp,   chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", label: "Incrementar" },
  decrement: { icon: TrendingDown, chip: "bg-rose-500/15 text-rose-600 dark:text-rose-400", label: "Decrementar" },
  check:     { icon: CheckSquare,  chip: "bg-accent text-primary", label: "Marcar Sí" },
  uncheck:   { icon: Square,       chip: "bg-muted text-muted-foreground", label: "Marcar No" },
};

// Severity IS an access-control validation outcome → state tokens.
const SEVERITY_META: Record<ScanValidationSeverity, { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; chip: string; badge: string; label: string }> = {
  error:   { icon: AlertCircle,    chip: "bg-state-denied text-state-denied-icon", badge: "bg-state-denied border-state-denied-border text-state-denied-foreground", label: "Error" },
  warning: { icon: AlertTriangle,  chip: "bg-state-warning text-state-warning-icon", badge: "bg-state-warning border-state-warning-border text-state-warning-foreground", label: "Aviso" },
};

interface ReviewStepProps {
  basicInfo: BasicInfo;
  fields: FieldDefinitionDraft[];
  actions: ActionDefinitionDraft[];
  scanValidations: ScanValidationDraft[];
  isEdit: boolean;
  submitError: string | null;
}

export default function ReviewStep({
  basicInfo,
  fields,
  actions,
  scanValidations,
  isEdit,
  submitError,
}: ReviewStepProps) {
  // Build field lookup by tempId for display
  const fieldByTempId = new Map(fields.map((f) => [f.tempId, f]));

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="mb-1.5 font-heading text-xl font-bold text-foreground">
          {TEXT.HEADING}
        </div>
        <div className="text-sm text-muted-foreground">
          Revisa el esquema antes de {isEdit ? TEXT.HEADING_EDIT : TEXT.HEADING_NEW}.
        </div>
      </div>

      {/* Error alert */}
      {submitError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{TEXT.ERROR_TITLE}</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      {/* Basic info card */}
      <Section title={TEXT.S_BASIC}>
        <div className="grid grid-cols-[auto_1fr] items-start gap-x-5 gap-y-2">
          <KV label={TEXT.KV_NAME} value={basicInfo.name} />
          <KV
            label={TEXT.KV_DESC}
            value={basicInfo.description || <span className="italic text-muted-foreground">{TEXT.NO_DESC}</span>}
          />
        </div>
      </Section>

      {/* Fields */}
      <Section title={`Campos (${fields.length})`}>
        {fields.length === 0 ? (
          <EmptyNote>{TEXT.EMPTY_FIELDS}</EmptyNote>
        ) : (
          <div className="flex flex-col gap-2">
            {fields.map((field, i) => {
              const meta = FIELD_META[field.fieldType];
              const Icon = meta.icon;
              return (
                <div
                  key={field.tempId}
                  className="flex items-center gap-3 rounded-[10px] border bg-muted/40 px-3.5 py-2.5"
                >
                  <div className="flex size-5.5 shrink-0 items-center justify-center text-[11px] font-bold text-muted-foreground">
                    {i + 1}
                  </div>
                  <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", meta.chip)}>
                    <Icon className="size-3.5" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-foreground">
                      {field.label}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {field.name}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Badge className={meta.chip}>{meta.label}</Badge>
                    {field.isRequired && <Badge variant="secondary">{TEXT.REQUIRED}</Badge>}
                    {field.validationRules && field.validationRules.rules.length > 0 && (
                      <Badge variant="secondary">
                        {field.validationRules.rules.length} regla{field.validationRules.rules.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Actions */}
      <Section title={`Acciones (${actions.length})`}>
        {actions.length === 0 ? (
          <EmptyNote>{TEXT.EMPTY_ACTIONS}</EmptyNote>
        ) : (
          <div className="flex flex-col gap-2">
            {actions.map((action) => {
              const meta = ACTION_META[action.actionType];
              const Icon = meta.icon;
              const targetField = fieldByTempId.get(action.targetFieldTempId);
              const amountText = action.actionType === "increment" || action.actionType === "decrement"
                ? ` · ${action.config?.amount ?? 1}`
                : "";
              return (
                <div
                  key={action.tempId}
                  className="flex items-center gap-3 rounded-[10px] border bg-muted/40 px-3.5 py-2.5"
                >
                  <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", meta.chip)}>
                    <Icon className="size-3.5" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-foreground">
                      {action.name}
                    </span>
                    {targetField && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        → {targetField.label}{amountText}
                      </span>
                    )}
                  </div>
                  <Badge className={meta.chip}>{meta.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Scan Validations */}
      <Section title={`Validaciones de escaneo (${scanValidations.length})`}>
        {scanValidations.length === 0 ? (
          <EmptyNote>{TEXT.EMPTY_SCANVAL}</EmptyNote>
        ) : (
          <div className="flex flex-col gap-2">
            {scanValidations.map((sv) => {
              const targetField = fieldByTempId.get(sv.fieldTempId);
              const sm = SEVERITY_META[sv.severity];
              const SvIcon = sm.icon;
              return (
                <div
                  key={sv.tempId}
                  className="flex items-start gap-3 rounded-[10px] border bg-muted/40 px-3.5 py-2.5"
                >
                  <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", sm.chip)}>
                    <SvIcon className="size-3.5" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-foreground">
                      {sv.errorMessage}
                    </span>
                    {targetField && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {targetField.label} · {sv.rule}
                      </div>
                    )}
                  </div>
                  <Badge className={cn("shrink-0", sm.badge)}>{sm.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Summary callout — CRUD readiness confirmation, neutral (not state). */}
      <Alert>
        <CheckCircle />
        <AlertDescription className="text-card-foreground">
          {TEXT.READY_PRE}{" "}
          <strong>{isEdit ? TEXT.READY_EDIT : TEXT.READY_NEW}</strong>{" "}
          {TEXT.READY_POST}
        </AlertDescription>
      </Alert>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="border-b px-4.5 py-3.5 font-heading text-sm font-bold text-foreground">
        {title}
      </div>
      <div className="px-4.5 py-4">{children}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <div className="pt-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm text-foreground">{value}</div>
    </>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm italic text-muted-foreground">{children}</div>
  );
}
