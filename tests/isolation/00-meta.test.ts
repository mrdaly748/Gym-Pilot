import { describe, expect, it } from "vitest";
import { getOwnerPool } from "../helpers/testDb";

/**
 * The required first isolation test (docs/architecture.md §5.3a, §5.4):
 * verifies the security ASSUMPTIONS every other isolation test depends on.
 * If either check here fails, every other isolation test's result is
 * meaningless — RLS may be silently inert regardless of how correct the
 * policies look. Named "00-" so it sorts and runs first.
 */
describe("RLS meta-test (must pass before any other isolation test means anything)", () => {
  it("app_user does not have BYPASSRLS", async () => {
    const owner = getOwnerPool();
    try {
      const result = await owner.query<{ rolbypassrls: boolean }>(
        "SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_user'",
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].rolbypassrls).toBe(false);
    } finally {
      await owner.end();
    }
  });

  it("app_user is not a superuser", async () => {
    const owner = getOwnerPool();
    try {
      const result = await owner.query<{ rolsuper: boolean }>(
        "SELECT rolsuper FROM pg_roles WHERE rolname = 'app_user'",
      );
      expect(result.rows[0].rolsuper).toBe(false);
    } finally {
      await owner.end();
    }
  });

  it.each(["gyms", "users", "gym_memberships"])(
    "%s has RLS enabled and FORCEd",
    async (table) => {
      const owner = getOwnerPool();
      try {
        const result = await owner.query<{
          relrowsecurity: boolean;
          relforcerowsecurity: boolean;
        }>(
          "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = $1",
          [table],
        );
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].relrowsecurity).toBe(true);
        expect(result.rows[0].relforcerowsecurity).toBe(true);
      } finally {
        await owner.end();
      }
    },
  );

  it("connecting as app_user actually authenticates as app_user, not an admin/proxy role", async () => {
    // This is the specific check that would have caught the prisma-dev
    // limitation discovered during Phase 1 implementation (every connection
    // was silently treated as the postgres superuser regardless of
    // credentials) — see tests/helpers/testDb.ts's header comment.
    const { getAppUserPool } = await import("../helpers/testDb");
    const app = getAppUserPool();
    try {
      const result = await app.query<{ current_user: string }>(
        "SELECT current_user",
      );
      expect(result.rows[0].current_user).toBe("app_user");
    } finally {
      await app.end();
    }
  });
});
