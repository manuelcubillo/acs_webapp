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
 * For an array of cards, sign every photo key in a single de-duplicated
 * batch. Returns a fresh array of cards with signed URLs in place of keys.
 */
export async function signCardListPhotos(
  cards: CardWithFields[],
): Promise<CardWithFields[]> {
  const allKeys: (string | null)[] = [];
  for (const c of cards) {
    for (const f of c.fields) {
      if (f.fieldType === "photo" && typeof f.value === "string") {
        allKeys.push(f.value);
      }
    }
  }
  if (allKeys.length === 0) return cards;

  const signed = await signPhotosForRead(allKeys);
  return cards.map((c) => ({
    ...c,
    fields: c.fields.map((f) => {
      if (f.fieldType !== "photo") return f;
      const key = typeof f.value === "string" && f.value.length > 0 ? f.value : null;
      return { ...f, value: key ? signed.get(key) ?? null : null };
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
