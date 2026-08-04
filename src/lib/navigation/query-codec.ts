/**
 * Primitives for reading view state out of a query string.
 *
 * Two list surfaces keep their view state in the URL — `/history` (see
 * `src/lib/history/filter-params.ts`) and `/cards` (see
 * `src/lib/cards/list-params.ts`). Both parse the same kinds of value, and both
 * parse untrusted input, so "what a valid id / page number / field filter looks
 * like in a URL" is defined once here rather than once per surface.
 *
 * Everything is defensive and nothing throws. An unreadable value is dropped,
 * so the worst outcome is "no filter" — never a Zod error at the Server Action
 * boundary, which would surface to the operator as a silently empty table.
 *
 * Dependency-free on purpose: imported by server pages AND client components,
 * so it must not pull in anything `server-only`.
 */

import type { FieldFilter, FieldFilterOperator } from "@/lib/dal/types";

/** What a Next.js server page receives, or what a client component builds. */
export type RawParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIELD_FILTER_OPERATORS: readonly FieldFilterOperator[] = [
  "contains", "starts_with", "equals_text",
  "eq", "gt", "lt", "gte", "lte", "between",
  "is_true", "is_false",
  "date_eq", "date_before", "date_after", "date_between",
];

/** Read a single value, whatever shape the params arrived in. */
export function readParam(raw: RawParams, key: string): string | undefined {
  const value = raw instanceof URLSearchParams ? raw.get(key) : raw[key];
  // A repeated param (`?ct=a&ct=b`) arrives as an array — take the first, the
  // lists here are comma-separated by construction.
  const single = Array.isArray(value) ? value[0] : value;
  return typeof single === "string" && single.length > 0 ? single : undefined;
}

export function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Comma-separated ids; anything that is not a UUID is dropped. */
export function parseUuidList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((v) => v.trim()).filter((v) => UUID_RE.test(v));
}

/** 1-based page number, clamped. A garbage value means page 1, not an error. */
export function parsePage(value: string | undefined): number {
  const page = Number(value);
  if (!Number.isFinite(page)) return 1;
  return Math.max(1, Math.floor(page));
}

/**
 * Field filters travel as JSON — they are structured (ids + operator + a value
 * that may be a scalar or a `{ min, max }` range), and no flat encoding of that
 * is easier to read than the JSON itself.
 *
 * A filter is kept only if it has at least one UUID field id and a known
 * operator; the value is passed through, since its valid shape depends on the
 * operator and the DAL is what interprets it.
 */
export function parseFieldFilters(value: string | undefined): FieldFilter[] {
  if (!value) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: FieldFilter[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<FieldFilter>;

    const ids = Array.isArray(candidate.fieldDefinitionIds)
      ? candidate.fieldDefinitionIds.filter(
          (id): id is string => typeof id === "string" && UUID_RE.test(id),
        )
      : [];
    if (ids.length === 0) continue;

    const operator = candidate.operator;
    if (
      typeof operator !== "string" ||
      !FIELD_FILTER_OPERATORS.includes(operator as FieldFilterOperator)
    ) {
      continue;
    }

    out.push({
      fieldDefinitionIds: ids,
      operator: operator as FieldFilterOperator,
      value: candidate.value ?? null,
    });
  }
  return out;
}
