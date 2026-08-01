import type { FieldDefinition } from "@/lib/dal/types";

export interface MergedFieldColumns {
  /** One representative FieldDefinition per (name, fieldType) group, in first-seen order. */
  columns: FieldDefinition[];
  /** Maps every original field_definition_id to its representative column's id. */
  fieldIdToColumnId: Map<string, string>;
}

/**
 * Collapses field definitions that share the same name + fieldType — the same
 * logical field defined independently per card type, per the convention in
 * getCommonFieldDefinitions — into a single display column. Without this, a
 * multi-type list (e.g. the unfiltered /cards view) shows duplicate "Nombre"
 * or "apto" columns side by side, one per card type that happens to define it.
 */
export function mergeFieldColumns(fields: FieldDefinition[]): MergedFieldColumns {
  const columns: FieldDefinition[] = [];
  const fieldIdToColumnId = new Map<string, string>();
  const groupKeyToColumnId = new Map<string, string>();

  for (const field of fields) {
    const key = `${field.name}:${field.fieldType}`;
    const columnId = groupKeyToColumnId.get(key);
    if (columnId) {
      fieldIdToColumnId.set(field.id, columnId);
    } else {
      groupKeyToColumnId.set(key, field.id);
      fieldIdToColumnId.set(field.id, field.id);
      columns.push(field);
    }
  }

  return { columns, fieldIdToColumnId };
}
