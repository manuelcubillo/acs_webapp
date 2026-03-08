"use client";

/**
 * ActivityFeedEntryRow
 *
 * Renders a single entry in the operational dashboard activity feed.
 * Supports two visual variants:
 *   - "scan"   → neutral icon, no action label
 *   - "action" → action name + colored icon based on action type
 *
 * Summary field values (configured per card type) are shown inline
 * to help operators identify the card at a glance.
 */

import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { ScanLine, Zap, Clock } from "lucide-react";
import Link from "next/link";
import type { ActivityFeedEntry } from "@/lib/dal";

interface ActivityFeedEntryRowProps {
  entry: ActivityFeedEntry;
}

/** Format a field value for inline display in the feed. */
function formatFieldValue(value: unknown, fieldType: string): string {
  if (value === null || value === undefined) return "—";
  if (fieldType === "boolean") return value ? "Sí" : "No";
  if (fieldType === "date" && value instanceof Date) {
    return value.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  }
  if (typeof value === "number") return value.toLocaleString("es-ES");
  return String(value);
}

export default function ActivityFeedEntryRow({ entry }: ActivityFeedEntryRowProps) {
  const isScan = entry.logType === "scan";

  const timeAgo = formatDistanceToNow(new Date(entry.executedAt), {
    addSuffix: true,
    locale: es,
  });

  return (
    <Link
      href={`/cards/${encodeURIComponent(entry.cardCode)}`}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 16px",
        background: "#fff",
        border: "1.5px solid var(--color-border)",
        borderRadius: 12,
        textDecoration: "none",
        color: "inherit",
        transition: "box-shadow 0.15s, border-color 0.15s",
      }}
      className="feed-entry-row"
    >
      {/* Icon */}
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: isScan ? "#f0fdf4" : "#eef0ff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: isScan ? "#16a34a" : "#4f5bff",
        flexShrink: 0,
        marginTop: 2,
      }}>
        {isScan
          ? <ScanLine size={16} strokeWidth={1.8} />
          : <Zap size={16} strokeWidth={1.8} />
        }
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top row: card code + type */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 13.5,
            fontWeight: 700,
            fontFamily: "var(--font-heading)",
            color: "var(--color-dark)",
          }}>
            {entry.cardCode}
          </span>
          <span style={{
            fontSize: 11,
            color: "var(--color-muted)",
            background: "var(--color-subtle-bg)",
            padding: "1px 7px",
            borderRadius: 5,
            border: "1px solid var(--color-border-soft)",
          }}>
            {entry.cardTypeName}
          </span>
          {!isScan && entry.actionName && (
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#4f5bff",
              background: "#eef0ff",
              padding: "1px 7px",
              borderRadius: 5,
              border: "1px solid #c7d2fe",
            }}>
              {entry.actionName}
            </span>
          )}
          {isScan && (
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              color: "#16a34a",
              background: "#f0fdf4",
              padding: "1px 7px",
              borderRadius: 5,
              border: "1px solid #bbf7d0",
            }}>
              Escaneado
            </span>
          )}
        </div>

        {/* Summary fields */}
        {entry.summaryFields.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 5, flexWrap: "wrap" }}>
            {entry.summaryFields.map((sf) => (
              <div key={sf.fieldDefinitionId} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 11, color: "var(--color-muted)" }}>{sf.label}:</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-secondary)" }}>
                  {formatFieldValue(sf.value, sf.fieldType)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Time */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11.5,
        color: "var(--color-muted)",
        flexShrink: 0,
        whiteSpace: "nowrap",
        marginTop: 2,
      }}>
        <Clock size={12} strokeWidth={1.8} />
        {timeAgo}
      </div>
    </Link>
  );
}
