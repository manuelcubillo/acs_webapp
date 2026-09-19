/**
 * Demo card photos.
 *
 * Two sources, one upload path. Personal cards get illustrated placeholders
 * fetched from the DiceBear avatar service, never photographs of real people:
 * the seed sent to the service is derived from an invented name, so nothing
 * identifying leaves the machine. Guest passes get a fixed graphic shipped in
 * `./assets`, because a bono belongs to a dwelling rather than to a person.
 *
 * The bytes land in the tenant's own object storage exactly as a real upload
 * would: same `card-photo` kind, same tenant-prefixed key layout, so every read
 * path (the stable photo route, the design renderer, the snapshot payload)
 * behaves identically to a card whose photo an administrator uploaded.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getPhotoStorage } from "../../src/lib/storage";
import { buildObjectKey } from "../../src/lib/storage/keys";

/** Illustrated portrait style — clearly a placeholder, never a real face. */
const STYLE = "avataaars";
const SIZE = 384;

/** Background tints cycled through so a list of cards is not monochrome. */
const BACKGROUNDS = ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf"] as const;

/**
 * Every holder smiles. The style's default variant set includes sad, worried
 * and screaming mouths, which read as alarming on an access badge, so the
 * mouth is pinned to the one friendly option and the eyes are restricted to
 * the variants that go with it.
 */
const EXPRESSION = "&mouth=smile&eyes=default,happy,wink";

const MAX_ATTEMPTS = 3;

/**
 * Fail before the first download if the photo bucket is not reachable.
 *
 * The seed spends a minute fetching avatars before it ever touches storage, so
 * a misconfigured bucket surfaces late and wastes the whole run — which is
 * exactly what `[SENSITIVE]` in `S3_BUCKET` did once, because `vercel env pull`
 * writes that placeholder for variables Vercel marks as sensitive.
 *
 * One HEAD against a key that does not exist is enough: what matters is that
 * the bucket answers. 404 (absent) and 403 (absent, and the caller cannot list)
 * both prove it is there; a 400 is the malformed-bucket case.
 */
export async function assertPhotoStorageReachable(tenantId: string): Promise<void> {
  const key = buildObjectKey({
    kind: "card-photo",
    tenantId,
    ownerId: crypto.randomUUID(),
    mime: "image/png",
  });

  let status: number;
  try {
    const url = await getPhotoStorage().getReadUrl(key, { ttlSeconds: 60 });
    status = (await fetch(url, { method: "HEAD" })).status;
  } catch (err) {
    throw new Error(
      `No se pudo alcanzar el almacén de fotos ` +
        `(STORAGE_DRIVER=${process.env.STORAGE_DRIVER ?? "minio"}): ${String(err)}`,
    );
  }

  if (status === 404 || status === 403 || status === 200) return;

  throw new Error(
    `El almacén de fotos respondió ${status} a una lectura de prueba ` +
      `(STORAGE_DRIVER=${process.env.STORAGE_DRIVER ?? "minio"}). ` +
      `Revisa S3_BUCKET y las credenciales del fichero de env del comando.`,
  );
}

/** Fetch one avatar as PNG bytes. */
async function fetchAvatar(seed: string, index: number): Promise<Buffer> {
  const background = BACKGROUNDS[index % BACKGROUNDS.length];
  const url =
    `https://api.dicebear.com/9.x/${STYLE}/png` +
    `?seed=${encodeURIComponent(seed)}&size=${SIZE}&backgroundColor=${background}` +
    EXPRESSION;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0) throw new Error("empty body");
      return bytes;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
  throw new Error(`No se pudo descargar el avatar "${seed}": ${String(lastError)}`);
}

/**
 * Store PNG bytes under a fresh card-photo key.
 *
 * `ownerId` mirrors what the create form does for a card that does not exist
 * yet: a throwaway UUID, because the key has to be minted before the card row.
 *
 * @returns The object key to write into the card's photo field value.
 */
async function storePhoto(tenantId: string, bytes: Buffer): Promise<string> {
  const key = buildObjectKey({
    kind: "card-photo",
    tenantId,
    ownerId: crypto.randomUUID(),
    mime: "image/png",
  });

  const { uploadUrl, requiredHeaders } = await getPhotoStorage().getUploadUrl({
    key,
    contentType: "image/png",
    contentLength: bytes.length,
    ttlSeconds: 300,
  });

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: requiredHeaders,
    body: new Uint8Array(bytes),
  });
  if (!res.ok) {
    throw new Error(`Fallo subiendo la foto (${res.status}): ${await res.text()}`);
  }

  return key;
}

/** Fetch one avatar and store it. */
export async function uploadDemoAvatar(args: {
  tenantId: string;
  seed: string;
  index: number;
}): Promise<string> {
  return storePhoto(args.tenantId, await fetchAvatar(args.seed, args.index));
}

/** The graphic every guest pass carries instead of a portrait. */
const GUEST_PHOTO_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  "assets",
  "acceso-invitado.png",
);

/**
 * Upload the guest-pass graphic once and hand back its key.
 *
 * Every bono card points at this same object. Nothing in the app deletes a
 * stored photo — replacing a card's photo writes a new key and leaves the old
 * object in place — so the cards cannot invalidate each other's image, and the
 * demo avoids fifty copies of identical bytes.
 */
export async function uploadGuestPhoto(tenantId: string): Promise<string> {
  return storePhoto(tenantId, await readFile(GUEST_PHOTO_FILE));
}

/** Upload `seeds.length` avatars with a small concurrency window. */
export async function uploadDemoAvatars(
  tenantId: string,
  seeds: readonly string[],
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const keys = new Array<string>(seeds.length);
  const CONCURRENCY = 6;
  let next = 0;
  let done = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= seeds.length) return;
      keys[index] = await uploadDemoAvatar({
        tenantId,
        seed: seeds[index],
        index,
      });
      done++;
      onProgress?.(done, seeds.length);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return keys;
}
