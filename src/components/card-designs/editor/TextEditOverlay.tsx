"use client";

/**
 * TextEditOverlay
 *
 * Renders an inline <textarea> for editing a Konva text node's static value.
 * The overlay is positioned exactly over the text node on the canvas
 * (via screen-space coords computed by EditorCanvas) and is centered with
 * a small floating toolbar to make text entry comfortable on any node size.
 *
 * - Enter alone: commits and exits.
 * - Shift+Enter: inserts a newline.
 * - Escape: cancels (no value change).
 * - Click outside: commits.
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";

interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  /** Absolute (viewport) screen rect of the underlying text node. */
  screenRect: ScreenRect;
  fontSize: number;
  fontFamily: string;
  color: string;
  align: "left" | "center" | "right";
}

const MIN_WIDTH = 160;
const MIN_HEIGHT = 36;

export default function TextEditOverlay({
  value,
  onChange,
  onCommit,
  onCancel,
  screenRect,
  fontSize,
  fontFamily,
  color,
  align,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus + select on mount.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  // Commit on outside click.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const c = containerRef.current;
      if (!c) return;
      if (!c.contains(e.target as Node)) onCommit();
    }
    // Listen on the next frame so the click that opened the overlay
    // doesn't immediately close it.
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", onMouseDown);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [onCommit]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      onCommit();
      return;
    }
    // Allow Delete/Backspace through (don't trigger node delete on canvas).
    if (e.key === "Delete" || e.key === "Backspace") {
      e.stopPropagation();
    }
  }

  // Anchor the editor to the node, but pad/clamp size so the textarea is
  // always usable even when the node is tiny.
  const width = Math.max(screenRect.width, MIN_WIDTH);
  const height = Math.max(screenRect.height, MIN_HEIGHT);
  // Center the textarea on the node when we have to enlarge it.
  const left = screenRect.left - (width - screenRect.width) / 2;
  const top = screenRect.top - (height - screenRect.height) / 2;
  const displayFontSize = Math.max(fontSize, 13);

  return createPortal(
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      {/* Toolbar — sits just above the textarea */}
      <div
        style={{
          position: "absolute",
          left,
          top: top - 34,
          width,
          display: "flex",
          gap: 4,
          justifyContent: "flex-end",
          pointerEvents: "auto",
        }}
      >
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCancel}
          title="Cancelar (Esc)"
          style={toolbarBtn("danger")}
        >
          <X size={13} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCommit}
          title="Confirmar (Enter)"
          style={toolbarBtn("primary")}
        >
          <Check size={13} strokeWidth={2.2} />
        </button>
      </div>

      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        style={{
          position: "absolute",
          left,
          top,
          width,
          height,
          fontSize: displayFontSize,
          fontFamily,
          color,
          textAlign: align,
          background: "#ffffff",
          border: "2px solid var(--color-primary)",
          borderRadius: 6,
          padding: "6px 8px",
          resize: "none",
          outline: "none",
          lineHeight: 1.3,
          boxSizing: "border-box",
          boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
          pointerEvents: "auto",
        }}
      />
    </div>,
    document.body,
  );
}

function toolbarBtn(variant: "primary" | "danger"): React.CSSProperties {
  const colors =
    variant === "primary"
      ? { bg: "var(--color-primary)", color: "#fff", border: "var(--color-primary)" }
      : { bg: "#fff", color: "#dc2626", border: "#fca5a5" };
  return {
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    border: `1.5px solid ${colors.border}`,
    background: colors.bg,
    color: colors.color,
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(15,23,42,0.15)",
  };
}
