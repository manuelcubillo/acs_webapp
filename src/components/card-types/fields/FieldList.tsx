"use client";

/**
 * FieldList
 *
 * Sortable list of FieldDefinitionDraft entries with drag-and-drop reordering
 * via @dnd-kit/sortable. Each row shows the field type icon, name/label,
 * required badge, and edit/delete actions.
 */

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Pencil,
  Trash2,
  Type,
  Hash,
  ToggleLeft,
  Calendar,
  Camera,
  List,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FieldDefinitionDraft, FieldType } from "@/hooks/useCardTypeWizard";

const TEXT = {
  REQUIRED:    "Obligatorio",
  EDIT:        "Editar campo",
  DELETE:      "Eliminar campo",
  DEFAULT:     "Defecto:",
  EMPTY_TITLE: "Sin campos todavía",
  EMPTY_BODY:  "Pulsa «Añadir campo» para definir los datos de la tarjeta.",
} as const;

// ─── Field type icon helpers ──────────────────────────────────────────────────
// Decorative category accents (NOT access-control state) — Tailwind palette +
// brand/neutral tokens, consistent with FieldTypeSelector.tsx.

const FIELD_TYPE_META: Record<
  FieldType,
  { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; iconClass: string; label: string }
> = {
  text:    { icon: Type,       iconClass: "bg-accent text-primary", label: "Texto" },
  number:  { icon: Hash,       iconClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", label: "Número" },
  boolean: { icon: ToggleLeft, iconClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", label: "Sí/No" },
  date:    { icon: Calendar,   iconClass: "bg-violet-500/15 text-violet-600 dark:text-violet-400", label: "Fecha" },
  photo:   { icon: Camera,     iconClass: "bg-pink-500/15 text-pink-600 dark:text-pink-400", label: "Foto" },
  select:  { icon: List,       iconClass: "bg-sky-500/15 text-sky-600 dark:text-sky-400", label: "Selección" },
};

// ─── Sortable row ─────────────────────────────────────────────────────────────

interface SortableFieldRowProps {
  field: FieldDefinitionDraft;
  onEdit: (field: FieldDefinitionDraft) => void;
  onRemove: (tempId: string) => void;
}

function SortableFieldRow({ field, onEdit, onRemove }: SortableFieldRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.tempId });

  // Data-driven transform from dnd-kit — must remain inline.
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const meta = FIELD_TYPE_META[field.fieldType];
  const Icon = meta.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm transition-shadow",
        isDragging && "border-primary bg-accent shadow-lg",
      )}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex shrink-0 cursor-grab touch-none items-center text-muted-foreground/60"
      >
        <GripVertical className="size-4.5" strokeWidth={1.5} />
      </div>

      {/* Position badge */}
      <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">
        {field.position + 1}
      </div>

      {/* Type icon */}
      <div className={cn("flex size-8.5 shrink-0 items-center justify-center rounded-[9px]", meta.iconClass)}>
        <Icon className="size-4" strokeWidth={1.8} />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-sm font-semibold text-foreground">
            {field.label}
          </span>
          <span className="text-xs text-muted-foreground">
            ({field.name})
          </span>
          {field.isRequired && (
            <Badge variant="outline">{TEXT.REQUIRED}</Badge>
          )}
          {field.validationRules && field.validationRules.rules.length > 0 && (
            <Badge variant="outline">
              {field.validationRules.rules.length} regla
              {field.validationRules.rules.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {meta.label}
          {field.defaultValue != null && ` · ${TEXT.DEFAULT} ${field.defaultValue}`}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => onEdit(field)}
          title={TEXT.EDIT}
        >
          <Pencil strokeWidth={1.8} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => onRemove(field.tempId)}
          title={TEXT.DELETE}
          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 strokeWidth={1.8} />
        </Button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface FieldListProps {
  fields: FieldDefinitionDraft[];
  onEdit: (field: FieldDefinitionDraft) => void;
  onRemove: (tempId: string) => void;
  onReorder: (newOrder: FieldDefinitionDraft[]) => void;
}

export default function FieldList({ fields, onEdit, onRemove, onReorder }: FieldListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = fields.findIndex((f) => f.tempId === active.id);
    const newIndex = fields.findIndex((f) => f.tempId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(fields, oldIndex, newIndex).map((f, i) => ({
      ...f,
      position: i,
    }));
    onReorder(reordered);
  }

  if (fields.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted px-6 py-10 text-center text-sm text-muted-foreground">
        <div className="mb-2 text-3xl">📋</div>
        <div className="font-semibold text-foreground">{TEXT.EMPTY_TITLE}</div>
        <div className="mt-1 text-xs">{TEXT.EMPTY_BODY}</div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={fields.map((f) => f.tempId)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2">
          {fields.map((field) => (
            <SortableFieldRow
              key={field.tempId}
              field={field}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
