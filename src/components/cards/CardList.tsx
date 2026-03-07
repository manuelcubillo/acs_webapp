"use client";

import { useState } from "react";
import type { CardWithFields, FieldDefinition, ScanMode } from "@/lib/dal/types";
import { useCardColumns } from "@/hooks/useCardColumns";
import CardSearch from "./CardSearch";
import CardTableView from "./CardTableView";
import CardProfileView from "./CardProfileView";
import CardViewToggle, { type ViewMode } from "./CardViewToggle";
import CardColumnSelector from "./CardColumnSelector";

interface CardListProps {
  cards: CardWithFields[];
  fields: FieldDefinition[];
  cardTypeId: string;
  scanMode: ScanMode;
  /** Initial search query (from URL param, for controlled input). */
  initialSearch?: string;
}

export default function CardList({
  cards,
  fields,
  cardTypeId,
  scanMode,
  initialSearch = "",
}: CardListProps) {
  const [view, setView] = useState<ViewMode>("table");
  const fieldIds = fields.map((f) => f.id);
  const { visibleColumns, toggleColumn, resetColumns } = useCardColumns(
    cardTypeId,
    fieldIds,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <CardSearch
            scanMode={scanMode}
            defaultValue={initialSearch}
            placeholder="Buscar por código..."
          />
        </div>

        <CardViewToggle view={view} onChange={setView} />

        {view === "table" && (
          <CardColumnSelector
            fields={fields}
            visibleColumns={visibleColumns}
            onToggle={toggleColumn}
            onReset={resetColumns}
          />
        )}
      </div>

      {/* Result count */}
      <p style={{ fontSize: 12, color: "var(--color-muted)", margin: 0 }}>
        {cards.length} {cards.length === 1 ? "carnet" : "carnets"}
      </p>

      {/* Content */}
      {view === "table" ? (
        <CardTableView
          cards={cards}
          fields={fields}
          visibleColumns={visibleColumns}
        />
      ) : (
        <CardProfileView cards={cards} fields={fields} />
      )}
    </div>
  );
}
