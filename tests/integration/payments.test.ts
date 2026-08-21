import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  getOwnerPool,
  resetTestData,
  seedGym,
  seedMember,
  seedMembership,
  seedMembershipRecord,
  seedPlan,
  seedUser,
  type SeededGym,
  type SeededMember,
  type SeededPlan,
  type SeededUser,
} from "../helpers/testDb";
import { prisma } from "@/lib/server/db";
import {
  adjustPayment,
  gymOutstandingBalance,
  gymPlanPerformance,
  gymRevenueForPeriod,
  gymRevenueTrend,
  listPayments,
  listPaymentsPage,
  recordPayment,
  voidPayment,
} from "@/lib/server/services/payments";
import { archivePlan, createPlan } from "@/lib/server/services/plans";
import { assignMembership } from "@/lib/server/services/memberships";
import { NotFoundError, ValidationError } from "@/lib/server/errors";

describe("Phase 5 payments service", () => {
  let owner: Pool;
  let gymA: SeededGym;
  let gymB: SeededGym;
  let adminA: SeededUser;
  let staffA: SeededUser;
  let memberA: SeededMember;
  let planA: SeededPlan;
  let membershipId: string;

  beforeAll(() => {
    owner = getOwnerPool();
  });

  afterAll(async () => {
    await owner.end();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetTestData(owner);
    gymA = await seedGym(owner, "Gym A");
    gymB = await seedGym(owner, "Gym B");
    adminA = await seedUser(owner, "admin-a@test.local");
    staffA = await seedUser(owner, "staff-a@test.local");
    await seedMembership(owner, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" });
    await seedMembership(owner, { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" });
    memberA = await seedMember(owner, {
      gymId: gymA.id,
      name: "Ali",
      phone: "20123456",
      phoneNormalized: "20123456",
    });
    planA = await seedPlan(owner, { gymId: gymA.id, name: "Monthly", priceMillimes: 50000, durationDays: 30 });
    const membership = await seedMembershipRecord(owner, {
      gymId: gymA.id,
      memberId: memberA.id,
      planId: planA.id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    membershipId = membership.id;
  });

  const adminContext = () => ({ userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" as const });
  const staffContext = () => ({ userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" as const });

  describe("recordPayment", () => {
    it("Gym Admin or Gym Staff can record a payment, recording who did it", async () => {
      const { id } = await recordPayment(adminContext(), {
        membershipId,
        amountMillimes: 20000,
        method: "cash",
      });
      const [row] = await listPayments(adminContext());
      expect(row.id).toBe(id);
      expect(row.recordedByEmail).toBe("admin-a@test.local");
      expect(row.effectiveAmountMillimes).toBe(20000);

      const staffPayment = await recordPayment(staffContext(), {
        membershipId,
        amountMillimes: 10000,
        method: "card",
      });
      expect(staffPayment.id).toBeTruthy();
    });

    it("rejects a non-positive amount", async () => {
      await expect(
        recordPayment(adminContext(), { membershipId, amountMillimes: 0, method: "cash" }),
      ).rejects.toThrow(ValidationError);
      await expect(
        recordPayment(adminContext(), { membershipId, amountMillimes: -100, method: "cash" }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects a payment against a membership in another gym", async () => {
      const memberB = await seedMember(owner, {
        gymId: gymB.id,
        name: "Sami",
        phone: "20999999",
        phoneNormalized: "20999999",
      });
      const planB = await seedPlan(owner, { gymId: gymB.id, name: "Monthly" });
      const membershipB = await seedMembershipRecord(owner, {
        gymId: gymB.id,
        memberId: memberB.id,
        planId: planB.id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      await expect(
        recordPayment(adminContext(), {
          membershipId: membershipB.id,
          amountMillimes: 1000,
          method: "cash",
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("adjustPayment — Gym Admin only, append-only", () => {
    it("Gym Admin can adjust; creates a new row referencing the original, never mutates it", async () => {
      const { id: paymentId } = await recordPayment(adminContext(), {
        membershipId,
        amountMillimes: 50000,
        method: "cash",
      });
      await adjustPayment(adminContext(), paymentId, { amountMillimes: -10000, reason: "partial refund" });

      const [row] = await listPayments(adminContext());
      expect(row.amountMillimes).toBe(50000); // original untouched
      expect(row.effectiveAmountMillimes).toBe(40000); // effective reflects the adjustment
      expect(row.adjustments).toHaveLength(1);
      expect(row.adjustments[0].reason).toBe("partial refund");
      expect(row.adjustments[0].recordedByEmail).toBe("admin-a@test.local");
    });

    it("a full void is a negative adjustment equal to the effective amount — no separate void operation exists", async () => {
      const { id: paymentId } = await recordPayment(adminContext(), {
        membershipId,
        amountMillimes: 50000,
        method: "cash",
      });
      await adjustPayment(adminContext(), paymentId, { amountMillimes: -50000, reason: "void" });

      const [row] = await listPayments(adminContext());
      expect(row.effectiveAmountMillimes).toBe(0);
      expect(row.amountMillimes).toBe(50000); // the original payment row itself is never altered
    });

    it("rejects a zero-amount adjustment", async () => {
      const { id: paymentId } = await recordPayment(adminContext(), {
        membershipId,
        amountMillimes: 50000,
        method: "cash",
      });
      await expect(
        adjustPayment(adminContext(), paymentId, { amountMillimes: 0 }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects adjusting a payment that doesn't exist in this gym", async () => {
      await expect(
        adjustPayment(adminContext(), "00000000-0000-0000-0000-000000000000", { amountMillimes: -100 }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // MVP audit finding: voidPaymentAction previously trusted a client-supplied
  // effectiveAmountMillimes, so a stale page (or a concurrent adjustment
  // applied after the page rendered but before Void was clicked) could make
  // a "void" over- or under-correct instead of exactly zeroing the balance.
  // voidPayment() now recomputes the effective amount from the database
  // inside its own transaction — these tests prove that recomputation, not
  // just that *some* adjustment gets created.
  describe("voidPayment — recomputes the effective amount server-side, never trusts a client amount", () => {
    it("zeroes the effective amount exactly, even after a prior adjustment changed it from what a stale page would have shown", async () => {
      const { id: paymentId } = await recordPayment(adminContext(), {
        membershipId,
        amountMillimes: 50000,
        method: "cash",
      });
      // Simulates a concurrent/earlier adjustment a stale client page would
      // not have seen — the effective amount is now 40000, not the 50000 a
      // stale hidden field would have carried.
      await adjustPayment(adminContext(), paymentId, {
        amountMillimes: -10000,
        reason: "partial refund",
      });

      await voidPayment(adminContext(), paymentId);

      const [row] = await listPayments(adminContext());
      expect(row.effectiveAmountMillimes).toBe(0);
      expect(row.amountMillimes).toBe(50000); // the original payment row itself is never altered
      expect(row.adjustments).toHaveLength(2); // the earlier adjustment, plus the void
    });

    it("zeroes a payment with no prior adjustments", async () => {
      const { id: paymentId } = await recordPayment(adminContext(), {
        membershipId,
        amountMillimes: 25000,
        method: "cash",
      });

      await voidPayment(adminContext(), paymentId);

      const [row] = await listPayments(adminContext());
      expect(row.effectiveAmountMillimes).toBe(0);
    });

    it("rejects voiding a payment that is already fully voided", async () => {
      const { id: paymentId } = await recordPayment(adminContext(), {
        membershipId,
        amountMillimes: 50000,
        method: "cash",
      });
      await voidPayment(adminContext(), paymentId);

      await expect(voidPayment(adminContext(), paymentId)).rejects.toThrow(ValidationError);
    });

    it("rejects voiding a payment that doesn't exist in this gym", async () => {
      await expect(
        voidPayment(adminContext(), "00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundError);
    });

    it("a gym cannot void another gym's payment", async () => {
      const { id: paymentId } = await recordPayment(adminContext(), {
        membershipId,
        amountMillimes: 50000,
        method: "cash",
      });
      const adminB = await seedUser(owner, "admin-b-void@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      await expect(
        voidPayment({ userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" }, paymentId),
      ).rejects.toThrow(NotFoundError);

      // The payment in gym A is untouched by the failed cross-gym attempt.
      const [row] = await listPayments(adminContext());
      expect(row.effectiveAmountMillimes).toBe(50000);
    });
  });

  describe("outstanding balance uses the membership's snapshotted plan price, not the live plan", () => {
    it("editing/archiving the plan after payments does not change the outstanding balance calculation", async () => {
      await recordPayment(adminContext(), { membershipId, amountMillimes: 20000, method: "cash" });

      await archivePlan(adminContext(), planA.id);
      await createPlan(adminContext(), { name: "Monthly", priceMillimes: 999999, durationDays: 60 });

      const balance = await gymOutstandingBalance(adminContext());
      expect(balance).toBe(30000); // 50000 (original snapshot) - 20000, unaffected by the new plan
    });

    it("partial payments plus a void leave the correct outstanding balance", async () => {
      const { id: p1 } = await recordPayment(adminContext(), {
        membershipId,
        amountMillimes: 20000,
        method: "cash",
      });
      await recordPayment(adminContext(), { membershipId, amountMillimes: 15000, method: "cash" });
      await adjustPayment(adminContext(), p1, { amountMillimes: -20000, reason: "void" });

      const balance = await gymOutstandingBalance(adminContext());
      expect(balance).toBe(35000); // 50000 - (0 + 15000)
    });

    it("cancelled memberships are excluded from the gym-level outstanding balance", async () => {
      // Assign a second, independent membership on a fresh member so it can
      // be cancelled without conflicting with the "one current membership"
      // rule on memberA (already has one from beforeEach).
      const memberC = await seedMember(owner, {
        gymId: gymA.id,
        name: "Cancelled-membership member",
        phone: "20111111",
        phoneNormalized: "20111111",
      });
      const { id: cancelledMembershipId } = await assignMembership(adminContext(), {
        memberId: memberC.id,
        planId: planA.id,
      });
      await owner.query("UPDATE memberships SET cancelled_at = now() WHERE id = $1", [
        cancelledMembershipId,
      ]);

      const balanceBefore = await gymOutstandingBalance(adminContext());
      // The cancelled membership's full 50000 price must NOT appear.
      expect(balanceBefore).toBe(50000); // only memberA's untouched membership
    });
  });

  describe("gymRevenueForPeriod — recorded-period attribution, not retroactive", () => {
    it("a payment counts toward the period of its paidAt", async () => {
      await recordPayment(adminContext(), {
        membershipId,
        amountMillimes: 10000,
        method: "cash",
        paidAt: new Date("2026-03-15"),
      });
      const march = await gymRevenueForPeriod(
        adminContext(),
        new Date("2026-03-01"),
        new Date("2026-03-31"),
      );
      const april = await gymRevenueForPeriod(
        adminContext(),
        new Date("2026-04-01"),
        new Date("2026-04-30"),
      );
      expect(march).toBe(10000);
      expect(april).toBe(0);
    });

    it("a later adjustment counts toward its own period, and does not rewrite the original payment's period", async () => {
      const { id: paymentId } = await recordPayment(adminContext(), {
        membershipId,
        amountMillimes: 10000,
        method: "cash",
        paidAt: new Date("2026-03-15"),
      });
      await withOwnerCreatedAt(owner, paymentId);

      const march = await gymRevenueForPeriod(
        adminContext(),
        new Date("2026-03-01"),
        new Date("2026-03-31"),
      );
      const april = await gymRevenueForPeriod(
        adminContext(),
        new Date("2026-04-01"),
        new Date("2026-04-30"),
      );
      expect(march).toBe(10000);
      expect(april).toBe(-2000);
    });
  });

  describe("tenant isolation at the service layer", () => {
    it("a gym cannot list another gym's payments", async () => {
      await recordPayment(adminContext(), { membershipId, amountMillimes: 10000, method: "cash" });
      const adminB = await seedUser(owner, "admin-b@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      const gymBPayments = await listPayments({ userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });
      expect(gymBPayments).toHaveLength(0);
    });
  });

  // Security audit finding M2: listPayments() itself stays unbounded (used
  // by tests and any caller needing the full set); listPaymentsPage() is
  // the bounded counterpart the Payments screen actually renders from.
  describe("listPaymentsPage (M2 pagination)", () => {
    it("bounds a large payment history to one page, with a stable total count", async () => {
      for (let i = 0; i < 30; i++) {
        await recordPayment(adminContext(), {
          membershipId,
          amountMillimes: 1000,
          method: "cash",
          paidAt: new Date(2026, 0, 1, 0, 0, i), // distinct paidAt per row
        });
      }

      const page1 = await listPaymentsPage(adminContext(), { page: 1 });
      expect(page1.items).toHaveLength(25);
      expect(page1.totalCount).toBe(30);
      expect(page1.totalPages).toBe(2);
      expect(page1.page).toBe(1);

      const page2 = await listPaymentsPage(adminContext(), { page: 2 });
      expect(page2.items).toHaveLength(5);
      expect(page2.totalCount).toBe(30);

      // No row appears on both pages, and every row appears exactly once.
      const allIds = [...page1.items, ...page2.items].map((p) => p.id);
      expect(new Set(allIds).size).toBe(30);
    });

    it("clamps an out-of-range or invalid page to a safe result instead of throwing", async () => {
      await recordPayment(adminContext(), { membershipId, amountMillimes: 1000, method: "cash" });

      const farPage = await listPaymentsPage(adminContext(), { page: 999 });
      expect(farPage.items).toHaveLength(0);
      expect(farPage.totalCount).toBe(1);

      const zeroPage = await listPaymentsPage(adminContext(), { page: 0 });
      expect(zeroPage.page).toBe(1);
      expect(zeroPage.items).toHaveLength(1);
    });

    it("a gym cannot see another gym's payments through the paginated query either", async () => {
      await recordPayment(adminContext(), { membershipId, amountMillimes: 10000, method: "cash" });
      const adminB = await seedUser(owner, "admin-b@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      const gymBPage = await listPaymentsPage({ userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });
      expect(gymBPage.items).toHaveLength(0);
      expect(gymBPage.totalCount).toBe(0);
    });
  });

  describe("Phase 8 — gymRevenueTrend", () => {
    it("returns one point per period with exact hand-computed revenue, including a later cross-period adjustment", async () => {
      const { id: paymentId } = await recordPayment(adminContext(), {
        membershipId,
        amountMillimes: 10000,
        method: "cash",
        paidAt: new Date("2026-03-15"),
      });
      await recordPayment(adminContext(), {
        membershipId,
        amountMillimes: 5000,
        method: "cash",
        paidAt: new Date("2026-04-10"),
      });
      await withOwnerCreatedAt(owner, paymentId); // -2000 in April, per the helper below

      const periods = [
        { start: new Date("2026-03-01"), end: new Date("2026-03-31T23:59:59.999") },
        { start: new Date("2026-04-01"), end: new Date("2026-04-30T23:59:59.999") },
        { start: new Date("2026-05-01"), end: new Date("2026-05-31T23:59:59.999") },
      ];
      const trend = await gymRevenueTrend(adminContext(), periods);
      expect(trend).toHaveLength(3);
      expect(trend[0].revenueMillimes).toBe(10000); // March: only the original payment
      expect(trend[1].revenueMillimes).toBe(3000); // April: 5000 payment - 2000 adjustment
      expect(trend[2].revenueMillimes).toBe(0); // May: nothing recorded
    });

    it("a gym cannot see another gym's revenue trend", async () => {
      await recordPayment(adminContext(), {
        membershipId,
        amountMillimes: 10000,
        method: "cash",
        paidAt: new Date("2026-03-15"),
      });
      const adminB = await seedUser(owner, "admin-b@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      const trend = await gymRevenueTrend(
        { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" },
        [{ start: new Date("2026-03-01"), end: new Date("2026-03-31T23:59:59.999") }],
      );
      expect(trend[0].revenueMillimes).toBe(0);
    });
  });

  describe("Phase 8 — gymPlanPerformance", () => {
    it("groups by planNameSnapshot, sums effective revenue, scoped to memberships started within the window", async () => {
      const planB = await seedPlan(owner, {
        gymId: gymA.id,
        name: "Annual",
        priceMillimes: 500000,
        durationDays: 365,
      });
      const memberC = await seedMember(owner, {
        gymId: gymA.id,
        name: "Second member",
        phone: "20777777",
        phoneNormalized: "20777777",
      });
      // memberA's Monthly membership (from beforeEach, membershipId) starts "now".
      const { id: annualMembershipId } = await assignMembership(adminContext(), {
        memberId: memberC.id,
        planId: planB.id,
      });

      await recordPayment(adminContext(), { membershipId, amountMillimes: 50000, method: "cash" });
      await recordPayment(adminContext(), {
        membershipId: annualMembershipId,
        amountMillimes: 500000,
        method: "cash",
      });

      const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const windowEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const performance = await gymPlanPerformance(adminContext(), windowStart, windowEnd);

      expect(performance).toHaveLength(2);
      const monthly = performance.find((p) => p.planName === "Monthly")!;
      const annual = performance.find((p) => p.planName === "Annual")!;
      expect(monthly.memberCount).toBe(1);
      expect(monthly.revenueMillimes).toBe(50000);
      expect(annual.memberCount).toBe(1);
      expect(annual.revenueMillimes).toBe(500000);
      // Sorted by revenue descending.
      expect(performance[0].planName).toBe("Annual");
    });

    it("excludes memberships started outside the window", async () => {
      // memberA's membership (from beforeEach) starts "now" — well outside a
      // window entirely in the past.
      await recordPayment(adminContext(), { membershipId, amountMillimes: 50000, method: "cash" });

      const windowStart = new Date("2020-01-01");
      const windowEnd = new Date("2020-01-31");
      const performance = await gymPlanPerformance(adminContext(), windowStart, windowEnd);
      expect(performance).toHaveLength(0);
    });

    it("a gym cannot see another gym's plan performance", async () => {
      await recordPayment(adminContext(), { membershipId, amountMillimes: 50000, method: "cash" });
      const adminB = await seedUser(owner, "admin-b@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      const performance = await gymPlanPerformance(
        { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" },
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      );
      expect(performance).toHaveLength(0);
    });
  });
});

/**
 * Records an April adjustment (-2000) against the given payment directly
 * via the owner pool, since adjustPayment() always stamps createdAt as
 * "now" and this test needs a specific historical date to prove
 * recorded-period attribution.
 */
async function withOwnerCreatedAt(owner: Pool, paymentId: string): Promise<void> {
  const gymRow = await owner.query("SELECT gym_id FROM payments WHERE id = $1", [paymentId]);
  const gymId = gymRow.rows[0].gym_id;
  const adminRow = await owner.query(
    "SELECT recorded_by_user_id FROM payments WHERE id = $1",
    [paymentId],
  );
  const userId = adminRow.rows[0].recorded_by_user_id;
  await owner.query(
    "INSERT INTO payment_adjustments (gym_id, payment_id, amount_millimes, recorded_by_user_id, created_at) VALUES ($1, $2, -2000, $3, $4)",
    [gymId, paymentId, userId, new Date("2026-04-05")],
  );
}
