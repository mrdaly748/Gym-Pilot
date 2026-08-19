import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getAppUserPool,
  getOwnerPool,
  resetTestData,
  seedCheckin,
  seedGym,
  seedMember,
  seedMembership,
  seedUser,
  withRawContext,
  type SeededGym,
  type SeededMember,
  type SeededUser,
} from "../helpers/testDb";
import type { Pool } from "pg";

/**
 * Phase 6: attendance_checkins — raw SQL, no application code
 * (docs/architecture.md §5.4). Unlike payments/payment_adjustments, this
 * table is NOT append-only — app_user genuinely has UPDATE/DELETE
 * privilege, restricted by RLS to GYM_ADMIN only. Both a privilege check
 * (Staff attempting UPDATE/DELETE is blocked by RLS, not a missing grant —
 * a "row-level security" rejection, structurally different from Phase 5's
 * "permission denied for table" grant-level rejection) and a role check
 * (Admin succeeds) are verified directly against the database.
 */
describe("attendance_checkins isolation", () => {
  let owner: Pool;
  let app: Pool;
  let gymA: SeededGym;
  let gymB: SeededGym;
  let adminA: SeededUser;
  let staffA: SeededUser;
  let platformAdmin: SeededUser;
  let memberA: SeededMember;
  let memberB: SeededMember;
  let checkinId: string;

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
    platformAdmin = await seedUser(owner, "platform-admin@test.local");
    await seedMembership(owner, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" });
    await seedMembership(owner, { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" });
    await seedMembership(owner, { userId: platformAdmin.id, gymId: null, role: "PLATFORM_ADMIN" });
    memberA = await seedMember(owner, {
      gymId: gymA.id,
      name: "Member A",
      phone: "20123456",
      phoneNormalized: "20123456",
    });
    memberB = await seedMember(owner, {
      gymId: gymB.id,
      name: "Member B",
      phone: "20654321",
      phoneNormalized: "20654321",
    });
    const checkin = await seedCheckin(owner, {
      gymId: gymA.id,
      memberId: memberA.id,
      recordedByUserId: adminA.id,
    });
    checkinId = checkin.id;
  });

  it("Gym A can read its own attendance", async () => {
    const result = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) => client.query("SELECT id FROM attendance_checkins"),
    );
    expect(result.rows.map((r) => r.id)).toEqual([checkinId]);
  });

  it("Gym A cannot read Gym B's attendance", async () => {
    await seedCheckin(owner, { gymId: gymB.id, memberId: memberB.id, recordedByUserId: adminA.id });
    const result = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) => client.query("SELECT id FROM attendance_checkins WHERE gym_id = $1", [gymB.id]),
    );
    expect(result.rows).toHaveLength(0);
  });

  it("Gym A cannot insert a check-in for Gym B", async () => {
    await expect(
      withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) =>
          client.query(
            "INSERT INTO attendance_checkins (gym_id, member_id, recorded_by_user_id) VALUES ($1, $2, $3)",
            [gymB.id, memberB.id, adminA.id],
          ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("Gym Staff CAN insert a check-in in their own gym", async () => {
    const result = await withRawContext(
      app,
      { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
      (client) =>
        client.query(
          "INSERT INTO attendance_checkins (gym_id, member_id, recorded_by_user_id) VALUES ($1, $2, $3)",
          [gymA.id, memberA.id, staffA.id],
        ),
    );
    expect(result.rowCount).toBe(1);
  });

  it("Gym Staff CANNOT update a check-in (blocked by RLS, not a missing grant)", async () => {
    // Postgres RLS's USING clause on UPDATE/DELETE filters which rows are
    // even visible to the statement — a non-matching row is silently
    // excluded (rowCount 0), it does not throw, unlike a WITH CHECK
    // violation on INSERT (see the "insert for Gym B" test above, which
    // does throw). Both are equally "blocked," just different Postgres
    // mechanisms — this is the same reason the grant-level privilege-denied
    // check exists as a separate, structurally different failure mode in
    // Phase 5's payments isolation tests.
    const result = await withRawContext(
      app,
      { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
      (client) =>
        client.query("UPDATE attendance_checkins SET member_id = $1 WHERE id = $2", [
          memberA.id,
          checkinId,
        ]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("Gym Staff CANNOT delete a check-in (blocked by RLS)", async () => {
    const result = await withRawContext(
      app,
      { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
      (client) => client.query("DELETE FROM attendance_checkins WHERE id = $1", [checkinId]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("Gym Admin CAN insert a check-in in their own gym", async () => {
    const result = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) =>
        client.query(
          "INSERT INTO attendance_checkins (gym_id, member_id, recorded_by_user_id) VALUES ($1, $2, $3)",
          [gymA.id, memberA.id, adminA.id],
        ),
    );
    expect(result.rowCount).toBe(1);
  });

  it("Gym Admin CAN update a check-in in their own gym", async () => {
    const result = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) =>
        client.query("UPDATE attendance_checkins SET member_id = $1 WHERE id = $2", [
          memberA.id,
          checkinId,
        ]),
    );
    expect(result.rowCount).toBe(1);
  });

  it("Gym Admin CAN delete a check-in in their own gym", async () => {
    const result = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) => client.query("DELETE FROM attendance_checkins WHERE id = $1", [checkinId]),
    );
    expect(result.rowCount).toBe(1);
  });

  it("Platform Admin gets zero rows from attendance_checkins (no RLS bypass)", async () => {
    const result = await withRawContext(
      app,
      { userId: platformAdmin.id, role: "PLATFORM_ADMIN" },
      (client) => client.query("SELECT id FROM attendance_checkins"),
    );
    expect(result.rows).toHaveLength(0);
  });

  it("cross-tenant UPDATE cannot affect another gym's check-in (Gym B admin, Gym A row)", async () => {
    const adminB = await seedUser(owner, "admin-b@test.local");
    await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

    const result = await withRawContext(
      app,
      { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" },
      (client) =>
        client.query("UPDATE attendance_checkins SET member_id = $1 WHERE id = $2", [
          memberB.id,
          checkinId,
        ]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("cross-tenant DELETE cannot affect another gym's check-in (Gym B admin, Gym A row)", async () => {
    const adminB = await seedUser(owner, "admin-b@test.local");
    await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

    const result = await withRawContext(
      app,
      { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" },
      (client) => client.query("DELETE FROM attendance_checkins WHERE id = $1", [checkinId]),
    );
    expect(result.rowCount).toBe(0);
  });
});
