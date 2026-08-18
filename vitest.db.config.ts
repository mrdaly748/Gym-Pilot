import { defineConfig } from "vitest/config";
import path from "node:path";
import { APP_USER_URL } from "./tests/helpers/testDb";

// DB-backed tests (integration + isolation) — run against the ephemeral
// Postgres started in tests/helpers/globalSetup.ts, never the hosted
// Supabase dev project (docs/decisions.md D18). Separate from
// vitest.config.ts (unit tests, no DB) so `npm test` stays fast and
// dependency-free — see docs/architecture.md §4 (testing strategy).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      // See tests/helpers/server-only-stub.ts.
      "server-only": path.resolve(
        import.meta.dirname,
        "tests/helpers/server-only-stub.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: [
      "tests/integration/**/*.test.ts",
      "tests/isolation/**/*.test.ts",
    ],
    globalSetup: ["tests/helpers/globalSetup.ts"],
    // lib/server/db.ts reads DATABASE_URL at module load time.
    env: {
      DATABASE_URL: APP_USER_URL,
    },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // One shared ephemeral database for the whole run — serialize files to
    // avoid cross-file races on the same tables.
    fileParallelism: false,
  },
});
