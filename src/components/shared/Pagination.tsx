"use client";

/**
 * Shared Pagination — offset-based, used by /cards, /history, /members.
 *
 * Behavior preserved: COUNT_CAP handling (">10.000"), scroll-to-top on page
 * change, page-range with ellipses around the current page.
 */

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TEXT = {
  SHOWING:       "Mostrando",
  OF:            "de",
  ARIA_FIRST:    "Primera página",
  ARIA_PREV:     "Página anterior",
  ARIA_NEXT:     "Página siguiente",
  ARIA_LAST:     "Última página",
  DEFAULT_LABEL: "carnets",
  ELLIPSIS:      "…",
  CAPPED_LABEL:  ">10.000",
} as const;

const COUNT_CAP = 10_001;

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  /** Label for the item count (default: "carnets"). */
  itemLabel?: string;
}

function getPageNumbers(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | "…")[] = [1];
  if (current > 4) pages.push("…");
  const start = Math.max(2, current - 2);
  const end = Math.min(totalPages - 1, current + 2);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < totalPages - 3) pages.push("…");
  if (totalPages > 1) pages.push(totalPages);
  return pages;
}

export default function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  isLoading,
  itemLabel = TEXT.DEFAULT_LABEL,
}: PaginationProps) {
  const isCapped = totalItems >= COUNT_CAP;
  const displayTotal = isCapped
    ? TEXT.CAPPED_LABEL
    : totalItems.toLocaleString("es-ES");
  const totalPages = isCapped
    ? Math.ceil(COUNT_CAP / pageSize)
    : Math.ceil(totalItems / pageSize);

  const from = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);

  const handleChange = (p: number) => {
    if (p < 1 || p > totalPages || isLoading) return;
    onPageChange(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  if (totalItems === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="whitespace-nowrap text-muted-foreground">
        {TEXT.SHOWING} {from.toLocaleString("es-ES")}–{to.toLocaleString("es-ES")}{" "}
        {TEXT.OF} {displayTotal} {itemLabel}
      </span>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          <NavButton
            disabled={currentPage === 1 || isLoading}
            onClick={() => handleChange(1)}
            ariaLabel={TEXT.ARIA_FIRST}
          >
            <ChevronFirst />
          </NavButton>
          <NavButton
            disabled={currentPage === 1 || isLoading}
            onClick={() => handleChange(currentPage - 1)}
            ariaLabel={TEXT.ARIA_PREV}
          >
            <ChevronLeft />
          </NavButton>

          {pageNumbers.map((p, idx) =>
            p === "…" ? (
              <span
                key={`e-${idx}`}
                aria-hidden
                className="select-none px-1 text-muted-foreground"
              >
                {p}
              </span>
            ) : (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={p === currentPage ? "default" : "outline"}
                aria-current={p === currentPage ? "page" : undefined}
                onClick={() => handleChange(p as number)}
                disabled={isLoading}
                className={cn(
                  "h-8 min-w-[2.25rem] px-2 text-xs font-semibold",
                  p === currentPage && "font-bold",
                )}
              >
                {p}
              </Button>
            ),
          )}

          <NavButton
            disabled={currentPage === totalPages || isLoading}
            onClick={() => handleChange(currentPage + 1)}
            ariaLabel={TEXT.ARIA_NEXT}
          >
            <ChevronRight />
          </NavButton>
          <NavButton
            disabled={currentPage === totalPages || isLoading}
            onClick={() => handleChange(totalPages)}
            ariaLabel={TEXT.ARIA_LAST}
          >
            <ChevronLast />
          </NavButton>
        </div>
      )}
    </div>
  );
}

function NavButton({
  disabled,
  onClick,
  ariaLabel,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {children}
    </Button>
  );
}
