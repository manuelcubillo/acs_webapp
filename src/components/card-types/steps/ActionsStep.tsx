"use client";

/**
 * ActionsStep (Step 2)
 *
 * Define action definitions for the card type.
 * Supports: increment, decrement, check, uncheck.
 * Each action targets a specific field compatible with its type.
 *
 * The "Auto-ejecutar al escanear" toggle marks an action as is_auto_execute,
 * meaning it runs automatically every time an operator does an operational scan.
 */

import { useState } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown, CheckSquare, Square, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  ActionDefinitionDraft,
  ActionType,
  FieldDefinitionDraft,
} from "@/hooks/useCardTypeWizard";

// ─── Action type metadata ──────────────────────────────────────────────────────
// Colors are decorative category accents (NOT access-control state) — Tailwind
// palette + brand/neutral tokens, consistent with CardActions.tsx.

interface ActionTypeMeta {
  label: string;
  description: string;
  fieldFilter: "number" | "boolean";
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Subtle icon chip (bg + text). */
  chip: string;
  /** Solid icon chip when its option is selected. */
  chipSolid: string;
  /** Border + bg of the option card when selected. */
  cardSelected: string;
  hasAmount: boolean;
}

const ACTION_TYPE_META: Record<ActionType, ActionTypeMeta> = {
  increment: {
    label: "Incrementar",
    description: "Suma una cantidad a un campo numérico",
    fieldFilter: "number",
    icon: TrendingUp,
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    chipSolid: "bg-emerald-600 text-white",
    cardSelected: "border-emerald-500 bg-emerald-500/10",
    hasAmount: true,
  },
  decrement: {
    label: "Decrementar",
    description: "Resta una cantidad a un campo numérico",
    fieldFilter: "number",
    icon: TrendingDown,
    chip: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    chipSolid: "bg-rose-600 text-white",
    cardSelected: "border-rose-500 bg-rose-500/10",
    hasAmount: true,
  },
  check: {
    label: "Marcar como Sí",
    description: "Establece un campo Sí/No a verdadero",
    fieldFilter: "boolean",
    icon: CheckSquare,
    chip: "bg-accent text-primary",
    chipSolid: "bg-primary text-primary-foreground",
    cardSelected: "border-primary bg-accent",
    hasAmount: false,
  },
  uncheck: {
    label: "Marcar como No",
    description: "Establece un campo Sí/No a falso",
    fieldFilter: "boolean",
    icon: Square,
    chip: "bg-muted text-muted-foreground",
    chipSolid: "bg-muted-foreground text-background",
    cardSelected: "border-border bg-muted",
    hasAmount: false,
  },
};

const ACTION_TYPE_ORDER: ActionType[] = ["increment", "decrement", "check", "uncheck"];

const TEXT = {
  HEADING:     "Acciones de tarjeta",
  HEADING_SUB:
    "Las acciones modifican campos específicos de la tarjeta cuando el operador las ejecuta. Por ejemplo: incrementar un contador de asistencia o marcar un campo como completado.",
  AUTO:        "Auto",
  AUTO_TITLE:  "Auto-ejecutar al escanear",
  DELETE:      "Eliminar acción",
  NEW_TITLE:   "Nueva acción",
  TYPE_LABEL:  "Tipo de acción",
  TARGET_LABEL: "Campo destino",
  TARGET_PLACEHOLDER: "— Selecciona un campo —",
  NO_FIELDS_PRE: "No hay campos de tipo",
  NO_FIELDS_POST: "definidos. Añade un campo compatible en el paso anterior.",
  AMOUNT_LABEL: "Cantidad",
  AMOUNT_HINT: "(por defecto: 1)",
  NAME_LABEL:  "Nombre del botón",
  NAME_PLACEHOLDER: "Ej: Registrar asistencia",
  AUTO_DESC:
    "Esta acción se ejecutará automáticamente cada vez que un operador realice un escaneo operacional. Útil para registrar entradas/salidas o contadores de visitas.",
  CANCEL:      "Cancelar",
  ADD:         "Añadir acción",
  EMPTY_TITLE: "Sin acciones definidas",
  EMPTY_BODY:  "Puedes continuar sin acciones y añadirlas después.",
  FIELD_NUMBER: "número",
  FIELD_BOOLEAN: "Sí/No",
} as const;

// ─── Component ─────────────────────────────────────────────────────────────────

interface ActionsStepProps {
  fields: FieldDefinitionDraft[];
  actions: ActionDefinitionDraft[];
  onAdd: (draft: Omit<ActionDefinitionDraft, "tempId" | "position">) => void;
  onRemove: (tempId: string) => void;
}

const EMPTY_AMOUNT = "";

export default function ActionsStep({ fields, actions, onAdd, onRemove }: ActionsStepProps) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ActionType>("increment");
  const [newTargetTempId, setNewTargetTempId] = useState("");
  const [newAmount, setNewAmount] = useState<string>(EMPTY_AMOUNT);
  const [newIsAutoExecute, setNewIsAutoExecute] = useState(false);

  const meta = ACTION_TYPE_META[newType];
  const fieldTypeLabel = meta.fieldFilter === "number" ? TEXT.FIELD_NUMBER : TEXT.FIELD_BOOLEAN;

  // Filter fields compatible with selected action type
  const compatibleFields = fields.filter((f) => f.fieldType === meta.fieldFilter);

  function handleTypeChange(type: ActionType) {
    setNewType(type);
    setNewTargetTempId("");
    setNewAmount(EMPTY_AMOUNT);
  }

  function handleAdd() {
    if (!newName.trim() || !newTargetTempId) return;
    const amount = meta.hasAmount ? (parseFloat(newAmount) || 1) : undefined;
    onAdd({
      name: newName.trim(),
      actionType: newType,
      targetFieldTempId: newTargetTempId,
      config: meta.hasAmount ? { amount } : null,
      icon: null,
      color: null,
      isAutoExecute: newIsAutoExecute,
    });
    resetForm();
  }

  function resetForm() {
    setShowForm(false);
    setNewName("");
    setNewType("increment");
    setNewTargetTempId("");
    setNewAmount(EMPTY_AMOUNT);
    setNewIsAutoExecute(false);
  }

  const canAdd = newName.trim().length > 0 && newTargetTempId.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <div className="mb-1.5 font-heading text-xl font-bold text-foreground">
          {TEXT.HEADING}
        </div>
        <div className="text-sm text-muted-foreground">{TEXT.HEADING_SUB}</div>
      </div>

      {/* Existing actions list */}
      {actions.length > 0 && (
        <div className="flex flex-col gap-2">
          {actions.map((action) => {
            const m = ACTION_TYPE_META[action.actionType];
            const Icon = m.icon;
            const targetField = fields.find((f) => f.tempId === action.targetFieldTempId);
            const amountLabel = m.hasAmount && action.config?.amount != null
              ? ` · ${action.config.amount}`
              : "";
            return (
              <div
                key={action.tempId}
                className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3"
              >
                <div className={cn("flex size-9.5 shrink-0 items-center justify-center rounded-[10px]", m.chip)}>
                  <Icon className="size-4.5" strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-heading text-sm font-semibold text-foreground">
                    {action.name}
                    {action.isAutoExecute && (
                      <Badge
                        title={TEXT.AUTO_TITLE}
                        className="border-amber-400 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      >
                        <Zap strokeWidth={2} />
                        {TEXT.AUTO}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {m.label}{amountLabel}
                    {targetField && (
                      <> · <span className="text-foreground/80">{targetField.label}</span></>
                    )}
                  </div>
                </div>
                <Badge className={cn("shrink-0", m.chip)}>{m.label}</Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => onRemove(action.tempId)}
                  title={TEXT.DELETE}
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 strokeWidth={1.8} />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <div className="rounded-xl border bg-muted/40 p-5">
          <div className="mb-4 text-sm font-semibold text-foreground">
            {TEXT.NEW_TITLE}
          </div>

          {/* Action type */}
          <div className="mb-4">
            <Label>{TEXT.TYPE_LABEL}</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {ACTION_TYPE_ORDER.map((type) => {
                const m = ACTION_TYPE_META[type];
                const Icon = m.icon;
                const selected = newType === type;
                return (
                  <label
                    key={type}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-[10px] border-2 px-3 py-2.5 transition-all",
                      selected ? m.cardSelected : "border-border bg-card",
                    )}
                  >
                    <input
                      type="radio"
                      name="actionType"
                      value={type}
                      checked={selected}
                      onChange={() => handleTypeChange(type)}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", selected ? m.chipSolid : "bg-muted text-muted-foreground")}>
                      <Icon className="size-3.5" strokeWidth={1.8} />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground">{m.label}</div>
                      <div className="text-[11px] leading-tight text-muted-foreground">{m.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Target field */}
          <div className="mb-4">
            <Label>
              {TEXT.TARGET_LABEL} <span className="text-destructive">*</span>
              <span className="ml-1.5 font-normal text-muted-foreground">
                (campos de tipo {fieldTypeLabel})
              </span>
            </Label>
            {compatibleFields.length === 0 ? (
              <div className="mt-2 rounded-md border border-amber-400/50 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                {TEXT.NO_FIELDS_PRE} {fieldTypeLabel} {TEXT.NO_FIELDS_POST}
              </div>
            ) : (
              <Select value={newTargetTempId} onValueChange={setNewTargetTempId}>
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue placeholder={TEXT.TARGET_PLACEHOLDER} />
                </SelectTrigger>
                <SelectContent>
                  {compatibleFields.map((f) => (
                    <SelectItem key={f.tempId} value={f.tempId}>
                      {f.label} ({f.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Amount (increment/decrement only) */}
          {meta.hasAmount && (
            <div className="mb-4">
              <Label>
                {TEXT.AMOUNT_LABEL}{" "}
                <span className="font-normal text-muted-foreground">{TEXT.AMOUNT_HINT}</span>
              </Label>
              <Input
                type="number"
                min="0.01"
                step="any"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="1"
                className="mt-1.5 max-w-40"
              />
            </div>
          )}

          {/* Action name */}
          <div className="mb-4">
            <Label htmlFor="action-name">
              {TEXT.NAME_LABEL} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="action-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={TEXT.NAME_PLACEHOLDER}
              className="mt-1.5"
              autoFocus
            />
          </div>

          {/* Auto-execute toggle */}
          <div className="mb-5">
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-3 transition-colors",
                newIsAutoExecute
                  ? "border-amber-400 bg-amber-500/10"
                  : "border-border bg-muted/40",
              )}
            >
              <Checkbox
                checked={newIsAutoExecute}
                onCheckedChange={(checked) => setNewIsAutoExecute(checked === true)}
                className="mt-0.5"
              />
              <div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Zap
                    className={cn("size-3.5", newIsAutoExecute ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}
                    strokeWidth={2}
                  />
                  {TEXT.AUTO_TITLE}
                </div>
                <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {TEXT.AUTO_DESC}
                </div>
              </div>
            </label>
          </div>

          <div className="flex gap-2.5">
            <Button variant="ghost" onClick={resetForm}>
              {TEXT.CANCEL}
            </Button>
            <Button onClick={handleAdd} disabled={!canAdd}>
              {TEXT.ADD}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          onClick={() => setShowForm(true)}
          className="self-start"
        >
          <Plus strokeWidth={2} />
          {TEXT.ADD}
        </Button>
      )}

      {/* Empty state */}
      {actions.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed bg-muted px-6 py-9 text-center text-muted-foreground">
          <div className="mb-2 text-3xl">⚡</div>
          <div className="text-sm font-semibold text-foreground">{TEXT.EMPTY_TITLE}</div>
          <div className="mt-1 text-xs">{TEXT.EMPTY_BODY}</div>
        </div>
      )}
    </div>
  );
}
