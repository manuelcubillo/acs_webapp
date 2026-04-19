"use client";

/**
 * HistoryPagination
 *
 * Thin wrapper around shared Pagination for the action history page.
 */

import Pagination from "@/components/shared/Pagination";

interface HistoryPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  isLoading?: boolean;
}

export default function HistoryPagination({
  page,
  pageSize,
  total,
  onChange,
  isLoading,
}: HistoryPaginationProps) {
  return (
    <Pagination
      currentPage={page}
      totalItems={total}
      pageSize={pageSize}
      onPageChange={onChange}
      isLoading={isLoading}
      itemLabel="entradas"
    />
  );
}
