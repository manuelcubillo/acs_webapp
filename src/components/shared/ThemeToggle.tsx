"use client";

/**
 * ThemeToggle — binary light ↔ dark switch.
 *
 * Reads / writes the next-themes value via our combined ThemeProvider context.
 * Designed to fit in topbars and dialogs at icon size.
 */

import * as React from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useThemeContext } from "@/components/providers/ThemeProvider";

const TEXT = {
  TOOLTIP_TO_LIGHT: "Cambiar a modo claro",
  TOOLTIP_TO_DARK:  "Cambiar a modo oscuro",
  ARIA_LABEL:       "Cambiar tema",
} as const;

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useThemeContext();
  const [mounted, setMounted] = React.useState(false);

  // Resolve only after hydration to avoid icon mismatch between server (no theme
  // known) and client. Render a fixed placeholder until then.
  React.useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  const tooltip = isDark ? TEXT.TOOLTIP_TO_LIGHT : TEXT.TOOLTIP_TO_DARK;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={TEXT.ARIA_LABEL}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {/* Both icons rendered for layout stability; visibility flips on theme. */}
          <Sun className="hidden dark:block" />
          <Moon className="block dark:hidden" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
