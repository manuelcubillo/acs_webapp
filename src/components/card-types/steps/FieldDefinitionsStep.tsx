"use client";

/**
 * FieldDefinitionsStep (Step 1)
 *
 * Manage the card type's field definitions:
 * - Add new fields via the FieldEditor panel
 * - Reorder with drag-and-drop
 * - Edit / delete existing fields
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import FieldList from "../fields/FieldList";
import FieldEditor from "../fields/FieldEditor";
import type { FieldDefinitionDraft } from "@/hooks/useCardTypeWizard";

interface FieldDefinitionsStepProps {
  fields: FieldDefinitionDraft[];
  onAdd: (draft: Omit<FieldDefinitionDraft, "tempId" | "position">) => void;
  onUpdate: (tempId: string, patch: Partial<Omit<FieldDefinitionDraft, "tempId">>) => void;
  onRemove: (tempId: string) => void;
  onReorder: (newOrder: FieldDefinitionDraft[]) => void;
}

export default function FieldDefinitionsStep({
  fields,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
}: FieldDefinitionsStepProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinitionDraft | null>(null);

  function openNew() {
    setEditingField(null);
    setEditorOpen(true);
  }

  function openEdit(field: FieldDefinitionDraft) {
    setEditingField(field);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingField(null);
  }

  function handleSave(draft: Omit<FieldDefinitionDraft, "tempId" | "position">) {
    if (editingField) {
      onUpdate(editingField.tempId, draft);
    } else {
      onAdd(draft);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--color-dark)", marginBottom: 6 }}>
            Campos del esquema
          </div>
          <div style={{ fontSize: 13.5, color: "var(--color-secondary)" }}>
            Define los datos que almacenará cada tarjeta. Arrastra para reordenar.
          </div>
        </div>
        <button className="btn btn-primary" onClick={openNew} style={{ flexShrink: 0 }}>
          <Plus size={16} strokeWidth={2} />
          Añadir campo
        </button>
      </div>

      {/* Stats row */}
      {fields.length > 0 && (
        <div style={{
          display: "flex",
          gap: 20,
          padding: "12px 16px",
          background: "var(--color-subtle-bg)",
          borderRadius: 10,
          border: "1px solid var(--color-border-soft)",
        }}>
          <Stat label="Total" value={fields.length} />
          <Stat label="Obligatorios" value={fields.filter((f) => f.isRequired).length} color="#dc2626" />
          <Stat label="Con validación" value={fields.filter((f) => f.validationRules?.rules.length).length} color="#059669" />
        </div>
      )}

      {/* Sortable list */}
      <FieldList
        fields={fields}
        onEdit={openEdit}
        onRemove={onRemove}
        onReorder={onReorder}
      />

      {/* FieldEditor panel */}
      {editorOpen && (
        <FieldEditor
          draft={editingField}
          onSave={handleSave}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--font-heading)", color: color ?? "var(--color-dark)" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--color-muted)", fontWeight: 500 }}>
        {label}
      </div>
    </div>
  );
}
