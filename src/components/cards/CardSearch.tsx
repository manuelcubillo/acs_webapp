"use client";

import { useState, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { QrCode, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExternalScanner } from "@/hooks/useExternalScanner";
import { cn } from "@/lib/utils";
import type { ScanMode } from "@/lib/dal/types";

const TEXT = {
  PLACEHOLDER:   "Buscar por código…",
  BTN_SEARCH:    "Buscar",
  BTN_SCAN:      "Escanear",
  ARIA_CLEAR:    "Limpiar búsqueda",
} as const;

interface CardSearchProps {
  scanMode: ScanMode;
  defaultValue?: string;
  placeholder?: string;
  onSearch?: (q: string) => void;
}

export default function CardSearch({
  scanMode,
  defaultValue = "",
  placeholder = TEXT.PLACEHOLDER,
  onSearch,
}: CardSearchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(defaultValue);

  const externalEnabled = scanMode === "external_reader" || scanMode === "both";

  function navigate(q: string) {
    if (onSearch) {
      onSearch(q.trim());
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (q.trim()) {
      params.set("q", q.trim());
    } else {
      params.delete("q");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate(query);
  }

  function handleClear() {
    setQuery("");
    navigate("");
    inputRef.current?.focus();
  }

  useExternalScanner({
    onScan: (code) => {
      setQuery(code);
      navigate(code);
    },
    enabled: externalEnabled,
  });

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.8}
        />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className={cn("w-full pl-9", query && "pr-9")}
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={TEXT.ARIA_CLEAR}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" strokeWidth={2.2} />
          </button>
        )}
      </div>

      <Button type="submit" className="whitespace-nowrap">
        {TEXT.BTN_SEARCH}
      </Button>

      {/* Scan shortcut — the dedicated page owns both capture modes (camera and
          external reader), so this toolbar no longer opens a camera overlay. */}
      <Button asChild variant="outline" className="whitespace-nowrap">
        <Link href="/cards/scan">
          <QrCode className="size-3.5" strokeWidth={1.8} />
          {TEXT.BTN_SCAN}
        </Link>
      </Button>
    </form>
  );
}
