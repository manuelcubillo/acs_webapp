"use client";

/**
 * HistoryExportButton
 *
 * Triggers a CSV export of the currently applied history filters.
 * Downloads the file client-side from the CSV string returned by the server action.
 * Shows a notification when the export was capped at 10,000 rows.
 */

import { useState } from "react";
import { Download, Loader2, AlertTriangle } from "lucide-react";
import { exportActionHistoryAction } from "@/lib/actions/action-history";
import type { ActionHistoryFilters } from "@/lib/dal";

interface HistoryExportButtonProps {
  filters: ActionHistoryFilters;
}

export default function HistoryExportButton({ filters }: HistoryExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [capNotice, setCapNotice] = useState(false);

  const handleExport = async () => {
    if (loading) return;
    setLoading(true);
    setCapNotice(false);

    try {
      const result = await exportActionHistoryAction(filters);

      if (!result.success) {
        // Silently fail — user can retry
        console.error("[HistoryExportButton] Export failed:", result.error);
        return;
      }

      const { csv, totalExported, capped } = result.data;

      // Create a Blob and trigger download
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      a.href = url;
      a.download = `historial_${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (capped) {
        setCapNotice(true);
        // Auto-hide notice after 8 seconds
        setTimeout(() => setCapNotice(false), 8000);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        onClick={handleExport}
        disabled={loading}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          borderRadius: 8,
          border: "1.5px solid var(--color-border)",
          background: "#fff",
          fontSize: 13,
          fontWeight: 600,
          color: loading ? "var(--color-muted)" : "var(--color-dark)",
          cursor: loading ? "not-allowed" : "pointer",
          transition: "background 0.12s",
          opacity: loading ? 0.7 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {loading ? (
          <>
            <Loader2 size={14} strokeWidth={2} style={{ animation: "spin 0.8s linear infinite" }} />
            Exportando…
          </>
        ) : (
          <>
            <Download size={14} strokeWidth={2} />
            Exportar CSV
          </>
        )}
      </button>

      {capNotice && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "6px 10px",
          borderRadius: 7,
          background: "#fffbeb",
          border: "1px solid #fcd34d",
          fontSize: 12,
          color: "#92400e",
          fontWeight: 500,
        }}>
          <AlertTriangle size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
          Exportación limitada a 10.000 filas. Aplica filtros para reducir el rango.
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
