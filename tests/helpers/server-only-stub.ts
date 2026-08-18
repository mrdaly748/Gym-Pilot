// Vitest's Node test environment doesn't set whatever module condition
// makes the real "server-only" package resolve to its no-op variant (it
// resolves to the throwing variant instead, meant for client bundles).
// Aliased in vitest.db.config.ts so importing lib/server/db.ts et al. from
// a test file works the same way it does when Next.js bundles them for the
// server. This file intentionally does nothing.
export {};
