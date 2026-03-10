"use client";

/**
 * HistoryPagination
 *
 * Offset-based pagination for the action history table.
 * Shows "Showing X-Y of Z entries", Prev/Next, surrounding page numbers,
 * first/last jump, and scrolls to top when page changes.
 */

interface HistoryPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** total >= COUNT_CAP (10001) → display ">10,000" */
  totalCapped?: boolean;
  onChange: (page: number) => void;
}

const COUNT_CAP = 10_001;

function getPageNumbers(current: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [];

  // Always show first page
  pages.push(1);

  if (current > 4) {
    pages.push("...");
  }

  const start = Math.max(2, current - 2);
  const end = Math.min(totalPages - 1, current + 2);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < totalPages - 3) {
    pages.push("...");
  }

  // Always show last page
  if (totalPages > 1) pages.push(totalPages);

  return pages;
}

export default function HistoryPagination({
  page,
  pageSize,
  total,
  totalCapped,
  onChange,
}: HistoryPaginationProps) {
  const isCapped = total >= COUNT_CAP;
  const displayTotal = isCapped ? ">10,000" : total.toLocaleString("es-ES");

  const totalPages = isCapped
    ? Math.ceil(COUNT_CAP / pageSize)
    : Math.ceil(total / pageSize);

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const handleChange = (p: number) => {
    if (p < 1 || p > totalPages) return;
    onChange(p);
    // Scroll to top of the page
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pageNumbers = getPageNumbers(page, totalPages);

  const BTN: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 34,
    height: 34,
    padding: "0 8px",
    borderRadius: 7,
    border: "1px solid var(--color-border)",
    background: "#fff",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--color-dark)",
    cursor: "pointer",
    transition: "background 0.12s, border-color 0.12s",
    userSelect: "none",
  };

  const BTN_ACTIVE: React.CSSProperties = {
    ...BTN,
    background: "var(--color-primary, #2563eb)",
    borderColor: "var(--color-primary, #2563eb)",
    color: "#fff",
    fontWeight: 700,
  };

  const BTN_DISABLED: React.CSSProperties = {
    ...BTN,
    color: "var(--color-muted)",
    cursor: "not-allowed",
    opacity: 0.5,
  };

  if (total === 0) return null;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 12,
      marginTop: 16,
      fontSize: 13,
    }}>
      {/* Entry count */}
      <span style={{ color: "var(--color-muted)", whiteSpace: "nowrap" }}>
        {total === 0
          ? "Sin resultados"
          : `Mostrando ${from.toLocaleString("es-ES")}–${to.toLocaleString("es-ES")} de ${displayTotal} entradas`}
      </span>

      {/* Page controls */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          {/* First */}
          <button
            style={page === 1 ? BTN_DISABLED : BTN}
            disabled={page === 1}
            onClick={() => handleChange(1)}
            title="Primera página"
            aria-label="Primera página"
          >
            «
          </button>

          {/* Prev */}
          <button
            style={page === 1 ? BTN_DISABLED : BTN}
            disabled={page === 1}
            onClick={() => handleChange(page - 1)}
            title="Página anterior"
            aria-label="Página anterior"
          >
            ‹
          </button>

          {/* Page numbers */}
          {pageNumbers.map((p, idx) =>
            p === "..." ? (
              <span
                key={`ellipsis-${idx}`}
                style={{ padding: "0 4px", color: "var(--color-muted)", userSelect: "none" }}
              >
                …
              </span>
            ) : (
              <button
                key={p}
                style={p === page ? BTN_ACTIVE : BTN}
                onClick={() => handleChange(p as number)}
                aria-current={p === page ? "page" : undefined}
              >
                {p}
              </button>
            )
          )}

          {/* Next */}
          <button
            style={page === totalPages ? BTN_DISABLED : BTN}
            disabled={page === totalPages}
            onClick={() => handleChange(page + 1)}
            title="Página siguiente"
            aria-label="Página siguiente"
          >
            ›
          </button>

          {/* Last */}
          <button
            style={page === totalPages ? BTN_DISABLED : BTN}
            disabled={page === totalPages}
            onClick={() => handleChange(totalPages)}
            title="Última página"
            aria-label="Última página"
          >
            »
          </button>
        </div>
      )}
    </div>
  );
}
