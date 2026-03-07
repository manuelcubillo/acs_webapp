"use client";

import type { ScanMode } from "@/lib/dal/types";

/**
 * Derives camera/external-reader availability from the tenant's scan mode.
 *
 * The scanMode is loaded server-side and passed as a prop so this hook
 * has no async work to do — it's purely a convenience derivation.
 */
export function useScanMode(scanMode: ScanMode) {
  const showCamera = scanMode === "camera" || scanMode === "both";
  const showExternalReader =
    scanMode === "external_reader" || scanMode === "both";

  return { scanMode, showCamera, showExternalReader };
}
