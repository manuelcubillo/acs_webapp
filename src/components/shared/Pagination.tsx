"use client";

/**
 * Shared Pagination
 *
 * Offset-based pagination component used by both the history page
 * and the cards listing page.
 */

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  /** Label for the item count (default: "carnets") */
  itemLabel?: string;
}

const COUNT_CAP = 10_001;

function getPageNumbers(current: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [1];
  if (current > 4) pages.push("...");
  const start = Math.max(2, current - 2);
  const end = Math.min(totalPages - 1, current + 2);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < totalPages - 3) pages.push("...");
  if (totalPages > 1) pages.push(totalPages);
  return pages;
}

export default function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  isLoading,
  itemLabel = "carnets",
}: PaginationProps) {
  const isCapped = totalItems >= COUNT_CAP;
  const displayTotal = isCapped ? ">10.000" : totalItems.toLocaleString("es-ES");
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

  const BTN: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: 34, height: 34, padding: "0 8px", borderRadius: 7,
    border: "1px solid var(--color-border)", background: "#fff",
    fontSize: 13, fontWeight: 500, color: "var(--color-dark)",
    cursor: isLoading ? "not-allowed" : "pointer",
    transition: "background 0.12s", userSelect: "none",
    opacity: isLoading ? 0.6 : 1,
  };
  const BTN_ACTIVE: React.CSSProperties = {
    ...BTN,
    background: "var(--color-primary, #2563eb)",
    borderColor: "var(--color-primary, #2563eb)",
    color: "#fff", fontWeight: 700,
  };
  const BTN_DISABLED: React.CSSProperties = {
    ...BTN, color: "var(--color-muted)", cursor: "not-allowed", opacity: 0.5,
  };

  if (totalItems === 0) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: 12, marginTop: 16, fontSize: 13,
    }}>
      <span style={{ color: "var(--color-muted)", whiteSpace: "nowrap" }}>
        Mostrando {from.toLocaleString("es-ES")}–{to.toLocaleString("es-ES")} de {displayTotal} {itemLabel}
      </span>

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          <button style={currentPage === 1 ? BTN_DISABLED : BTN} disabled={currentPage === 1 || isLoading} onClick={() => handleChange(1)} title="Primera página">«</button>
          <button style={currentPage === 1 ? BTN_DISABLED : BTN} disabled={currentPage === 1 || isLoading} onClick={() => handleChange(currentPage - 1)} title="Página anterior">‹</button>

          {pageNumbers.map((p, idx) =>
            p === "..." ? (
              <span key={`e-${idx}`} style={{ padding: "0 4px", color: "var(--color-muted)", userSelect: "none" }}>…</span>
            ) : (
              <button
                key={p}
                style={p === currentPage ? BTN_ACTIVE : BTN}
                onClick={() => handleChange(p as number)}
                aria-current={p === currentPage ? "page" : undefined}
              >
                {p}
              </button>
            )
          )}

          <button style={currentPage === totalPages ? BTN_DISABLED : BTN} disabled={currentPage === totalPages || isLoading} onClick={() => handleChange(currentPage + 1)} title="Página siguiente">›</button>
          <button style={currentPage === totalPages ? BTN_DISABLED : BTN} disabled={currentPage === totalPages || isLoading} onClick={() => handleChange(totalPages)} title="Última página">»</button>
        </div>
      )}
    </div>
  );
}
