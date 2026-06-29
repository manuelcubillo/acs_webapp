/**
 * AuthShell
 *
 * Shared visual chrome for the (auth) routes: a token-based page background,
 * decorative brand-gradient blobs (brand-aware, follow data-brand), and a
 * centered glassmorphic card. Presentation only — no behavior.
 *
 * The blob gradients are decorative ambiance (NOT access-control state); they
 * reference the --brand-* alias namespace so they track the active brand.
 */

import { cn } from "@/lib/utils";

interface AuthShellProps {
  children: React.ReactNode;
  /** Optional footer line shown under the card. */
  footer?: string;
  /** Tailwind max-width utility for the card column (default max-w-sm). */
  maxWidthClassName?: string;
}

export function AuthShell({
  children,
  footer,
  maxWidthClassName = "max-w-sm",
}: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      {/* Animated decorative blobs — brand-aware, follow data-brand. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-40 -left-32 h-[580px] w-[580px] rounded-full opacity-30 blur-[90px]"
          style={{
            background:
              "radial-gradient(circle, var(--brand-300) 0%, var(--brand-400) 60%, transparent 100%)",
            animation: "drift1 22s linear infinite",
          }}
        />
        <div
          className="absolute top-1/2 -right-20 h-[420px] w-[420px] rounded-full opacity-25 blur-[80px]"
          style={{
            background:
              "radial-gradient(circle, var(--brand-200) 0%, var(--brand-300) 60%, transparent 100%)",
            animation: "drift2 28s linear infinite",
          }}
        />
        <div
          className="absolute -bottom-24 left-1/3 h-[340px] w-[340px] rounded-full opacity-20 blur-[70px]"
          style={{
            background:
              "radial-gradient(circle, var(--brand-200) 0%, transparent 80%)",
            animation: "drift1 18s linear infinite reverse",
          }}
        />
      </div>

      {/* Card column */}
      <div className={cn("animate-fadein relative z-10 w-full px-4", maxWidthClassName)}>
        <div className="rounded-2xl border border-primary/15 bg-card/85 px-9 pt-10 pb-8 shadow-xl backdrop-blur-xl">
          {children}
        </div>

        {footer && (
          <p className="mt-4 text-center text-xs text-muted-foreground">{footer}</p>
        )}
      </div>
    </div>
  );
}
