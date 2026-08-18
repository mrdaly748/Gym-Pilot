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
 * Raw SQL, no application code: proves cross-gym mutations (UPDATE, DELETE)
 * are blocked at the database layer, and that WITH CHECK specifically
 * blocks re-parenting a row into another tenant — not just editing within
 * one's own gym. See docs/architecture.md §5.3.
 */
describe("cross-tenant isolation: writes", () => {
  let owner: Pool;
  let app: Pool;
  let gymA: SeededGym;
  let gymB: SeededGym;
  let adminA: SeededUser;

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
    adminA = await seedUser(owner, "admin-a@test.local");
    await seedMembership(owner, {
      userId: adminA.id,
      gymId: gymA.id,
      role: "GYM_ADMIN",
    });
  });

  it("cross-gym UPDATE affects zero rows", async () => {
    const result = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) =>
        client.query("UPDATE gyms SET name = $1 WHERE id = $2", [
          "Hacked",
          gymB.id,
        ]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("cross-gym DELETE is denied outright — app_user has no DELETE grant at all, blocked before RLS is even evaluated", async () => {
    await expect(
      withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) => client.query("DELETE FROM gyms WHERE id = $1", [gymB.id]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("DELETE on the caller's OWN gym is also denied outright (belt and suspenders: no GRANT, and no RLS policy either)", async () => {
    await expect(
      withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) => client.query("DELETE FROM gyms WHERE id = $1", [gymA.id]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("WITH CHECK blocks re-parenting a gym_memberships row into another gym via UPDATE", async () => {
    const staffA = await seedUser(owner, "staff-a@test.local");
    const staffMembership = await seedMembership(owner, {
      userId: staffA.id,
      gymId: gymA.id,
      role: "GYM_STAFF",
    });

    await expect(
      withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) =>
          client.query(
            "UPDATE gym_memberships SET gym_id = $1 WHERE id = $2",
            [gymB.id, staffMembership.id],
          ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("gyms UPDATE is Platform-Admin-only — a Gym Admin cannot update even their own gym's row", async () => {
    const result = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) =>
        client.query("UPDATE gyms SET name = $1 WHERE id = $2", [
          "Renamed by admin",
          gymA.id,
        ]),
    );
    expect(result.rowCount).toBe(0);
  });
});
