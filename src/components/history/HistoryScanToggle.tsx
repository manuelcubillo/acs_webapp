"use client";

/**
 * HistoryScanToggle
 *
 * Small inline toggle that immediately shows/hides scan entries
 * without requiring the "Apply" button.
 */

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
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        userSelect: "none",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {/* Toggle track */}
      <div
        onClick={() => !disabled && onChange(!showScans)}
        style={{
          position: "relative",
          width: 36,
          height: 20,
          borderRadius: 10,
          background: showScans ? "var(--color-primary, #2563eb)" : "var(--color-border, #e5e7eb)",
          transition: "background 0.18s",
          flexShrink: 0,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {/* Toggle thumb */}
        <div
          style={{
            position: "absolute",
            top: 3,
            left: showScans ? 19 : 3,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            transition: "left 0.18s",
          }}
        />
      </div>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-dark)" }}>
        Mostrar escaneos
      </span>
    </label>
  );
}
