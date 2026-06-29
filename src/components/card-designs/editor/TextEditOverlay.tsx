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
import { Button } from "@/components/ui/button";

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
      {/* Toolbar — sits just above the textarea.
          left/top/width are data-driven (screen-space coords of the node). */}
      <div
        className="pointer-events-auto absolute flex justify-end gap-1"
        style={{ left, top: top - 34, width }}
      >
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCancel}
          title="Cancelar (Esc)"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <X strokeWidth={2.2} />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCommit}
          title="Confirmar (Enter)"
        >
          <Check strokeWidth={2.2} />
        </Button>
      </div>

      {/* Editor — left/top/width/height/font/color/align are data-driven
          (mirror the underlying text node), kept inline. Chrome via classes. */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        className="pointer-events-auto absolute resize-none rounded-md border-2 border-primary bg-card px-2 py-1.5 leading-tight shadow-lg outline-none"
        style={{
          left,
          top,
          width,
          height,
          fontSize: displayFontSize,
          fontFamily,
          color,
          textAlign: align,
        }}
      />
    </div>,
    document.body,
  );
}
