/**
 * Normalization for the native `<input type="date">` used by card date fields.
 *
 * The value a card form holds for a `date` field is not a uniform shape: it is
 * a `Date` when it comes from the database (`value_date` is a `timestamp`, so
 * `extractValue` hands back a `Date` that crosses the RSC boundary intact), and
 * a `YYYY-MM-DD` string once the operator picks one, because that is what the
 * input emits.
 *
 * A native date input silently DISCARDS any value that is not `YYYY-MM-DD`, so
 * a bad normalization does not fail loudly: the input renders blank while React
 * still believes it holds a value. The browser then treats the control as
 * unassigned, and its picker opens on — and commits — TODAY at the first
 * interaction. That is why anything unparseable maps to `""` here rather than
 * being passed through: an empty input is honest, an invalid one is a trap.
 */

/**
 * Format a `Date` as `YYYY-MM-DD` using LOCAL calendar components.
 *
 * Deliberately not `toISOString()`: stored dates are midnights, and converting
 * them to UTC shifts them to the previous day under any positive offset (the
 * tenant operates in Europe/Madrid).
 */
function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Matches the leading `YYYY-MM-DD` of a plain date or an ISO timestamp. */
const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/**
 * Convert any stored date representation into the `YYYY-MM-DD` string a native
 * date input accepts.
 *
 * @param value - The raw form value: `Date`, string, null/undefined or anything else.
 * @returns The `YYYY-MM-DD` string, or `""` when there is no usable date.
 */
export function toDateInputValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : formatLocalDate(value);
  }

  if (typeof value === "string") {
    // Already date-shaped (`2026-08-27` or `2026-08-27T00:00:00.000Z`): take the
    // date part verbatim, so no timezone conversion can move it a day.
    const match = ISO_DATE_PREFIX.exec(value);
    if (match) return match[1];

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : formatLocalDate(parsed);
  }

  return "";
}
