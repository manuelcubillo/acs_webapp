"use client";

/**
 * DashboardView
 *
 * Main client-side orchestrator for the operational dashboard.
 *
 * Responsibilities:
 *   - Renders the search bar (code input + scan button)
 *   - On scan: calls executeScanWithAutoActionsAction → displays result in ActiveCardZone
 *   - Renders the activity feed (with initial SSR data + auto-refresh)
 *   - Renders a camera scan shortcut button (links to /cards/scan)
 *
 * Layout:
 *   ┌────────────────────────────────────────┐
 *   │  [SearchBar]          [📷 Cámara]      │
 *   ├──────────────────┬─────────────────────┤
 *   │  ActiveCardZone  │  ActivityFeed       │
 *   └──────────────────┴─────────────────────┘
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { Camera } from "lucide-react";
import DashboardSearchBar from "./DashboardSearchBar";
import ActiveCardZone from "./ActiveCardZone";
import ActivityFeed from "./ActivityFeed";
import { executeScanWithAutoActionsAction } from "@/lib/actions/cards";
import { getActionsForCardType } from "@/lib/dal";
import type {
  ScanWithAutoActionsResult,
  ActivityFeedEntry,
  DashboardSettings,
  ActionDefinitionWithField,
} from "@/lib/dal";

interface DashboardViewProps {
  initialFeedEntries: ActivityFeedEntry[];
  settings: DashboardSettings | null;
}

export default function DashboardView({
  initialFeedEntries,
  settings,
}: DashboardViewProps) {
  const [scanResult, setScanResult] = useState<ScanWithAutoActionsResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [manualActions, setManualActions] = useState<ActionDefinitionWithField[]>([]);
  const [feedKey, setFeedKey] = useState(0);

  const handleScan = useCallback(async (code: string) => {
    setIsScanning(true);
    setScanError(null);
    try {
      const result = await executeScanWithAutoActionsAction(code);
      if (!result.success) {
        setScanError(result.error);
        setScanResult(null);
        return;
      }

      setScanResult(result.data);

      // Load manual (non-auto-execute) actions for this card type
      // so the operator can trigger them manually from the dashboard.
      // We import the DAL function directly since this runs on the client
      // via a server action call.
      const actionsResult = await import("@/lib/actions/actions").then((m) =>
        m.getActionsForCardTypeAction(result.data.card.cardTypeId),
      );
      if (actionsResult.success) {
        setManualActions(actionsResult.data.filter((a) => !a.isAutoExecute));
      }
    } finally {
      setIsScanning(false);
    }
  }, []);

  const handleActionExecuted = useCallback(() => {
    // Force activity feed to re-fetch
    setFeedKey((k) => k + 1);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top bar: search + camera button */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <DashboardSearchBar onScan={handleScan} isScanning={isScanning} />
        </div>
        <Link
          href="/cards/scan"
          className="btn btn-ghost"
          style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
        >
          <Camera size={16} strokeWidth={1.8} />
          Cámara
        </Link>
      </div>

      {/* Scan error */}
      {scanError && (
        <div style={{
          padding: "10px 14px",
          background: "#fef2f2",
          border: "1px solid #fca5a5",
          borderRadius: 8,
          fontSize: 12.5,
          color: "#dc2626",
        }}>
          {scanError}
        </div>
      )}

      {/* Main content: active card + activity feed */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 1.4fr)",
        gap: 20,
        alignItems: "start",
      }}>
        {/* Left: Active card zone */}
        <div>
          <div style={{
            fontSize: 12, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.06em", color: "var(--color-muted)",
            marginBottom: 10,
          }}>
            Último carnet escaneado
          </div>
          <ActiveCardZone
            result={scanResult}
            manualActions={manualActions}
            onActionExecuted={handleActionExecuted}
          />
        </div>

        {/* Right: Activity feed */}
        <div>
          <ActivityFeed
            key={feedKey}
            initialEntries={initialFeedEntries}
            settings={settings}
            refreshIntervalMs={15000}
          />
        </div>
      </div>
    </div>
  );
}
