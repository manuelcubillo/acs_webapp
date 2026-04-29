/**
 * Storage Layer — Server-side validation
 *
 * Two checks live here:
 *
 * 1. `assertObjectMatchesKind` — refuses any key whose tenant prefix or kind
 *    segment does not match the caller. This is the only thing standing
 *    between a presigned URL and a cross-tenant write/read.
 *
 * 2. `assertHeadOk` — after the client has uploaded, HEAD the object and
 *    confirm size and content type are within the kind's profile.
 */

import { ValidationError } from "@/lib/dal/errors";
import { keyMatches } from "./keys";
import {
  ALLOWED_OUTPUT_MIME,
  type AllowedOutputMime,
  type HeadResult,
  type PhotoKind,
} from "./types";

export interface AssertKeyArgs {
  key: string;
  expectedTenantId: string;
  expectedKind: PhotoKind;
}

export function assertObjectMatchesKind({
  key,
  expectedTenantId,
  expectedKind,
}: AssertKeyArgs): void {
  if (!keyMatches(key, { tenantId: expectedTenantId, kind: expectedKind })) {
    throw new ValidationError(
      "Object key does not belong to the current tenant or kind",
    );
  }
}

export interface AssertHeadArgs {
  head: HeadResult;
  /** Hard ceiling enforced server-side. */
  maxBytes: number;
}

export function assertHeadOk({ head, maxBytes }: AssertHeadArgs): void {
  if (head.contentLength <= 0) {
    throw new ValidationError("Uploaded object is empty");
  }
  if (head.contentLength > maxBytes) {
    throw new ValidationError(
      `Uploaded object is too large (${head.contentLength} > ${maxBytes} bytes)`,
    );
  }
  if (
    !ALLOWED_OUTPUT_MIME.includes(head.contentType as AllowedOutputMime)
  ) {
    throw new ValidationError(
      `Uploaded object has unsupported content type: ${head.contentType}`,
    );
  }
}
