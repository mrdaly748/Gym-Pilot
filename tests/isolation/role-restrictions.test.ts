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
 * Role-based restrictions on gym_memberships INSERT/UPDATE — restricted
 * roles cannot bypass isolation by inserting/updating their way around it.
 * See docs/architecture.md §5.3 (the gym_memberships_insert/update policies).
 */
describe("role restrictions on gym_memberships", () => {
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
    await seedMembership(owner, {
      userId: staffA.id,
      gymId: gymA.id,
      role: "GYM_STAFF",
    });
  });

  it("Gym Admin CAN insert a GYM_STAFF row into their own gym", async () => {
    const newStaff = await seedUser(owner, "new-staff@test.local");
    const result = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) =>
        client.query(
          "INSERT INTO gym_memberships (user_id, gym_id, role) VALUES ($1, $2, 'GYM_STAFF')",
          [newStaff.id, gymA.id],
        ),
    );
    expect(result.rowCount).toBe(1);
  });

  it("Gym Staff CANNOT insert into gym_memberships at all", async () => {
    const newStaff = await seedUser(owner, "new-staff@test.local");
    await expect(
      withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) =>
          client.query(
            "INSERT INTO gym_memberships (user_id, gym_id, role) VALUES ($1, $2, 'GYM_STAFF')",
            [newStaff.id, gymA.id],
          ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("Gym Admin CANNOT insert a staff row into another gym (cross-gym INSERT rejected)", async () => {
    const newStaff = await seedUser(owner, "new-staff@test.local");
    await expect(
      withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) =>
          client.query(
            "INSERT INTO gym_memberships (user_id, gym_id, role) VALUES ($1, $2, 'GYM_STAFF')",
            [newStaff.id, gymB.id],
          ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("Gym Admin CANNOT insert a GYM_ADMIN row (privilege escalation via role field is rejected)", async () => {
    const newAdmin = await seedUser(owner, "new-admin@test.local");
    await expect(
      withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) =>
          client.query(
            "INSERT INTO gym_memberships (user_id, gym_id, role) VALUES ($1, $2, 'GYM_ADMIN')",
            [newAdmin.id, gymA.id],
          ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("Gym Staff cannot update an existing membership row", async () => {
    const result = await withRawContext(
      app,
      { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
      (client) =>
        client.query(
          "UPDATE gym_memberships SET role = 'GYM_ADMIN' WHERE user_id = $1",
          [staffA.id],
        ),
    );
    expect(result.rowCount).toBe(0);
  });
});
