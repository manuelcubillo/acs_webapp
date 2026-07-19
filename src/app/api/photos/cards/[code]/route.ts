/**
 * GET /api/photos/cards/[code] — a card's primary photo.
 *
 * Answers 302 → a freshly minted signed storage URL. The bytes travel from the
 * bucket to the browser directly; this route only signs and redirects.
 *
 * Why it exists: the signature is minted per request, so a client holding this
 * URL never sees an expired one. That is what lets the dashboard serve feed
 * thumbnails without polling to keep signatures alive. And because the URL is
 * stable per card, the browser can actually cache the image instead of
 * re-downloading it whenever a signed URL is re-issued.
 *
 * Auth model — session (OPERATOR+), NOT the `x-tenant-id` header used by the
 * external device API under `/api/cards/[code]`. It lives in a separate route
 * tree on purpose: two auth models in one tree is how cross-tenant mistakes get
 * made.
 *
 * The URL is an identifier, not a capability. Knowing a code grants nothing
 * without a session for the owning tenant — unlike a signed storage URL, which
 * is a bearer token to anyone who gets hold of the string.
 *
 * See ADR 2026-07-17-stable-photo-routes.md.
 *
 * Responses:
 *   302 → signed storage URL (Location), cached privately by the browser.
 *   401 → no valid session.
 *   404 → no such card in the caller's tenant, OR the card has no photo.
 *         Both answer 404 deliberately: a 403 for "exists but not yours" would
 *         let a member of one tenant probe another tenant's code space.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireOperator,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/api";
import { getCardByCode, NotFoundError } from "@/lib/dal";
import { signPhotoForRead, signPhotoForDownload } from "@/lib/storage/read";
import { assertObjectMatchesKind } from "@/lib/storage/validation";
import { buildCardPhotoDownloadFilename } from "@/lib/storage/keys";

/** The response depends on the session cookie — never let it be static. */
export const dynamic = "force-dynamic";

/**
 * How long the browser may reuse the redirect without asking again.
 * MUST stay below the signature TTL (900s, see `storage/read.ts`) so a reused
 * redirect can never point at an already-expired signature.
 */
const REDIRECT_MAX_AGE_SECONDS = 600;

interface RouteParams {
  params: Promise<{ code: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { code } = await params;

  // Optional selectors: `?field=<fieldDefinitionId>` targets one specific photo
  // field (default: the primary photo); `?download` returns the object as an
  // attachment named `<code>_<fieldName>_<random>.<ext>` so it is both
  // human-readable and traceable to its storage object.
  const { searchParams } = new URL(request.url);
  const fieldId = searchParams.get("field");
  const isDownload = searchParams.has("download");

  let tenantId: string;
  try {
    ({ tenantId } = await requireOperator());
  } catch (e) {
    if (e instanceof AuthenticationError || e instanceof AuthorizationError) {
      return new NextResponse(null, { status: 401 });
    }
    throw e;
  }

  let key: string | null = null;
  let fieldName = "foto";
  try {
    const card = await getCardByCode(code, tenantId);
    // The primary photo is the first photo field that holds a value.
    // `card.fields` is ordered by field definition position and only carries
    // fields that have a value, so `find` yields exactly that. getActivityFeed
    // decides whether to show a thumbnail by the same rule — keep them in step
    // or the feed will render an <img> pointing at a 404. When `?field` is given
    // we instead pick that exact photo field (multi-photo cards).
    const photo = card.fields.find(
      (f) =>
        f.fieldType === "photo" &&
        (fieldId ? f.fieldDefinitionId === fieldId : true),
    );
    if (typeof photo?.value === "string" && photo.value.length > 0) {
      key = photo.value;
      fieldName = photo.name ?? fieldName;
    }
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
    // Fall through to 404 — never echo the DAL's message, it carries the
    // tenant UUID, which the client is never given.
  }

  if (!key) return new NextResponse(null, { status: 404 });

  // The key came off a row already scoped to this tenant, so it should always
  // match. Assert anyway — this is the line between a card code and someone
  // else's file, and it costs nothing.
  try {
    assertObjectMatchesKind({
      key,
      expectedTenantId: tenantId,
      expectedKind: "card-photo",
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const signedUrl = isDownload
    ? await signPhotoForDownload(
        key,
        buildCardPhotoDownloadFilename({ code, fieldName, key }),
      )
    : await signPhotoForRead(key);

  const response = NextResponse.redirect(signedUrl, 302);
  // `private` is load-bearing: a shared cache (CDN, corporate proxy) must never
  // hold one tenant's redirect and hand it to another. `Vary: Cookie` says the
  // same thing to anything that ignores `private`.
  response.headers.set(
    "Cache-Control",
    `private, max-age=${REDIRECT_MAX_AGE_SECONDS}`,
  );
  response.headers.set("Vary", "Cookie");
  return response;
}
