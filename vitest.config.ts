import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Two projects, split by the filename convention already in use:
 *
 *  · unit        — `*.test.ts` except `*.integration.test.ts`. No database, no
 *                  env bootstrap, runs in parallel.
 *  · integration — `*.integration.test.ts`. Boots src/test/setup-integration.ts,
 *                  which pins the run to the dedicated `acs_test` database and
 *                  aborts if it cannot. Runs serially: the files share one
 *                  database and each cleans up by row prefix.
 *
 * The split exists so the integration guard can be strict without unit tests
 * needing a database at all.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          setupFiles: ["./src/test/setup-integration.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
