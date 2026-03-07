"use client";

import { X } from "lucide-react";

interface ScannerOverlayProps {
  children: React.ReactNode;
  onClose: () => void;
  title?: string;
  hint?: string;
}

export default function ScannerOverlay({
  children,
  onClose,
  title = "Escanear código",
  hint = "Apunta la cámara al código QR o de barras del carnet",
}: ScannerOverlayProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.92)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.15)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
        }}
      >
        <X size={20} />
      </button>

      <h2
        style={{
          color: "#fff",
          fontSize: 18,
          fontWeight: 700,
          margin: "0 0 20px",
          fontFamily: "var(--font-heading)",
        }}
      >
        {title}
      </h2>

      {children}

      <p
        style={{
          color: "rgba(255,255,255,0.5)",
          fontSize: 13,
          marginTop: 20,
          textAlign: "center",
          maxWidth: 320,
        }}
      >
        {hint}
      </p>
    </div>
  );
}
