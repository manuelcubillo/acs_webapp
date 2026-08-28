/**
 * Database target guard.
 *
 * The repository talks to two kinds of Postgres: the local Docker container
 * (dev + tests) and a remote Neon endpoint (production, and Neon branches).
 * Every accident this codebase has been exposed to has the same shape — a
 * command meant for the local database silently reaching the remote one
 * because an env file was missing, stale, or loaded in the wrong order.
 *
 * This guard makes that shape impossible: a remote host is refused unless the
 * runtime is genuinely production, or the caller opted in explicitly with
 * `ALLOW_NEON_DB=1`. That flag is injected by the `:prod` / `:branch` scripts
 * in package.json and lives in no env file on purpose, so reaching production
 * always leaves a trace in the command that was typed.
 */

/** Hosts that are never the local development stack. */
const REMOTE_HOST_PATTERN = /\bneon\.tech\b/i;

/** Strips credentials so a connection string can appear in an error message. */
function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "<unparseable connection string>";
  }
}

/**
 * Throws unless `url` is a legitimate target for the current runtime.
 *
 * @param url     The connection string about to be used.
 * @param context Short label naming the caller, used in the error message
 *                (e.g. "src/lib/db", "drizzle.config.ts").
 */
export function assertDatabaseTarget(
  url: string | undefined,
  context: string,
): asserts url is string {
  if (!url) {
    throw new Error(
      `[${context}] DATABASE_URL is not set.\n` +
        `The local default lives in the committed .env file — if it is missing, ` +
        `restore it or run the command through one of the package.json scripts.`,
    );
  }

  if (!REMOTE_HOST_PATTERN.test(url)) return;

  // A real production deployment (Vercel, or any NODE_ENV=production host).
  if (process.env.VERCEL || process.env.NODE_ENV === "production") return;

  // Explicit opt-in, injected by the `:prod` / `:branch` scripts.
  if (process.env.ALLOW_NEON_DB === "1") return;

  throw new Error(
    `[${context}] Refusing to connect to the remote database ${safeHost(url)} ` +
      `from a non-production runtime (NODE_ENV=${process.env.NODE_ENV ?? "undefined"}).\n\n` +
      `This is the guard that keeps local commands off production data.\n\n` +
      `If you meant to reach the local stack, you have a stale env file: the ` +
      `local target is the default and needs no flags (pnpm dev, pnpm test, pnpm db:migrate).\n\n` +
      `If you really meant to reach a remote database, use the explicit script ` +
      `for it — pnpm dev:prod, pnpm dev:branch, pnpm db:migrate:prod, ` +
      `pnpm db:studio:prod — which set ALLOW_NEON_DB=1.\n\n` +
      `See docs/ENVIRONMENTS.md.`,
  );
}
