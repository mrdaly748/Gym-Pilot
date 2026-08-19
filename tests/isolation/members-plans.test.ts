import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getAppUserPool,
  getOwnerPool,
  resetTestData,
  seedGym,
  seedMember,
  seedMembership,
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
 * Phase 3: members and membership_plans — raw SQL, no application code
 * (docs/architecture.md §5.4). Covers the same tenant-isolation shape as
 * Phase 1/2's tables, plus one Phase-3-specific assertion neither of those
 * tables needed: Platform Admin gets ZERO rows here, proving the
 * deliberate no-bypass decision rather than assuming it (see
 * docs/decisions.md — Phase 3 entry).
 */
describe("members and membership_plans isolation", () => {
  let owner: Pool;
  let app: Pool;
  let gymA: SeededGym;
  let gymB: SeededGym;
  let adminA: SeededUser;
  let staffA: SeededUser;
  let platformAdmin: SeededUser;
  let memberA: SeededMember;
  let planA: SeededPlan;

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
      phone: "20 123 456",
      phoneNormalized: "20123456",
    });
    planA = await seedPlan(owner, { gymId: gymA.id, name: "Monthly" });
  });

  describe("members", () => {
    it("Gym Admin can read members in their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) => client.query("SELECT id FROM members"),
      );
      expect(result.rows.map((r) => r.id)).toEqual([memberA.id]);
    });

    it("Gym Staff can read members in their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) => client.query("SELECT id FROM members"),
      );
      expect(result.rows.map((r) => r.id)).toEqual([memberA.id]);
    });

    it("cannot read another gym's members by id", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymB.id, role: "GYM_ADMIN" },
        (client) => client.query("SELECT id FROM members WHERE id = $1", [memberA.id]),
      );
      expect(result.rows).toHaveLength(0);
    });

    it("Gym Staff CAN insert a member into their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) =>
          client.query(
            "INSERT INTO members (gym_id, name, phone, phone_normalized, join_date) VALUES ($1, 'New Member', '20999999', '20999999', now())",
            [gymA.id],
          ),
      );
      expect(result.rowCount).toBe(1);
    });

    it("cannot insert a member into another gym", async () => {
      await expect(
        withRawContext(
          app,
          { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
          (client) =>
            client.query(
              "INSERT INTO members (gym_id, name, phone, phone_normalized, join_date) VALUES ($1, 'Cross Gym', '20999999', '20999999', now())",
              [gymB.id],
            ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("Gym Staff CAN archive (update) a member in their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) =>
          client.query("UPDATE members SET archived_at = now() WHERE id = $1", [memberA.id]),
      );
      expect(result.rowCount).toBe(1);
    });

    it("Platform Admin gets zero rows from members (no RLS bypass)", async () => {
      const result = await withRawContext(
        app,
        { userId: platformAdmin.id, role: "PLATFORM_ADMIN" },
        (client) => client.query("SELECT id FROM members"),
      );
      expect(result.rows).toHaveLength(0);
    });
  });

  describe("membership_plans", () => {
    it("Gym Admin can read plans in their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) => client.query("SELECT id FROM membership_plans"),
      );
      expect(result.rows.map((r) => r.id)).toEqual([planA.id]);
    });

    it("Gym Staff can READ plans in their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) => client.query("SELECT id FROM membership_plans"),
      );
      expect(result.rows.map((r) => r.id)).toEqual([planA.id]);
    });

    it("Gym Admin CAN insert a plan into their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) =>
          client.query(
            "INSERT INTO membership_plans (gym_id, name, price_millimes, duration_days) VALUES ($1, 'New Plan', 0, 30)",
            [gymA.id],
          ),
      );
      expect(result.rowCount).toBe(1);
    });

    it("Gym Staff CANNOT insert a plan (blocked by RLS, not just app-layer checks)", async () => {
      await expect(
        withRawContext(
          app,
          { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
          (client) =>
            client.query(
              "INSERT INTO membership_plans (gym_id, name, price_millimes, duration_days) VALUES ($1, 'Staff Plan', 0, 30)",
              [gymA.id],
            ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("Gym Staff CANNOT archive (update) a plan", async () => {
      const result = await withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) =>
          client.query("UPDATE membership_plans SET archived_at = now() WHERE id = $1", [
            planA.id,
          ]),
      );
      expect(result.rowCount).toBe(0);
    });

    it("cannot insert a plan into another gym", async () => {
      await expect(
        withRawContext(
          app,
          { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
          (client) =>
            client.query(
              "INSERT INTO membership_plans (gym_id, name, price_millimes, duration_days) VALUES ($1, 'Cross Gym Plan', 0, 30)",
              [gymB.id],
            ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("Platform Admin gets zero rows from membership_plans (no RLS bypass)", async () => {
      const result = await withRawContext(
        app,
        { userId: platformAdmin.id, role: "PLATFORM_ADMIN" },
        (client) => client.query("SELECT id FROM membership_plans"),
      );
      expect(result.rows).toHaveLength(0);
    });
  });
});
