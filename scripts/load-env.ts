/**
 * Env bootstrap for standalone scripts (`tsx scripts/*.ts`).
 *
 * Import it FIRST, before anything that reads `process.env`:
 *
 *   import "./load-env";
 *   import { db } from "../src/lib/db";
 *
 * It reproduces the precedence Next.js applies in development. `dotenv` never
 * overwrites a variable that is already set, so an overlay loaded by dotenv-cli
 * — what the `:prod` and `:branch` scripts in package.json do — wins over every
 * file here. That is what makes every script local by default and remote only
 * when the command that launched it says so.
 *
 * The database target itself is enforced separately, by
 * `assertDatabaseTarget` in src/lib/db/guard.ts.
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env.development" });
config({ path: ".env" });
