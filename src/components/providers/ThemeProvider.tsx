"use client";

/**
 * ThemeProvider
 *
 * Two-dimensional theme:
 *   1. Mode  — light / dark / system (handled by next-themes via the .dark class)
 *   2. Brand — indigo / cobalt / violet (handled here via data-brand on <html>)
 *
 * Both dimensions persist to localStorage and are FOUC-safe — next-themes
 * injects a synchronous script that sets the mode before first paint; the
 * brand init script in `<head>` (see `src/app/layout.tsx`) does the same for
 * the brand attribute.
 *
 * Usage in components:
 *   const { theme, setTheme, brand, setBrand } = useThemeContext();
 */

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";

export type BrandVariant = "indigo" | "cobalt" | "violet";

/** Stable list — also consumed by the styleguide switcher. */
export const BRAND_VARIANTS: BrandVariant[] = ["indigo", "cobalt", "violet"];

/** localStorage key for the brand attribute. */
export const BRAND_STORAGE_KEY = "acs-brand";

/** Default brand if nothing is persisted. */
export const DEFAULT_BRAND: BrandVariant = "indigo";

// ─── Brand context ──────────────────────────────────────────────────────────

interface BrandContextValue {
  brand: BrandVariant;
  setBrand: (brand: BrandVariant) => void;
}

const BrandContext = React.createContext<BrandContextValue | null>(null);

function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrandState] = React.useState<BrandVariant>(DEFAULT_BRAND);

  // Sync from the value the FOUC script already set on <html>.
  // Avoids a hydration flash from the React default.
  React.useEffect(() => {
    const fromAttr = document.documentElement.getAttribute("data-brand") as BrandVariant | null;
    if (fromAttr && BRAND_VARIANTS.includes(fromAttr)) {
      setBrandState(fromAttr);
    }
  }, []);

  const setBrand = React.useCallback((next: BrandVariant) => {
    setBrandState(next);
    document.documentElement.setAttribute("data-brand", next);
    try {
      localStorage.setItem(BRAND_STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable (privacy mode, cookies off) — non-fatal.
    }
  }, []);

  const value = React.useMemo(() => ({ brand, setBrand }), [brand, setBrand]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

function useBrand(): BrandContextValue {
  const ctx = React.useContext(BrandContext);
  if (!ctx) {
    throw new Error("useBrand must be used inside <ThemeProvider>.");
  }
  return ctx;
}

// ─── Public combined provider ───────────────────────────────────────────────

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="acs-theme"
    >
      <BrandProvider>
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
      </BrandProvider>
    </NextThemesProvider>
  );
}

// ─── Public combined hook ───────────────────────────────────────────────────

export interface ThemeContext {
  /** Resolved theme: "light" or "dark". Undefined on first render before hydration. */
  resolvedTheme: "light" | "dark" | undefined;
  /** User preference: "light" | "dark" | "system" | undefined while mounting. */
  theme: string | undefined;
  setTheme: (theme: "light" | "dark" | "system") => void;
  brand: BrandVariant;
  setBrand: (brand: BrandVariant) => void;
}

export function useThemeContext(): ThemeContext {
  const { theme, resolvedTheme, setTheme } = useNextTheme();
  const { brand, setBrand } = useBrand();
  return {
    theme,
    resolvedTheme: resolvedTheme as ThemeContext["resolvedTheme"],
    setTheme: setTheme as ThemeContext["setTheme"],
    brand,
    setBrand,
  };
}

// ─── FOUC-safe brand init script ────────────────────────────────────────────

/**
 * Inline script body that runs synchronously in `<head>` to set `data-brand`
 * on `<html>` BEFORE first paint. Avoids a brand-color flash on reload.
 *
 * Embed via `<script dangerouslySetInnerHTML={{ __html: brandInitScript }} />`
 * inside `<head>` of the root layout.
 */
export const brandInitScript = `
(function(){try{
  var k="${BRAND_STORAGE_KEY}";
  var v=localStorage.getItem(k);
  var allowed=${JSON.stringify(BRAND_VARIANTS)};
  if(!v||allowed.indexOf(v)===-1)v="${DEFAULT_BRAND}";
  document.documentElement.setAttribute("data-brand",v);
}catch(e){
  document.documentElement.setAttribute("data-brand","${DEFAULT_BRAND}");
}})();
`.trim();
