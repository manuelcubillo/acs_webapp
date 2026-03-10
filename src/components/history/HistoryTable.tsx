"use client";

/**
 * HistoryTable
 *
 * Fixed-header scrollable table of action_log entries.
 * Left-border accent color matches the action's color (gray for scans).
 */

import { Loader2 } from "lucide-react";
import HistoryTableRow from "./HistoryTableRow";
import type { ActionHistoryEntry } from "@/lib/dal";

interface HistoryTableProps {
  entries: ActionHistoryEntry[];
  isLoading: boolean;
}

const TH_STYLE: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--color-muted)",
  background: "#fafafa",
  borderBottom: "2px solid var(--color-border)",
  textAlign: "left",
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

export default function HistoryTable({ entries, isLoading }: HistoryTableProps) {
  return (
    <div style={{ position: "relative" }}>
      {/* Loading overlay */}
      {isLoading && (
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(255,255,255,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10, borderRadius: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-muted)" }}>
            <Loader2 size={18} strokeWidth={2} style={{ animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Cargando…</span>
          </div>
        </div>
      )}

      <div style={{
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        overflow: "hidden",
        maxHeight: "calc(100vh - 320px)",
        overflowY: "auto",
        overflowX: "auto",
      }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: 900,
        }}>
          <thead>
            <tr>
              <th style={{ ...TH_STYLE, width: 140 }}>Fecha/Hora</th>
              <th style={{ ...TH_STYLE, width: 110 }}>Código</th>
              <th style={{ ...TH_STYLE, width: 120 }}>Tipo</th>
              <th style={{ ...TH_STYLE, width: 180 }}>Acción</th>
              <th style={{ ...TH_STYLE, width: 130 }}>Operador</th>
              <th style={{ ...TH_STYLE }}>Resumen</th>
              <th style={{ ...TH_STYLE, width: 200 }}>Detalle</th>
            </tr>
          </thead>

          <tbody>
            {entries.length === 0 && !isLoading ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: "40px 24px",
                    textAlign: "center",
                    color: "var(--color-muted)",
                    fontSize: 14,
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                  <div style={{ fontWeight: 600 }}>Sin resultados</div>
                  <div style={{ fontSize: 12.5, marginTop: 4 }}>
                    Ajusta los filtros o amplía el rango de fechas.
                  </div>
                </td>
              </tr>
            ) : (
              entries.map((entry, i) => (
                <HistoryTableRow key={entry.id} entry={entry} isOdd={i % 2 === 1} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
