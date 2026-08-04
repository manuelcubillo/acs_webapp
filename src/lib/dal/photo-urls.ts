/**
 * Helpers that resolve photo object keys to signed read URLs for rendering.
 *
 * Server-only — these functions hit the storage layer to mint presigned
 * GETs. They are not exported through the DAL barrel because they live a
 * step above pure data access (they cross-cut with the storage module),
 * but they belong here for proximity with the row shapes they enrich.
 */

import "server-only";
import { signPhotoForReadOptional, signPhotosForRead } from "@/lib/storage/read";
import type { CardWithFields, EnrichedFieldValue } from "./types";

/**
 * Replace each photo field's `value` (object key) with a signed read URL.
 * Other field types are left untouched. Used by server components before
 * passing card data to client renderers.
 */
export async function signCardPhotos(
  card: CardWithFields,
): Promise<CardWithFields> {
  const photoKeys = card.fields
    .filter((f) => f.fieldType === "photo")
    .map((f) => (typeof f.value === "string" ? f.value : null));

  if (photoKeys.length === 0) return card;

  const signed = await signPhotosForRead(photoKeys);
  const fields: EnrichedFieldValue[] = card.fields.map((f) => {
    if (f.fieldType !== "photo") return f;
    const key = typeof f.value === "string" && f.value.length > 0 ? f.value : null;
    return { ...f, value: key ? signed.get(key) ?? null : null };
  });
  return { ...card, fields };
}

/**
 * Replace each photo field's `value` (object key) with a plain presence flag.
 *
 * For surfaces that address photos through the stable route
 * (`cardPhotoRoute`, ADR `2026-07-17-stable-photo-routes.md`) the key is never
 * the client-facing address — the renderer only needs to know whether the field
 * holds an object at all. Shipping the key anyway would leak it into the
 * browser, which `src/lib/storage/read.ts` forbids and which the ADR rejected
 * explicitly when it declined to put keys in the route path.
 *
 * Applies to every producer of a card list, so a client-side refetch returns
 * the same shape the server rendered.
 */
export function stripCardListPhotoKeys(
  cards: CardWithFields[],
): CardWithFields[] {
  return cards.map((c) => ({
    ...c,
    fields: c.fields.map((f) => {
      if (f.fieldType !== "photo") return f;
      const hasPhoto = typeof f.value === "string" && f.value.length > 0;
      // `raw` is the untouched field_values row, so it carries the key a second
      // time in `value_text`. Redact both or the key ships anyway.
      return { ...f, value: hasPhoto, raw: { ...f.raw, valueText: null } };
    }),
  }));
}

/**
 * Build a `{ fieldDefinitionId → signedUrl }` map from a card's fields.
 * Used for prefilling the form preview state on the edit page.
 */
export async function buildPhotoReadUrlMap(
  card: CardWithFields,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    card.fields
      .filter((f) => f.fieldType === "photo" && typeof f.value === "string")
      .map(async (f) => {
        const url = await signPhotoForReadOptional(f.value as string);
        if (url) out[f.fieldDefinitionId] = url;
      }),
  );
  return out;
}
