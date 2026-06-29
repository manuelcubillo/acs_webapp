"use client";

/**
 * QuickCodeInput — Manual card-code lookup widget for the dashboard.
 *
 * Behaviour (unchanged from previous implementation):
 *   - "Buscar" button is always visible next to the input.
 *   - Enter or clicking "Buscar" triggers the lookup.
 *   - On success: field is cleared and the router navigates to the card detail.
 *   - On failure: inline error shown; field value kept so the user can correct it.
 *
 * Presentation rebuilt on shadcn primitives + tokens. This is the informational
 * lookup widget — distinct from the operational DashboardSearchBar.
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { lookupCard } from "./actions";

const TEXT = {
  PLACEHOLDER: "Código del carnet…",
  BTN: "Buscar",
  ARIA_SEARCHING: "Buscando…",
  FALLBACK_ERROR: "No encontrado",
} as const;

export default function QuickCodeInput() {
  const [code, setCode] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
        setError(result.error ?? TEXT.FALLBACK_ERROR);
      }
    },
    [isSearching, router],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    performSearch(code);
  };

  const hasCode = code.trim().length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="relative w-56">
          <Input
            type="text"
            value={code}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={TEXT.PLACEHOLDER}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={isSearching}
            aria-invalid={error ? true : undefined}
            className={cn(
              "h-12 rounded-xl text-sm",
              isSearching && "pr-10",
            )}
          />
          {isSearching && (
            <Loader2
              aria-label={TEXT.ARIA_SEARCHING}
              className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          )}
        </div>

        <Button
          type="button"
          size="lg"
          onClick={() => performSearch(code)}
          disabled={!hasCode || isSearching}
          className="h-12 rounded-xl px-5 text-sm font-semibold"
        >
          <Search />
          {TEXT.BTN}
        </Button>
      </div>

      {error && (
        <p role="alert" className="pl-0.5 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
