import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose className strings safely with conflict resolution.
 *
 * `clsx` flattens conditional class arguments; `twMerge` removes
 * conflicting Tailwind utilities so the last one wins (e.g.
 * `cn("p-2", isLarge && "p-4")` collapses to `p-4`).
 *
 * Canonical helper for every component in the codebase.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
