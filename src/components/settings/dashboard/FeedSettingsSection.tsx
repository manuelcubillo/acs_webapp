"use client";

/**
 * FeedSettingsSection
 *
 * Controls what appears in the operational activity feed:
 *   - feedLimit:          max number of entries shown
 *   - showScanEntries:    include scan-only log entries
 *   - showActionEntries:  include action execution entries
 */

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { upsertDashboardSettingsAction } from "@/lib/actions/dashboard-settings";
import type { DashboardSettings } from "@/lib/dal";

interface FeedSettingsSectionProps {
  settings: DashboardSettings | null;
}

const DEFAULT_FEED_LIMIT = 20;

export default function FeedSettingsSection({ settings }: FeedSettingsSectionProps) {
  const [feedLimit, setFeedLimit] = useState(settings?.feedLimit ?? DEFAULT_FEED_LIMIT);
  const [showScan, setShowScan] = useState(settings?.showScanEntries ?? true);
  const [showAction, setShowAction] = useState(settings?.showActionEntries ?? true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await upsertDashboardSettingsAction({
        feedLimit,
        showScanEntries: showScan,
        showActionEntries: showAction,
      });
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <section style={{
      background: "#fff",
      border: "1.5px solid var(--color-border)",
      borderRadius: 14,
      padding: "24px",
    }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}>
          Feed de actividad
        </div>
        <div style={{ fontSize: 13, color: "var(--color-secondary)", marginTop: 4 }}>
          Configura qué entradas aparecen en el feed del panel operacional.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Feed limit */}
        <div>
          <label style={labelStyle}>
            Número de entradas a mostrar
          </label>
          <input
            type="number"
            className="form-input"
            min={5}
            max={100}
            value={feedLimit}
            onChange={(e) => setFeedLimit(Number(e.target.value))}
            style={{ marginTop: 6, maxWidth: 120 }}
          />
          <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 4 }}>
            Entre 5 y 100. Las entradas más recientes aparecerán primero.
          </div>
        </div>

        {/* Show scan entries */}
        <label style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          padding: "12px 14px",
          background: showScan ? "#f0fdf4" : "#f8f9fa",
          border: `1.5px solid ${showScan ? "#bbf7d0" : "var(--color-border)"}`,
          borderRadius: 10, cursor: "pointer", transition: "all 0.15s",
        }}>
          <input
            type="checkbox"
            checked={showScan}
            onChange={(e) => setShowScan(e.target.checked)}
            style={{ marginTop: 2, accentColor: "#16a34a", flexShrink: 0 }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>
              Mostrar escaneos sin acción
            </div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>
              Incluir entradas de tipo &quot;escaneado&quot; (sin modificación de campos).
            </div>
          </div>
        </label>

        {/* Show action entries */}
        <label style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          padding: "12px 14px",
          background: showAction ? "#eef0ff" : "#f8f9fa",
          border: `1.5px solid ${showAction ? "#c7d2fe" : "var(--color-border)"}`,
          borderRadius: 10, cursor: "pointer", transition: "all 0.15s",
        }}>
          <input
            type="checkbox"
            checked={showAction}
            onChange={(e) => setShowAction(e.target.checked)}
            style={{ marginTop: 2, accentColor: "#4f5bff", flexShrink: 0 }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>
              Mostrar acciones ejecutadas
            </div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>
              Incluir entradas cuando se ejecuta una acción (incremento, marcar, etc.).
            </div>
          </div>
        </label>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--color-border-soft)" }}>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={isPending}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Save size={14} strokeWidth={2} />
          {isPending ? "Guardando…" : "Guardar"}
        </button>
        {saved && <span style={{ fontSize: 12.5, color: "#16a34a", fontWeight: 600 }}>✓ Guardado</span>}
        {error && <span style={{ fontSize: 12.5, color: "#dc2626" }}>{error}</span>}
      </div>
    </section>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--color-dark)",
  display: "block",
};
