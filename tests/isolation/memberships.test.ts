import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getAppUserPool,
  getOwnerPool,
  resetTestData,
  seedFreeze,
  seedGym,
  seedMember,
  seedMembership,
  seedMembershipRecord,
  seedPlan,
  seedUser,
  withRawContext,
  type SeededGym,
  type SeededMember,
  type SeededPlan,
  type SeededUser,
} from "../helpers/testDb";
import type { Pool } from "pg";

/**
 * Phase 4: memberships and membership_freezes — raw SQL, no application
 * code (docs/architecture.md §5.4). Same shape as the Phase 3 suite, plus
 * the memberships_update policy's cancellation-blocking WITH CHECK, which
 * is new and specific to this table (see the Phase 4 migration).
 */
describe("memberships and membership_freezes isolation", () => {
  let owner: Pool;
  let app: Pool;
  let gymA: SeededGym;
  let gymB: SeededGym;
  let adminA: SeededUser;
  let staffA: SeededUser;
  let platformAdmin: SeededUser;
  let memberA: SeededMember;
  let planA: SeededPlan;
  let membershipId: string;

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
    planA = await seedPlan(owner, { gymId: gymA.id, name: "Monthly" });
    const membership = await seedMembershipRecord(owner, {
      gymId: gymA.id,
      memberId: memberA.id,
      planId: planA.id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    membershipId = membership.id;
  });

  describe("memberships", () => {
    it("Gym Admin and Gym Staff can both read own-gym memberships", async () => {
      for (const [userId, role] of [[adminA.id, "GYM_ADMIN"], [staffA.id, "GYM_STAFF"]] as const) {
        const result = await withRawContext(app, { userId, gymId: gymA.id, role }, (client) =>
          client.query("SELECT id FROM memberships"),
        );
        expect(result.rows.map((r) => r.id)).toEqual([membershipId]);
      }
    });

    it("cannot read another gym's memberships by id", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymB.id, role: "GYM_ADMIN" },
        (client) => client.query("SELECT id FROM memberships WHERE id = $1", [membershipId]),
      );
      expect(result.rows).toHaveLength(0);
    });

    it("Gym Staff CAN insert (assign/renew) a membership in their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) =>
          client.query(
            `INSERT INTO memberships (gym_id, member_id, plan_id, plan_name_snapshot, price_millimes_snapshot, duration_days_snapshot, start_date, end_date)
             VALUES ($1, $2, $3, 'Monthly', 50000, 30, now(), now() + interval '30 days')`,
            [gymA.id, memberA.id, planA.id],
          ),
      );
      expect(result.rowCount).toBe(1);
    });

    it("cannot insert a membership into another gym", async () => {
      await expect(
        withRawContext(
          app,
          { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
          (client) =>
            client.query(
              `INSERT INTO memberships (gym_id, member_id, plan_id, plan_name_snapshot, price_millimes_snapshot, duration_days_snapshot, start_date, end_date)
               VALUES ($1, $2, $3, 'Monthly', 50000, 30, now(), now() + interval '30 days')`,
              [gymB.id, memberA.id, planA.id],
            ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("Gym Staff CAN update end_date (freeze-resume) on their own gym's membership", async () => {
      const result = await withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) =>
          client.query("UPDATE memberships SET end_date = end_date + 5 WHERE id = $1", [
            membershipId,
          ]),
      );
      expect(result.rowCount).toBe(1);
    });

    it("Gym Staff CANNOT set cancelled_at (blocked by RLS WITH CHECK, not just app-layer checks)", async () => {
      await expect(
        withRawContext(app, { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" }, (client) =>
          client.query("UPDATE memberships SET cancelled_at = now() WHERE id = $1", [
            membershipId,
          ]),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("Gym Admin CAN set cancelled_at", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) =>
          client.query("UPDATE memberships SET cancelled_at = now() WHERE id = $1", [
            membershipId,
          ]),
      );
      expect(result.rowCount).toBe(1);
    });

    it("Gym Staff cannot touch an already-cancelled membership at all", async () => {
      await owner.query("UPDATE memberships SET cancelled_at = now() WHERE id = $1", [
        membershipId,
      ]);
      await expect(
        withRawContext(app, { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" }, (client) =>
          client.query("UPDATE memberships SET end_date = end_date + 1 WHERE id = $1", [
            membershipId,
          ]),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("Platform Admin gets zero rows from memberships (no RLS bypass)", async () => {
      const result = await withRawContext(
        app,
        { userId: platformAdmin.id, role: "PLATFORM_ADMIN" },
        (client) => client.query("SELECT id FROM memberships"),
      );
      expect(result.rows).toHaveLength(0);
    });
  });

  describe("membership_freezes", () => {
    it("Gym Staff can insert and update (resume) a freeze in their own gym", async () => {
      const freeze = await seedFreeze(owner, {
        gymId: gymA.id,
        membershipId,
        frozenAt: new Date(),
      });
      const result = await withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) =>
          client.query("UPDATE membership_freezes SET resumed_at = now() WHERE id = $1", [
            freeze.id,
          ]),
      );
      expect(result.rowCount).toBe(1);
    });

    it("cannot insert a freeze into another gym's membership", async () => {
      await expect(
        withRawContext(
          app,
          { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
          (client) =>
            client.query(
              "INSERT INTO membership_freezes (gym_id, membership_id, frozen_at) VALUES ($1, $2, now())",
              [gymB.id, membershipId],
            ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("Platform Admin gets zero rows from membership_freezes (no RLS bypass)", async () => {
      await seedFreeze(owner, { gymId: gymA.id, membershipId, frozenAt: new Date() });
      const result = await withRawContext(
        app,
        { userId: platformAdmin.id, role: "PLATFORM_ADMIN" },
        (client) => client.query("SELECT id FROM membership_freezes"),
      );
      expect(result.rows).toHaveLength(0);
    });
  });
});
