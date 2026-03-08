"use client";

/**
 * QuickCodeInput — Manual card-code lookup widget for the dashboard.
 *
 * Behaviour
 * ─────────────────────────────────────────────────────────────────────────────
 * • "Buscar" button is always visible next to the input.
 * • Enter or clicking "Buscar" triggers the lookup.
 * • On success: field is cleared and the router navigates to the card detail.
 * • On failure: inline error shown; field value kept so the user can correct it.
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { lookupCard } from "./actions";

export default function QuickCodeInput() {
  const [code, setCode] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // ── Search ────────────────────────────────────────────────────────────────

  const performSearch = useCallback(
    async (searchCode: string) => {
      const trimmed = searchCode.trim();
      if (!trimmed || isSearching) return;

      setIsSearching(true);
      setError(null);

      const result = await lookupCard(trimmed);

      setIsSearching(false);

      if (result.found && result.code) {
        setCode("");
        router.push(`/cards/${encodeURIComponent(result.code)}`);
      } else {
        setError(result.error ?? "No encontrado");
      }
    },
    [isSearching, router],
  );

  // ── Event handlers ────────────────────────────────────────────────────────

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    performSearch(code);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const hasCode = code.trim().length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

        {/* Text input */}
        <div style={{ position: "relative" }}>
          <input
            type="text"
            value={code}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Código del carnet…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={isSearching}
            style={{
              height: 48,
              padding: "0 14px",
              paddingRight: isSearching ? 38 : 14,
              borderRadius: 10,
              border: `1.5px solid ${error ? "#dc2626" : "var(--color-border)"}`,
              fontSize: 14,
              color: "var(--color-dark)",
              background: isSearching ? "#f9fafb" : "#fff",
              outline: "none",
              width: 220,
              transition: "border-color 0.15s, background 0.15s",
              boxSizing: "border-box",
            }}
          />

          {/* Inline spinner while searching */}
          {isSearching && (
            <span
              aria-label="Buscando…"
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                width: 16,
                height: 16,
                border: "2.5px solid #e2e8f0",
                borderTopColor: "#6366f1",
                borderRadius: "50%",
                animation: "qs-spin 0.7s linear infinite",
                display: "block",
              }}
            />
          )}
        </div>

        {/* "Buscar" button — always visible */}
        <button
          onClick={() => performSearch(code)}
          disabled={!hasCode || isSearching}
          style={{
            height: 48,
            padding: "0 18px",
            borderRadius: 10,
            border: "none",
            background: "var(--color-dark, #0f172a)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: hasCode && !isSearching ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            gap: 6,
            opacity: hasCode && !isSearching ? 1 : 0.35,
            transition: "opacity 0.15s ease",
            flexShrink: 0,
          }}
        >
          <Search size={15} strokeWidth={2.2} />
          Buscar
        </button>
      </div>

      {/* Inline error */}
      {error && (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: 12,
            color: "#dc2626",
            paddingLeft: 2,
          }}
        >
          {error}
        </p>
      )}

      {/* Keyframe for the spinner */}
      <style>{`
        @keyframes qs-spin {
          from { transform: translateY(-50%) rotate(0deg); }
          to   { transform: translateY(-50%) rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
