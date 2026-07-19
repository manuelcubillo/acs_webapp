"use client";

/**
 * FlashMessage
 *
 * One-shot confirmation banner driven by a `?flash=` redirect (the project's
 * lightweight alternative to a toast library — see ADR decision A2 for phase 3).
 * The server page resolves the flash code to a human message and passes it here;
 * this component is purely presentational plus two concerns:
 *
 *   1. It strips the `flash` (and companion `n`) params from the URL on mount via
 *      `history.replaceState`, so a manual refresh does not replay the banner and
 *      no server refetch is triggered.
 *   2. It auto-dismisses after a short delay and can be closed manually.
 *
 * Built on the existing `Alert` primitive; no reserved `--state-*` colours (this
 * is a neutral confirmation, not a scan/action outcome).
 */

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const AUTO_DISMISS_MS = 6000;

const TEXT = {
  ARIA_CLOSE: "Cerrar aviso",
} as const;

interface FlashMessageProps {
  /** Resolved message. When empty/undefined, nothing renders. */
  message?: string;
  className?: string;
}

export default function FlashMessage({ message, className }: FlashMessageProps) {
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    if (!message) return;

    // Remove the flash params so a refresh does not replay the banner.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("flash") || url.searchParams.has("n")) {
        url.searchParams.delete("flash");
        url.searchParams.delete("n");
        window.history.replaceState(null, "", url.toString());
      }
    }

    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message || !visible) return null;

  return (
    <Alert className={cn("mb-4 flex items-center gap-2 pr-2", className)}>
      <CheckCircle2 aria-hidden strokeWidth={2} />
      <AlertDescription className="flex-1 text-foreground">
        {message}
      </AlertDescription>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label={TEXT.ARIA_CLOSE}
        className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-3.5" strokeWidth={2.2} />
      </button>
    </Alert>
  );
}
