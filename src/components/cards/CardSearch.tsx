"use client";

import { useState, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Camera, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useExternalScanner } from "@/hooks/useExternalScanner";
import { cn } from "@/lib/utils";
import type { ScanMode } from "@/lib/dal/types";

const TEXT = {
  PLACEHOLDER:   "Buscar por código…",
  BTN_SEARCH:    "Buscar",
  ARIA_CAMERA:   "Escanear con cámara",
  ARIA_CLEAR:    "Limpiar búsqueda",
} as const;

const QRScanner = dynamic(() => import("./scanner/QRScanner"), { ssr: false });
const ScannerOverlay = dynamic(() => import("./scanner/ScannerOverlay"), { ssr: false });

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
  const [showCamera, setShowCamera] = useState(false);

  const cameraEnabled = scanMode === "camera" || scanMode === "both";
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

  function handleQRScan(code: string) {
    setShowCamera(false);
    setQuery(code);
    navigate(code);
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
    <>
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

        {cameraEnabled && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowCamera(true)}
                aria-label={TEXT.ARIA_CAMERA}
              >
                <Camera />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{TEXT.ARIA_CAMERA}</TooltipContent>
          </Tooltip>
        )}
      </form>

      {showCamera && (
        <ScannerOverlay onClose={() => setShowCamera(false)}>
          <QRScanner onScan={handleQRScan} />
        </ScannerOverlay>
      )}
    </>
  );
}
