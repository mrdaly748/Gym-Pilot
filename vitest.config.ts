import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "node",
    // Unit tests only — no database. Integration/isolation tests (DB-backed)
    // live in vitest.db.config.ts / `npm run test:db`, per
    // docs/architecture.md §4.
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
