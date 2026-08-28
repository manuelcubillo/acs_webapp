/**
 * Operator-facing lifecycle status labels.
 *
 * Two surfaces render them: `CardStatusBadge` (the chip on a card) and the
 * `/history` Detail column, which spells out a lifecycle transition as
 * `Activo → Archivado`. Defined once so the two cannot disagree about what a
 * status is called.
 *
 * Dependency-free — imported by client components and the server-side CSV
 * builder alike. Spanish, not i18n-wrapped; i18n is out of scope project-wide.
 */

import type { LifecycleStatus } from "@/lib/dal/types";

export const LIFECYCLE_STATUS_LABEL: Record<LifecycleStatus, string> = {
  active: "Activo",
  inactive: "Inactivo",
  expired: "Expirado",
  archived: "Archivado",
};

/**
 * Label a status read out of jsonb, where it is only `unknown`.
 *
 * @param value - A `metadata.from` / `metadata.to` value.
 * @returns The Spanish label, or the raw string when the value is not a known
 *          status — an unrecognised transition still has to render something.
 */
export function lifecycleStatusLabel(value: unknown): string {
  if (typeof value !== "string") return "—";
  return LIFECYCLE_STATUS_LABEL[value as LifecycleStatus] ?? value;
}
