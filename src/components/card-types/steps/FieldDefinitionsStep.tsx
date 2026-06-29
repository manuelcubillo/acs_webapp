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
import { Button } from "@/components/ui/button";
import type { FieldDefinitionDraft } from "@/hooks/useCardTypeWizard";

const TEXT = {
  HEADING:     "Campos del esquema",
  HEADING_SUB: "Define los datos que almacenará cada tarjeta. Arrastra para reordenar.",
  ADD:         "Añadir campo",
  STAT_TOTAL:  "Total",
  STAT_REQ:    "Obligatorios",
  STAT_VALID:  "Con validación",
} as const;

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
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 font-heading text-xl font-bold text-foreground">
            {TEXT.HEADING}
          </div>
          <div className="text-sm text-muted-foreground">{TEXT.HEADING_SUB}</div>
        </div>
        <Button onClick={openNew} className="shrink-0">
          <Plus strokeWidth={2} />
          {TEXT.ADD}
        </Button>
      </div>

      {/* Stats row */}
      {fields.length > 0 && (
        <div className="flex gap-5 rounded-[10px] border bg-muted px-4 py-3">
          <Stat label={TEXT.STAT_TOTAL} value={fields.length} />
          <Stat label={TEXT.STAT_REQ} value={fields.filter((f) => f.isRequired).length} />
          <Stat label={TEXT.STAT_VALID} value={fields.filter((f) => f.validationRules?.rules.length).length} />
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-heading text-lg font-extrabold text-foreground">
        {value}
      </div>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
    </div>
  );
}
