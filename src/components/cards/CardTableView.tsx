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
import type { CardWithFields, FieldDefinition } from "@/lib/dal/types";

const TEXT = {
  CODE_HEADER: "Código",
  EMPTY:       "No se encontraron carnets.",
} as const;

interface CardTableViewProps {
  cards: CardWithFields[];
  fields: FieldDefinition[];
  visibleColumns: string[];
}

export default function CardTableView({
  cards,
  fields,
  visibleColumns,
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
            for (const fv of card.fields) {
              valueMap[fv.fieldDefinitionId] = fv.value;
            }
            return (
              <TableRow
                key={card.id}
                onClick={() =>
                  router.push(
                    `/cards/${encodeURIComponent(card.code)}?from=cards`,
                  )
                }
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
