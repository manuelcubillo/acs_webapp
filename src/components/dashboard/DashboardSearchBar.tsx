"use client";

/**
 * DashboardSearchBar — operational scan input.
 *
 * Behavior:
 *   - Autofocus on mount, and refocus after every scan (immediate reader capture).
 *   - Enter submits → onScan(code) (parent handles executeScanWithAutoActionsAction).
 *   - External reader keystrokes land in this input via natural focus alone.
 *     `useExternalScanner` is NOT mounted on the dashboard route, so this field
 *     holding focus is the ONLY thing that makes the HID reader work here.
 *   - A code read while the dashboard is busy is QUEUED, not dropped. See the
 *     queue block below.
 *
 * Presentation built on shadcn Input + Button. Token-driven, no hex, no inline styles.
 * Visually the primary operational action on the page.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { Camera, Loader2, ScanLine, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const TEXT = {
  PLACEHOLDER:  "Escanea o introduce el código del carnet…",
  BTN_SCAN:     "Escanear",
  BTN_SCANNING: "Escaneando…",
  BTN_CAMERA:   "Cámara",
  ARIA_INPUT:   "Código del carnet",
  ARIA_SUBMIT:  "Iniciar escaneo",
  HINT:         "Pulsa Enter para escanear. El lector externo escribe directamente aquí.",
  QUEUED: (n: number) =>
    n === 1
      ? "1 código en cola — se escaneará al terminar el actual."
      : `${n} códigos en cola — se escanearán al terminar el actual.`,
} as const;

interface DashboardSearchBarProps {
  onScan: (code: string) => Promise<void>;
  /** A scan is in flight. Drives the busy affordance on the submit button. */
  isScanning: boolean;
  /**
   * The dashboard is mid-decision or mid-mutation: a confirmation modal is
   * open, a resume is running, or a manual action is executing. Queued codes
   * must WAIT for this to clear — every one of those flows reads `activeCard`,
   * and a scan slipping in would replace it underneath them.
   */
  isBlocked?: boolean;
}

export default function DashboardSearchBar({
  onScan,
  isScanning,
  isBlocked = false,
}: DashboardSearchBarProps) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Codes read while the dashboard was busy, oldest first.
   *
   * A ref, not state: it is the authoritative queue and must not put itself in
   * the drain effect's dependencies — an effect that re-runs on every queue
   * mutation could drain twice for one completed scan and put two scans in
   * flight at once. `queueDepth` mirrors the length for display only.
   *
   * Held to ONE slot per read, never collapsed: at a door each read is a person
   * whose entry has to be logged, so dropping the middle of a burst would be
   * the same silent-loss bug this queue exists to fix.
   */
  const queueRef = useRef<string[]>([]);
  const [queueDepth, setQueueDepth] = useState(0);

  // Same reason as above: keeps `onScan` out of the drain effect's deps.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const isBusy = isScanning || isBlocked;

  /**
   * Refocus the field and drain ONE queued code, on every transition back to
   * idle. Each drained scan flips `isScanning` true → false again, which
   * re-runs this effect and takes the next one, so a burst drains in order.
   *
   * The refocus cannot live in `handleSubmit`'s continuation — that runs in the
   * promise microtask, before React has committed `isScanning: false`, so a
   * `focus()` there would fire while the field is still mid-scan.
   */
  useEffect(() => {
    if (isBusy) return;
    inputRef.current?.focus();

    const next = queueRef.current.shift();
    if (next === undefined) return;
    setQueueDepth(queueRef.current.length);
    void onScanRef.current(next);
  }, [isBusy]);

  const handleSubmit = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) return;

    // Cleared BEFORE the await, never after: a reader can start the next burst
    // while this scan is in flight, and a post-await clear would wipe those
    // characters mid-code and submit a truncated one.
    setCode("");

    if (isBusy) {
      queueRef.current.push(trimmed);
      setQueueDepth(queueRef.current.length);
      return;
    }

    await onScan(trimmed);
  }, [code, isBusy, onScan]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const submitDisabled = isScanning || !code.trim();

  return (
    <section
      aria-label="Escaneo operacional"
      aria-busy={isBusy}
      className={cn(
        "rounded-2xl border bg-card shadow-sm",
        "border-border ring-1 ring-transparent",
        "transition-shadow focus-within:ring-ring/40 focus-within:shadow-md",
      )}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-stretch sm:gap-3 sm:p-5">
        <div className="relative flex-1">
          <ScanLine
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2",
              "text-muted-foreground",
            )}
            strokeWidth={1.8}
          />
          <Input
            ref={inputRef}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={TEXT.PLACEHOLDER}
            aria-label={TEXT.ARIA_INPUT}
            // Never `disabled`, and never `readOnly` either: a disabled control
            // cannot hold focus (the browser blurs it the moment a scan starts,
            // and the next read goes nowhere), and a read-only one swallows the
            // characters the queue needs. The field stays writable throughout;
            // `handleSubmit` decides whether Enter scans or queues.
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className={cn(
              "h-12 w-full rounded-xl pl-12 pr-4 text-base font-medium",
              "placeholder:text-muted-foreground/70",
            )}
          />
        </div>

        <Button
          type="button"
          size="lg"
          className="h-12 rounded-xl px-6 text-sm font-semibold"
          onClick={handleSubmit}
          disabled={submitDisabled}
          aria-label={TEXT.ARIA_SUBMIT}
        >
          {isScanning ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Search />
          )}
          <span>{isScanning ? TEXT.BTN_SCANNING : TEXT.BTN_SCAN}</span>
        </Button>

        <Button
          type="button"
          size="lg"
          variant="outline"
          className="h-12 rounded-xl px-5 text-sm font-medium"
          asChild
        >
          <Link href="/cards/scan">
            <Camera />
            <span>{TEXT.BTN_CAMERA}</span>
          </Link>
        </Button>
      </div>

      <p
        aria-live="polite"
        className={cn(
          "border-t border-border bg-muted/40 px-5 py-2 text-xs",
          queueDepth > 0 ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {queueDepth > 0 ? TEXT.QUEUED(queueDepth) : TEXT.HINT}
      </p>
    </section>
  );
}
