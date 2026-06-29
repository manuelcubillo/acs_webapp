"use client";

/**
 * HistoryScanToggle
 *
 * Small inline toggle that immediately shows/hides scan entries
 * without requiring the "Apply" button.
 */

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const TEXT = {
  LABEL: "Mostrar escaneos",
} as const;

interface HistoryScanToggleProps {
  showScans: boolean;
  onChange: (show: boolean) => void;
  disabled?: boolean;
}

export default function HistoryScanToggle({
  showScans,
  onChange,
  disabled,
}: HistoryScanToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        id="history-scan-toggle"
        checked={showScans}
        onCheckedChange={onChange}
        disabled={disabled}
      />
      <Label
        htmlFor="history-scan-toggle"
        className="cursor-pointer text-sm font-medium text-foreground"
      >
        {TEXT.LABEL}
      </Label>
    </div>
  );
}
