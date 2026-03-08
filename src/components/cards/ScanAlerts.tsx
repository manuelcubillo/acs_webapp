"use client";

/**
 * ScanAlerts
 *
 * Displays dismissible alert banners for failing scan validation checks.
 * Errors are shown in red, warnings in amber.
 * If all checks pass, nothing is rendered.
 */

import { useState } from "react";
import { X, AlertCircle, AlertTriangle } from "lucide-react";
import type { ScanValidationResult } from "@/lib/validation/scan-validator";

interface ScanAlertsProps {
  scanResult: ScanValidationResult;
}

export default function ScanAlerts({ scanResult }: ScanAlertsProps) {
  const failing = scanResult.results.filter((r) => !r.passed);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = failing.filter((r) => !dismissed.has(r.scanValidationId));
  if (visible.length === 0) return null;

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
      {visible.map((check) => {
        const isError = check.severity === "error";
        const color  = isError ? "#dc2626" : "#d97706";
        const bg     = isError ? "#fef2f2" : "#fffbeb";
        const border = isError ? "#fecaca" : "#fde68a";
        const Icon   = isError ? AlertCircle : AlertTriangle;

        return (
          <div
            key={check.scanValidationId}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "12px 16px",
              background: bg,
              border: `1.5px solid ${border}`,
              borderRadius: 10,
            }}
          >
            <Icon size={16} strokeWidth={1.8} style={{ color, flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color }}>
                {check.fieldLabel}
              </span>
              <span style={{ fontSize: 13, color, marginLeft: 6 }}>
                {check.message}
              </span>
            </div>
            <button
              onClick={() => dismiss(check.scanValidationId)}
              title="Descartar alerta"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color,
                padding: 2,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.7,
              }}
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
