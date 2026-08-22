import { defineConfig } from "vitest/config";
import path from "node:path";

// AI tool-selection evaluation suite — deliberately separate from both
// vitest.config.ts (unit, no DB, no network) and vitest.db.config.ts
// (integration/isolation, real Postgres, no network). This config's own
// tests/ai-evals/**/*.eval.test.ts glob is not included by either of those,
// so `npm test` / `npm run test:db` / CI never discover or run these files
// and never require ANTHROPIC_API_KEY. See lib/ai/README.md for what this
// suite proves and how to run it.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "server-only": path.resolve(
        import.meta.dirname,
        "tests/helpers/server-only-stub.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/ai-evals/**/*.eval.test.ts"],
    testTimeout: 20_000,
    // lib/ai/tools.ts imports lib/server/services/*, which import
    // lib/server/db.ts — its top-level code requires DATABASE_URL to be
    // set or it throws at import time. This suite never actually queries a
    // database (every tool's execute() is stubbed before any model call),
    // so an obviously-fake connection string is enough to satisfy the
    // module-load-time check without a real database.
    env: {
      DATABASE_URL: "postgres://eval:eval@localhost:1/eval",
    },
  },
});
