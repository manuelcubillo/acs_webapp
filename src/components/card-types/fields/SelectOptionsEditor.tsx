"use client";

/**
 * SelectOptionsEditor
 *
 * Configuration panel for a `select` field: the list of choices an operator
 * can pick, plus whether several may be picked at once.
 *
 * This is deliberately NOT part of ValidationRulesEditor. The options are the
 * field's definition, not a constraint on what someone typed — see
 * FIELD_CONFIGURATION_RULES in `@/lib/validation/rules`.
 *
 * Options are managed one at a time (add / rename / delete / reorder). The
 * previous UI was a single comma-separated text input, which made a comma
 * impossible to type inside an option and rewrote the caret on every
 * keystroke.
 */

import { useRef, useState } from "react";
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
import { Check, GripVertical, ListPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const TEXT = {
  SECTION_LABEL:   "Opciones de la selección",
  SECTION_HINT:    "Valores entre los que podrá elegir quien rellene el campo.",
  ADD_PLACEHOLDER: "Escribe una opción y pulsa Intro",
  ADD:             "Añadir",
  EDIT:            "Editar opción",
  DELETE:          "Eliminar opción",
  CONFIRM:         "Guardar opción",
  CANCEL:          "Cancelar edición",
  EMPTY_TITLE:     "Sin opciones todavía",
  EMPTY_BODY:      "Añade al menos una opción; si no, el desplegable saldrá vacío.",
  ERROR_DUPLICATE: "Esa opción ya existe.",
  MULTIPLE_LABEL:  "Permitir selección múltiple",
  MULTIPLE_HINT:   "Quien rellene el campo podrá marcar varias opciones a la vez.",
  COUNT_ONE:       "opción",
  COUNT_MANY:      "opciones",
} as const;

interface SelectOptionsEditorProps {
  options: string[];
  allowMultiple: boolean;
  onOptionsChange: (options: string[]) => void;
  onAllowMultipleChange: (allowMultiple: boolean) => void;
}

/** Case-insensitive presence test — "Residente" and "residente" are one option. */
function hasOption(options: string[], candidate: string, ignoreIndex = -1): boolean {
  const needle = candidate.trim().toLowerCase();
  return options.some((o, i) => i !== ignoreIndex && o.trim().toLowerCase() === needle);
}

// ─── Sortable option row ─────────────────────────────────────────────────────

interface OptionRowProps {
  option: string;
  index: number;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onCommitEdit: (value: string) => void;
  onRemove: () => void;
  validateEdit: (value: string) => boolean;
}

function OptionRow({
  option,
  index,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onCommitEdit,
  onRemove,
  validateEdit,
}: OptionRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: option, disabled: isEditing });

  const [edited, setEdited] = useState(option);

  // Data-driven transform from dnd-kit — must remain inline.
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const editValid = edited.trim().length > 0 && validateEdit(edited);

  function commit() {
    if (!editValid) return;
    onCommitEdit(edited.trim());
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2 shadow-sm transition-shadow",
        isDragging && "border-primary bg-accent shadow-lg",
        isEditing && "border-primary/40 bg-accent/40",
      )}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          "flex shrink-0 items-center text-muted-foreground/60",
          isEditing ? "cursor-default opacity-40" : "cursor-grab touch-none",
        )}
      >
        <GripVertical className="size-4" strokeWidth={1.5} />
      </div>

      {/* Position badge */}
      <div className="flex size-5.5 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">
        {index + 1}
      </div>

      {isEditing ? (
        <>
          <Input
            autoFocus
            value={edited}
            onChange={(e) => setEdited(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancelEdit();
              }
            }}
            className="h-8 flex-1"
          />
          <div className="flex shrink-0 gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={commit}
              disabled={!editValid}
              title={TEXT.CONFIRM}
            >
              <Check strokeWidth={1.8} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={onCancelEdit}
              title={TEXT.CANCEL}
            >
              <X strokeWidth={1.8} />
            </Button>
          </div>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {option}
          </span>
          <div className="flex shrink-0 gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => {
                setEdited(option);
                onStartEdit();
              }}
              title={TEXT.EDIT}
            >
              <Pencil strokeWidth={1.8} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={onRemove}
              title={TEXT.DELETE}
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 strokeWidth={1.8} />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SelectOptionsEditor({
  options,
  allowMultiple,
  onOptionsChange,
  onAllowMultipleChange,
}: SelectOptionsEditorProps) {
  const [pending, setPending] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleAdd() {
    const value = pending.trim();
    if (!value) return;
    if (hasOption(options, value)) {
      setError(TEXT.ERROR_DUPLICATE);
      return;
    }
    onOptionsChange([...options, value]);
    setPending("");
    setError(null);
    addInputRef.current?.focus();
  }

  function handleCommitEdit(index: number, value: string) {
    onOptionsChange(options.map((o, i) => (i === index ? value : o)));
    setEditingIndex(null);
    setError(null);
  }

  function handleRemove(index: number) {
    onOptionsChange(options.filter((_, i) => i !== index));
    setEditingIndex(null);
    setError(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = options.indexOf(String(active.id));
    const to = options.indexOf(String(over.id));
    if (from === -1 || to === -1) return;

    onOptionsChange(arrayMove(options, from, to));
  }

  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      {/* Section header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <Label>{TEXT.SECTION_LABEL}</Label>
          <div className="mt-1 text-xs text-muted-foreground">
            {TEXT.SECTION_HINT}
          </div>
        </div>
        {options.length > 0 && (
          <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
            {options.length} {options.length === 1 ? TEXT.COUNT_ONE : TEXT.COUNT_MANY}
          </span>
        )}
      </div>

      {/* Add row */}
      <div className="flex gap-2">
        <Input
          ref={addInputRef}
          value={pending}
          onChange={(e) => {
            setPending(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={TEXT.ADD_PLACEHOLDER}
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleAdd}
          disabled={pending.trim().length === 0}
        >
          <Plus strokeWidth={1.8} />
          {TEXT.ADD}
        </Button>
      </div>

      {error && (
        <div className="mt-1.5 text-xs text-destructive">{error}</div>
      )}

      {/* Option list */}
      <div className="mt-3">
        {options.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-6 text-center">
            <ListPlus className="size-5 text-muted-foreground/60" strokeWidth={1.6} />
            <div className="text-sm font-semibold text-foreground">
              {TEXT.EMPTY_TITLE}
            </div>
            <div className="text-xs text-muted-foreground">{TEXT.EMPTY_BODY}</div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={options} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {options.map((option, index) => (
                  <OptionRow
                    // The value doubles as the dnd-kit id; duplicates are
                    // rejected on add and on rename, so it stays unique.
                    key={option}
                    option={option}
                    index={index}
                    isEditing={editingIndex === index}
                    onStartEdit={() => {
                      setEditingIndex(index);
                      setError(null);
                    }}
                    onCancelEdit={() => setEditingIndex(null)}
                    onCommitEdit={(value) => handleCommitEdit(index, value)}
                    onRemove={() => handleRemove(index)}
                    validateEdit={(value) => !hasOption(options, value, index)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Multiple selection */}
      <div className="mt-4 border-t pt-3.5">
        <label className="flex cursor-pointer items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">
              {TEXT.MULTIPLE_LABEL}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {TEXT.MULTIPLE_HINT}
            </div>
          </div>
          <Switch
            checked={allowMultiple}
            onCheckedChange={onAllowMultipleChange}
            className="mt-0.5 shrink-0"
          />
        </label>
      </div>
    </div>
  );
}
