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
 * Phase 2: disabled_at is the staff-disable mechanism (docs/decisions.md —
 * Phase 2 entry). No new RLS policy was added for it — the existing
 * gym_memberships_update policy (Phase 1) already scopes UPDATE to a Gym
 * Admin's own gym, so this suite proves that's actually sufficient rather
 * than assuming it.
 */
describe("gym_memberships.disabled_at (staff disable)", () => {
  let owner: Pool;
  let app: Pool;
  let gymA: SeededGym;
  let gymB: SeededGym;
  let adminA: SeededUser;
  let staffA: SeededUser;

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
    staffA = await seedUser(owner, "staff-a@test.local");
    await seedMembership(owner, {
      userId: adminA.id,
      gymId: gymA.id,
      role: "GYM_ADMIN",
    });
  });

  it("Gym Admin can disable a GYM_STAFF row in their own gym", async () => {
    const membership = await seedMembership(owner, {
      userId: staffA.id,
      gymId: gymA.id,
      role: "GYM_STAFF",
    });

    const result = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) =>
        client.query(
          "UPDATE gym_memberships SET disabled_at = now() WHERE id = $1",
          [membership.id],
        ),
    );
    expect(result.rowCount).toBe(1);
  });

  it("Gym Admin cannot disable a GYM_STAFF row in another gym", async () => {
    const staffB = await seedUser(owner, "staff-b@test.local");
    const membership = await seedMembership(owner, {
      userId: staffB.id,
      gymId: gymB.id,
      role: "GYM_STAFF",
    });

    const result = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) =>
        client.query(
          "UPDATE gym_memberships SET disabled_at = now() WHERE id = $1",
          [membership.id],
        ),
    );
    expect(result.rowCount).toBe(0);
  });

  it("Gym Staff cannot disable any membership row (blocked by RLS policy, not just app-layer role checks)", async () => {
    const membership = await seedMembership(owner, {
      userId: staffA.id,
      gymId: gymA.id,
      role: "GYM_STAFF",
    });

    await expect(
      withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) =>
          client.query(
            "UPDATE gym_memberships SET disabled_at = now() WHERE id = $1",
            [membership.id],
          ),
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
  });
});
