"use client";

/**
 * HistoryTableRow
 *
 * Single row in the action history table.
 *
 * Left-border color:
 *   - gray for scans
 *   - action color (or type default) for actions
 *
 * Columns: Date/Time | Card Code | Card Type | Action | Executed By | Summary Fields | Details
 */

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import type { ActionHistoryEntry } from "@/lib/dal";

// ─── Color helpers ────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  green: "#059669",
  red: "#dc2626",
  blue: "#4f5bff",
  orange: "#d97706",
  purple: "#7c3aed",
  gray: "#6b7280",
};

function resolveColor(color: string | null | undefined, fallback = "#6b7280"): string {
  if (!color) return fallback;
  return COLOR_MAP[color] ?? color;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDateTime(date: Date): { relative: string; absolute: string } {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let relative: string;
  if (seconds < 60) relative = "Ahora";
  else if (minutes < 60) relative = `Hace ${minutes}m`;
  else if (hours < 24) relative = `Hace ${hours}h`;
  else if (days < 7) relative = `Hace ${days}d`;
  else relative = date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });

  const absolute = date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return { relative, absolute };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (value instanceof Date) return value.toLocaleDateString("es-ES");
  return String(value);
}

function formatDetails(entry: ActionHistoryEntry): string {
  if (entry.logType !== "action" || !entry.metadata) return "—";
  const m = entry.metadata;
  const field = m.target_field;
  const before = m.before_value;
  const after = m.after_value;
  if (field === undefined) return "—";
  return `${field}: ${formatValue(before)} → ${formatValue(after)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface HistoryTableRowProps {
  entry: ActionHistoryEntry;
  isOdd: boolean;
}

export default function HistoryTableRow({ entry, isOdd }: HistoryTableRowProps) {
  const isScan = entry.logType === "scan";
  const accentColor = isScan ? "#9ca3af" : resolveColor(entry.actionColor);
  const { relative, absolute } = formatDateTime(entry.executedAt);
  const details = formatDetails(entry);

  const cellStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 12.5,
    color: "var(--color-dark)",
    borderBottom: "1px solid var(--color-border-soft)",
    verticalAlign: "top",
    lineHeight: 1.4,
  };

  return (
    <tr
      style={{
        background: isOdd ? "#fafafa" : "#fff",
        borderLeft: `3px solid ${accentColor}`,
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.background = "#f0f4ff";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.background = isOdd ? "#fafafa" : "#fff";
      }}
    >
      {/* Date/Time */}
      <td style={cellStyle}>
        <div style={{ fontWeight: 600, color: "var(--color-dark)" }}>{relative}</div>
        <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2 }}>{absolute}</div>
      </td>

      {/* Card Code */}
      <td style={cellStyle}>
        <Link
          href={`/cards/${encodeURIComponent(entry.cardCode)}`}
          style={{
            fontFamily: "monospace",
            fontWeight: 700,
            fontSize: 12.5,
            color: "var(--color-primary)",
            textDecoration: "none",
          }}
        >
          {entry.cardCode}
        </Link>
      </td>

      {/* Card Type */}
      <td style={cellStyle}>
        <span style={{
          display: "inline-block",
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: 6,
          background: "var(--color-subtle-bg)",
          border: "1px solid var(--color-border-soft)",
          color: "var(--color-secondary)",
        }}>
          {entry.cardTypeName}
        </span>
      </td>

      {/* Action */}
      <td style={cellStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: accentColor, flexShrink: 0,
          }} />
          <span style={{ fontWeight: 600 }}>
            {isScan ? "Escaneo" : (entry.actionName ?? "Acción")}
          </span>
          {entry.operatorOverride && (
            <span
              title="Intervención del operador — ejecutado con errores de validación"
              style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontSize: 10, fontWeight: 600,
                color: "#d97706", background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: 5, padding: "1px 6px",
              }}
            >
              <ShieldAlert size={10} strokeWidth={2} />
              Override
            </span>
          )}
        </div>
      </td>

      {/* Executed By */}
      <td style={cellStyle}>
        <span style={{ color: entry.executedByName ? "var(--color-dark)" : "var(--color-muted)" }}>
          {entry.executedByName ?? "—"}
        </span>
      </td>

      {/* Summary Fields */}
      <td style={cellStyle}>
        {entry.summaryFields.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {entry.summaryFields.slice(0, 3).map((sf, i) => (
              <div key={i} style={{ fontSize: 11.5 }}>
                <span style={{ color: "var(--color-muted)", marginRight: 3 }}>{sf.label}:</span>
                <span style={{ fontWeight: 600 }}>{formatValue(sf.value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <span style={{ color: "var(--color-muted)" }}>—</span>
        )}
      </td>

      {/* Details */}
      <td style={{ ...cellStyle, color: "var(--color-secondary)", fontFamily: isScan ? undefined : "monospace", fontSize: 11.5 }}>
        {details}
      </td>
    </tr>
  );
}
