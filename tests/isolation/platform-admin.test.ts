import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getAppUserPool,
  getOwnerPool,
  resetTestData,
  seedGym,
  seedMembership,
  seedUser,
  withRawContext,
  type SeededGym,
  type SeededUser,
} from "../helpers/testDb";
import type { Pool } from "pg";

/**
 * Platform Admin's cross-tenant access is an explicit, bounded allowance
 * (docs/architecture.md §5.2) — not a general bypass. Also verifies the
 * inverse: a non-platform role gets nothing, not accidental platform-level
 * access, if gymId happens to be unset.
 */
describe("platform admin access", () => {
  let owner: Pool;
  let app: Pool;
  let gymA: SeededGym;
  let gymB: SeededGym;
  let platformAdmin: SeededUser;

  beforeAll(() => {
    owner = getOwnerPool();
    app = getAppUserPool();
  });

  afterAll(async () => {
    await owner.end();
    await app.end();
  });

  beforeEach(async () => {
    await resetTestData(owner);
    gymA = await seedGym(owner, "Gym A");
    gymB = await seedGym(owner, "Gym B");
    platformAdmin = await seedUser(owner, "platform-admin@test.local");
    await seedMembership(owner, {
      userId: platformAdmin.id,
      gymId: null,
      role: "PLATFORM_ADMIN",
    });
  });

  it("Platform Admin can read gyms across every tenant, not just one", async () => {
    const rows = await withRawContext(
      app,
      { userId: platformAdmin.id, role: "PLATFORM_ADMIN" },
      (client) => client.query("SELECT id FROM gyms"),
    );
    expect(rows.rows.map((r) => r.id).sort()).toEqual(
      [gymA.id, gymB.id].sort(),
    );
  });

  it("Platform Admin can create a new gym", async () => {
    const result = await withRawContext(
      app,
      { userId: platformAdmin.id, role: "PLATFORM_ADMIN" },
      (client) =>
        client.query("INSERT INTO gyms (name) VALUES ($1)", ["Gym C"]),
    );
    expect(result.rowCount).toBe(1);
  });

  it("Platform Admin can suspend (update) any gym", async () => {
    const result = await withRawContext(
      app,
      { userId: platformAdmin.id, role: "PLATFORM_ADMIN" },
      (client) =>
        client.query("UPDATE gyms SET status = 'SUSPENDED' WHERE id = $1", [
          gymB.id,
        ]),
    );
    expect(result.rowCount).toBe(1);
  });

  it("a non-platform role gets zero rows, not accidental platform access, when gymId is unset", async () => {
    const gymAdmin = await seedUser(owner, "gym-admin-no-gym-ctx@test.local");
    await seedMembership(owner, {
      userId: gymAdmin.id,
      gymId: gymA.id,
      role: "GYM_ADMIN",
    });

    const rows = await withRawContext(
      app,
      { userId: gymAdmin.id, role: "GYM_ADMIN" }, // gymId deliberately omitted
      (client) => client.query("SELECT id FROM gyms"),
    );
    expect(rows.rows).toHaveLength(0);
  });
});
