"use client";

import { useRouter } from "next/navigation";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import DynamicFieldRenderer from "./DynamicFieldRenderer";
import { cardDetailHref } from "@/lib/cards/return-origin";
import { rememberCardListScroll } from "@/lib/cards/scroll-restore";
import type { CardWithFields, FieldDefinition } from "@/lib/dal/types";

const TEXT = {
  CODE_HEADER: "Código",
  EMPTY:       "No se encontraron carnets.",
} as const;

interface CardTableViewProps {
  cards: CardWithFields[];
  fields: FieldDefinition[];
  visibleColumns: string[];
  /** Maps a field_definition_id to the (possibly merged) display column id it belongs to. */
  fieldIdToColumnId: Map<string, string>;
  /** Current list query — travels to the card detail so it can come back here. */
  viewQuery: string;
}

export default function CardTableView({
  cards,
  fields,
  visibleColumns,
  fieldIdToColumnId,
  viewQuery,
}: CardTableViewProps) {
  const router = useRouter();
  const visible = fields.filter((f) => visibleColumns.includes(f.id));

  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
        {TEXT.EMPTY}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              {TEXT.CODE_HEADER}
            </TableHead>
            {visible.map((f) => (
              <TableHead
                key={f.id}
                className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground"
              >
                {f.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {cards.map((card) => {
            const valueMap: Record<string, unknown> = {};
            // A display column can merge fields from several card types, so the
            // column id is not this card's field_definition_id. Photo rendering
            // addresses the exact object by field id, so keep the card's own id.
            const fieldIdMap: Record<string, string> = {};
            for (const fv of card.fields) {
              const columnId = fieldIdToColumnId.get(fv.fieldDefinitionId) ?? fv.fieldDefinitionId;
              valueMap[columnId] = fv.value;
              fieldIdMap[columnId] = fv.fieldDefinitionId;
            }
            return (
              <TableRow
                key={card.id}
                onClick={() => {
                  rememberCardListScroll(viewQuery);
                  router.push(cardDetailHref(card.code, "cards", viewQuery));
                }}
                className="cursor-pointer hover:bg-accent/40"
              >
                <TableCell className="font-mono text-xs font-semibold text-foreground">
                  {card.code}
                </TableCell>
                {visible.map((f) => (
                  <TableCell key={f.id}>
                    <DynamicFieldRenderer
                      fieldType={f.fieldType}
                      value={valueMap[f.id]}
                      label={f.label}
                      cardCode={card.code}
                      fieldDefinitionId={fieldIdMap[f.id]}
                      // The row navigates to the card detail; a photo lightbox
                      // here would swallow that click.
                      enlargeable={false}
                    />
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
