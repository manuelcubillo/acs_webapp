/**
 * Cron endpoint — GET /api/cron/purge-archived
 *
 * Runs the phase-5 retention purge: physically deletes every archived card /
 * card type whose per-tenant retention window has elapsed (see
 * `purgeExpiredArchivedRecords`). Designed to be invoked exactly once a day.
 *
 * ## Why here and not under /api/cards/*
 *
 * `/api/cards/*` is header-authed per external device (`x-tenant-id`, TODO:
 * API_AUTH). Mixing auth models in one route tree invites cross-tenant mistakes
 * (`infrastructure.md`). This job is cross-tenant by design and authenticated by
 * a shared secret, so it lives in its own `/api/cron/*` tree with no session and
 * no tenant header.
 *
 * ## Authentication — `CRON_SECRET`
 *
 * The caller must send `Authorization: Bearer <CRON_SECRET>`. On Vercel, Cron
 * Jobs automatically inject this header when `CRON_SECRET` is set in the project
 * environment (see `vercel.json`). On Docker / self-hosted, an external cron
 * sends the same header (see `modules/infrastructure.md`). The secret is
 * compared in constant time. If `CRON_SECRET` is unset the endpoint refuses
 * every request (fail closed — it never runs unauthenticated).
 *
 * ## Triggers
 *
 *   - Vercel:  `vercel.json` → crons entry, daily at 03:00 UTC.
 *   - Docker:  host / container crontab hitting this URL once a day.
 *   - Local:   invoke by hand with the same Bearer header.
 *
 * Response: 200 `{ success: true, data: PurgeResult }` on success,
 *           401 `{ success: false, ... }` when the secret is missing / wrong.
 */

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  routeHandler,
  apiSuccess,
  AuthenticationError,
} from "@/lib/api";
import { purgeExpiredArchivedRecords } from "@/lib/server/lifecycle";

export const dynamic = "force-dynamic";

/**
 * Constant-time check of the `Authorization: Bearer <CRON_SECRET>` header.
 * Returns false when the secret is unset (fail closed) or does not match.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch; guard first (length is not secret).
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  return routeHandler(async () => {
    if (!isAuthorized(request)) {
      throw new AuthenticationError("Invalid or missing cron secret");
    }

    const summary = await purgeExpiredArchivedRecords();
    return apiSuccess(summary);
  });
}
