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
import { Button } from "@/components/ui/button";
import type { ActionHistoryFilters } from "@/lib/dal";

const TEXT = {
  EXPORTING: "Exportando…",
  EXPORT:    "Exportar CSV",
  CAP_NOTICE: "Exportación limitada a 10.000 filas. Aplica filtros para reducir el rango.",
} as const;

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
    <div className="flex items-center gap-2.5">
      <Button
        type="button"
        variant="outline"
        onClick={handleExport}
        disabled={loading}
        className="whitespace-nowrap"
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" strokeWidth={2} />
            {TEXT.EXPORTING}
          </>
        ) : (
          <>
            <Download strokeWidth={2} />
            {TEXT.EXPORT}
          </>
        )}
      </Button>

      {capNotice && (
        <div className="flex items-center gap-1.5 rounded-md border border-amber-400/50 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-3.5 shrink-0" strokeWidth={2} />
          {TEXT.CAP_NOTICE}
        </div>
      )}
    </div>
  );
}
