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
import type { FieldDefinitionDraft, FieldType } from "@/hooks/useCardTypeWizard";

// ─── Field type icon helpers ──────────────────────────────────────────────────

const FIELD_TYPE_META: Record<
  FieldType,
  { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; color: string; bg: string; label: string }
> = {
  text:    { icon: Type,       color: "#4f5bff", bg: "#eef0ff",  label: "Texto" },
  number:  { icon: Hash,       color: "#059669", bg: "#ecfdf5",  label: "Número" },
  boolean: { icon: ToggleLeft, color: "#d97706", bg: "#fffbeb",  label: "Sí/No" },
  date:    { icon: Calendar,   color: "#7c3aed", bg: "#f5f3ff",  label: "Fecha" },
  photo:   { icon: Camera,     color: "#db2777", bg: "#fdf2f8",  label: "Foto" },
  select:  { icon: List,       color: "#0284c7", bg: "#f0f9ff",  label: "Selección" },
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
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        background: isDragging ? "#f8f9ff" : "#fff",
        border: `1.5px solid ${isDragging ? "var(--color-primary)" : "var(--color-border)"}`,
        borderRadius: 12,
        transition: isDragging ? undefined : "border-color 0.15s, box-shadow 0.15s",
        boxShadow: isDragging ? "0 8px 24px rgba(79,91,255,0.15)" : "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        style={{
          color: "#c7c9d9",
          cursor: "grab",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          touchAction: "none",
        }}
      >
        <GripVertical size={18} strokeWidth={1.5} />
      </div>

      {/* Position badge */}
      <div style={{
        width: 24,
        height: 24,
        borderRadius: 6,
        background: "var(--color-page-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 700,
        color: "var(--color-muted)",
        flexShrink: 0,
      }}>
        {field.position + 1}
      </div>

      {/* Type icon */}
      <div style={{
        width: 34,
        height: 34,
        borderRadius: 9,
        background: meta.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: meta.color,
        flexShrink: 0,
      }}>
        <Icon size={17} strokeWidth={1.8} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-dark)", fontFamily: "var(--font-heading)" }}>
            {field.label}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 400, color: "var(--color-muted)" }}>
            ({field.name})
          </span>
          {field.isRequired && (
            <span style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: "#dc2626",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              padding: "1px 6px",
              borderRadius: 4,
            }}>
              Obligatorio
            </span>
          )}
          {field.validationRules && field.validationRules.rules.length > 0 && (
            <span style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: "#059669",
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              padding: "1px 6px",
              borderRadius: 4,
            }}>
              {field.validationRules.rules.length} regla{field.validationRules.rules.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>
          {meta.label}
          {field.defaultValue != null && ` · Defecto: ${field.defaultValue}`}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => onEdit(field)}
          title="Editar campo"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1.5px solid var(--color-border)",
            background: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-secondary)",
            transition: "all 0.15s",
          }}
          onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f0f1f5"; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#fff"; }}
        >
          <Pencil size={14} strokeWidth={1.8} />
        </button>
        <button
          onClick={() => onRemove(field.tempId)}
          title="Eliminar campo"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1.5px solid #fecaca",
            background: "#fef2f2",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#dc2626",
            transition: "all 0.15s",
          }}
          onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#fee2e2"; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#fef2f2"; }}
        >
          <Trash2 size={14} strokeWidth={1.8} />
        </button>
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
      <div style={{
        textAlign: "center",
        padding: "40px 24px",
        background: "var(--color-subtle-bg)",
        borderRadius: 12,
        border: "1.5px dashed var(--color-border)",
        color: "var(--color-muted)",
        fontSize: 13.5,
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
        <div style={{ fontWeight: 600, color: "var(--color-secondary)" }}>Sin campos todavía</div>
        <div style={{ marginTop: 4, fontSize: 12.5 }}>
          Pulsa «Añadir campo» para definir los datos de la tarjeta.
        </div>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
