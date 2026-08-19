import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getAppUserPool,
  getOwnerPool,
  resetTestData,
  seedGym,
  seedMember,
  seedMembership,
  seedMembershipRecord,
  seedPayment,
  seedPaymentAdjustment,
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
 * Phase 5: payments and payment_adjustments — raw SQL, no application code
 * (docs/architecture.md §5.4). Same tenant-isolation/role shape as prior
 * phases, plus the one thing genuinely new here: verifying app_user has
 * literally no UPDATE or DELETE privilege on either table — not merely
 * that no RLS policy permits it. A privilege-denied error ("permission
 * denied for table X") is a structurally different failure than an RLS
 * rejection ("new row violates row-level security policy") and is checked
 * for specifically, since that's the actual guarantee product-spec.md §13
 * Rule 11 requires.
 */
describe("payments and payment_adjustments isolation", () => {
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
  let paymentId: string;

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
    planA = await seedPlan(owner, { gymId: gymA.id, name: "Monthly", priceMillimes: 50000 });
    const membership = await seedMembershipRecord(owner, {
      gymId: gymA.id,
      memberId: memberA.id,
      planId: planA.id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    membershipId = membership.id;
    const payment = await seedPayment(owner, {
      gymId: gymA.id,
      membershipId,
      amountMillimes: 50000,
      recordedByUserId: adminA.id,
    });
    paymentId = payment.id;
  });

  describe("payments", () => {
    it("Gym Admin and Gym Staff can both read own-gym payments", async () => {
      for (const [userId, role] of [[adminA.id, "GYM_ADMIN"], [staffA.id, "GYM_STAFF"]] as const) {
        const result = await withRawContext(app, { userId, gymId: gymA.id, role }, (client) =>
          client.query("SELECT id FROM payments"),
        );
        expect(result.rows.map((r) => r.id)).toEqual([paymentId]);
      }
    });

    it("cannot read another gym's payments by id", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymB.id, role: "GYM_ADMIN" },
        (client) => client.query("SELECT id FROM payments WHERE id = $1", [paymentId]),
      );
      expect(result.rows).toHaveLength(0);
    });

    it("Gym Staff CAN record a payment in their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) =>
          client.query(
            "INSERT INTO payments (gym_id, membership_id, amount_millimes, method, paid_at, recorded_by_user_id) VALUES ($1, $2, 10000, 'cash', now(), $3)",
            [gymA.id, membershipId, staffA.id],
          ),
      );
      expect(result.rowCount).toBe(1);
    });

    it("cannot record a payment into another gym", async () => {
      await expect(
        withRawContext(
          app,
          { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
          (client) =>
            client.query(
              "INSERT INTO payments (gym_id, membership_id, amount_millimes, method, paid_at, recorded_by_user_id) VALUES ($1, $2, 10000, 'cash', now(), $3)",
              [gymB.id, membershipId, adminA.id],
            ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("app_user has NO UPDATE privilege on payments at all (privilege-denied, not RLS)", async () => {
      await expect(
        withRawContext(app, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" }, (client) =>
          client.query("UPDATE payments SET amount_millimes = 1 WHERE id = $1", [paymentId]),
        ),
      ).rejects.toThrow(/permission denied for table payments/i);
    });

    it("app_user has NO DELETE privilege on payments at all", async () => {
      await expect(
        withRawContext(app, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" }, (client) =>
          client.query("DELETE FROM payments WHERE id = $1", [paymentId]),
        ),
      ).rejects.toThrow(/permission denied for table payments/i);
    });

    it("Platform Admin gets zero rows from payments (no RLS bypass)", async () => {
      const result = await withRawContext(
        app,
        { userId: platformAdmin.id, role: "PLATFORM_ADMIN" },
        (client) => client.query("SELECT id FROM payments"),
      );
      expect(result.rows).toHaveLength(0);
    });
  });

  describe("payment_adjustments", () => {
    it("Gym Admin CAN insert an adjustment in their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) =>
          client.query(
            "INSERT INTO payment_adjustments (gym_id, payment_id, amount_millimes, recorded_by_user_id) VALUES ($1, $2, -50000, $3)",
            [gymA.id, paymentId, adminA.id],
          ),
      );
      expect(result.rowCount).toBe(1);
    });

    it("Gym Staff CANNOT insert an adjustment (blocked by RLS, not just app-layer checks)", async () => {
      await expect(
        withRawContext(app, { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" }, (client) =>
          client.query(
            "INSERT INTO payment_adjustments (gym_id, payment_id, amount_millimes, recorded_by_user_id) VALUES ($1, $2, -50000, $3)",
            [gymA.id, paymentId, staffA.id],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("app_user has NO UPDATE privilege on payment_adjustments at all", async () => {
      const adjustment = await seedPaymentAdjustment(owner, {
        gymId: gymA.id,
        paymentId,
        amountMillimes: -1000,
        recordedByUserId: adminA.id,
      });
      await expect(
        withRawContext(app, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" }, (client) =>
          client.query("UPDATE payment_adjustments SET amount_millimes = 1 WHERE id = $1", [
            adjustment.id,
          ]),
        ),
      ).rejects.toThrow(/permission denied for table payment_adjustments/i);
    });

    it("app_user has NO DELETE privilege on payment_adjustments at all", async () => {
      const adjustment = await seedPaymentAdjustment(owner, {
        gymId: gymA.id,
        paymentId,
        amountMillimes: -1000,
        recordedByUserId: adminA.id,
      });
      await expect(
        withRawContext(app, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" }, (client) =>
          client.query("DELETE FROM payment_adjustments WHERE id = $1", [adjustment.id]),
        ),
      ).rejects.toThrow(/permission denied for table payment_adjustments/i);
    });

    it("Platform Admin gets zero rows from payment_adjustments (no RLS bypass)", async () => {
      await seedPaymentAdjustment(owner, {
        gymId: gymA.id,
        paymentId,
        amountMillimes: -1000,
        recordedByUserId: adminA.id,
      });
      const result = await withRawContext(
        app,
        { userId: platformAdmin.id, role: "PLATFORM_ADMIN" },
        (client) => client.query("SELECT id FROM payment_adjustments"),
      );
      expect(result.rows).toHaveLength(0);
    });
  });
});
