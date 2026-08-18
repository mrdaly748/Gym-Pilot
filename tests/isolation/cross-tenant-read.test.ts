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
 * Raw SQL, no application code (docs/architecture.md §5.4): proves the
 * database layer blocks cross-gym reads independently of any service
 * function or app-layer filter.
 */
describe("cross-tenant isolation: reads", () => {
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

  it("same-gym read succeeds", async () => {
    const rows = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) => client.query("SELECT id FROM gyms WHERE id = $1", [gymA.id]),
    );
    expect(rows.rows).toHaveLength(1);
  });

  it("cross-gym read (targeted by known id) returns zero rows", async () => {
    const rows = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) => client.query("SELECT id FROM gyms WHERE id = $1", [gymB.id]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("cross-gym read with NO context set at all returns zero rows", async () => {
    const rows = await withRawContext(app, {}, (client) =>
      client.query("SELECT id FROM gyms WHERE id = $1", [gymB.id]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("SELECT * FROM gyms only returns the caller's own gym, never every gym", async () => {
    const rows = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) => client.query("SELECT id FROM gyms"),
    );
    expect(rows.rows.map((r) => r.id)).toEqual([gymA.id]);
  });

  it("cross-gym read of gym_memberships is blocked", async () => {
    const staffB = await seedUser(owner, "staff-b@test.local");
    const membershipB = await seedMembership(owner, {
      userId: staffB.id,
      gymId: gymB.id,
      role: "GYM_STAFF",
    });

    const rows = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) =>
        client.query("SELECT id FROM gym_memberships WHERE id = $1", [
          membershipB.id,
        ]),
    );
    expect(rows.rows).toHaveLength(0);
  });
});
