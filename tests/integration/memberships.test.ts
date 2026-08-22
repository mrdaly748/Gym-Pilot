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
import { prisma, withTenant } from "@/lib/server/db";
import {
  assignMembership,
  cancelMembership,
  freezeMembership,
  gymMembershipDashboardSummary,
  gymMembershipGrowthTrend,
  listMemberships,
  renewMembership,
  resumeMembership,
} from "@/lib/server/services/memberships";
import { archivePlan, createPlan } from "@/lib/server/services/plans";
import { NotFoundError, ValidationError } from "@/lib/server/errors";

describe("Phase 4 memberships service", () => {
  let owner: Pool;
  let gymA: SeededGym;
  let gymB: SeededGym;
  let adminA: SeededUser;
  let staffA: SeededUser;
  let memberA: SeededMember;
  let planA: SeededPlan;

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
  });

  const adminContext = () => ({ userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" as const });
  const staffContext = () => ({ userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" as const });

  describe("assign", () => {
    it("Gym Admin or Gym Staff can assign a membership, snapshotting the plan's terms", async () => {
      const { id } = await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      const [row] = await listMemberships(adminContext());
      expect(row.id).toBe(id);
      expect(row.planNameSnapshot).toBe("Monthly");
      expect(row.priceMillimesSnapshot).toBe(50000);
      expect(row.durationDaysSnapshot).toBe(30);
      expect(row.status).toBe("ACTIVE");
    });

    it("Gym Staff can assign too", async () => {
      const { id } = await assignMembership(staffContext(), { memberId: memberA.id, planId: planA.id });
      expect(id).toBeTruthy();
    });

    it("rejects assigning a second membership while one is current", async () => {
      await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      await expect(
        assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects assigning to an archived plan", async () => {
      const archivedPlan = await seedPlan(owner, { gymId: gymA.id, name: "Old" });
      await owner.query("UPDATE membership_plans SET archived_at = now() WHERE id = $1", [
        archivedPlan.id,
      ]);
      await expect(
        assignMembership(adminContext(), { memberId: memberA.id, planId: archivedPlan.id }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects assigning a membership to an archived member", async () => {
      await owner.query("UPDATE members SET archived_at = now() WHERE id = $1", [memberA.id]);
      await expect(
        assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects assigning a plan/member from another gym (app-layer scoping)", async () => {
      const memberB = await seedMember(owner, {
        gymId: gymB.id,
        name: "Sami",
        phone: "20999999",
        phoneNormalized: "20999999",
      });
      await expect(
        assignMembership(adminContext(), { memberId: memberB.id, planId: planA.id }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // Portfolio-readiness hardening pass: memberships_no_overlapping_per_member
  // (prisma/migrations/20260826100000_memberships_no_overlapping_per_member)
  // — the database-level backstop for product-spec.md §13 Rule 8.
  describe("assign — database-level overlap enforcement", () => {
    it("rejects a backdated assignment overlapping an expired-but-not-cancelled membership, even though the app's status check alone would not catch it (boundary: exactly on the prior end date)", async () => {
      const priorStart = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
      const priorEnd = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      await seedMembershipRecord(owner, {
        gymId: gymA.id,
        memberId: memberA.id,
        planId: planA.id,
        startDate: priorStart,
        endDate: priorEnd,
      });

      // assignMembership()'s own hasCurrent check would NOT reject this —
      // the prior membership is EXPIRED, which never counts as "current" —
      // so only the database's exclusion constraint catches this overlap.
      await expect(
        assignMembership(adminContext(), {
          memberId: memberA.id,
          planId: planA.id,
          startDate: priorEnd,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("allows assigning starting the day after an expired membership's end date (boundary: no overlap)", async () => {
      const priorStart = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
      const priorEnd = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      await seedMembershipRecord(owner, {
        gymId: gymA.id,
        memberId: memberA.id,
        planId: planA.id,
        startDate: priorStart,
        endDate: priorEnd,
      });
      const dayAfter = new Date(priorEnd);
      dayAfter.setDate(dayAfter.getDate() + 1);

      const { id } = await assignMembership(adminContext(), {
        memberId: memberA.id,
        planId: planA.id,
        startDate: dayAfter,
      });
      expect(id).toBeTruthy();
    });

    it("different members can each have a current membership without conflict", async () => {
      const memberOther = await seedMember(owner, {
        gymId: gymA.id,
        name: "Other Member",
        phone: "20666777",
        phoneNormalized: "20666777",
      });
      await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      const { id } = await assignMembership(adminContext(), {
        memberId: memberOther.id,
        planId: planA.id,
      });
      expect(id).toBeTruthy();
    });

    it("remains gym-scoped: two different gyms' members can have identical, overlapping-in-time memberships unaffected", async () => {
      const adminB = await seedUser(owner, "admin-b-overlap@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });
      const memberB = await seedMember(owner, {
        gymId: gymB.id,
        name: "Sami",
        phone: "20999111",
        phoneNormalized: "20999111",
      });
      const planB = await seedPlan(owner, { gymId: gymB.id, name: "Monthly" });

      await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      const { id } = await assignMembership(
        { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" },
        { memberId: memberB.id, planId: planB.id },
      );
      expect(id).toBeTruthy();
    });

    it("the database's own exclusion constraint rejects an overlapping row even when the app-layer pre-check is bypassed", async () => {
      const start = new Date();
      const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await withTenant(adminContext(), (tx) =>
        tx.membership.create({
          data: {
            gymId: gymA.id,
            memberId: memberA.id,
            planId: planA.id,
            planNameSnapshot: "Monthly",
            priceMillimesSnapshot: 50000,
            durationDaysSnapshot: 30,
            startDate: start,
            endDate: end,
          },
        }),
      );

      await expect(
        withTenant(adminContext(), (tx) =>
          tx.membership.create({
            data: {
              gymId: gymA.id,
              memberId: memberA.id,
              planId: planA.id,
              planNameSnapshot: "Monthly",
              priceMillimesSnapshot: 50000,
              durationDaysSnapshot: 30,
              startDate: start,
              endDate: end,
            },
          }),
        ),
      ).rejects.toThrow(/exclusion constraint/i);
    });

    it("a genuine race (two concurrent assignments for a member with no current membership) still results in exactly one row, and the loser sees a ValidationError", async () => {
      const results = await Promise.allSettled([
        assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id }),
        assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ValidationError);

      const memberships = await listMemberships(adminContext(), { memberId: memberA.id });
      expect(memberships).toHaveLength(1);
    });
  });

  // Product-completion audit, P0 #2: the Member Detail page fetches a
  // single member's membership history via this filter.
  describe("listMemberships({ memberId }) — Member Detail scoping", () => {
    it("returns only the requested member's memberships, not another member's in the same gym", async () => {
      const memberC = await seedMember(owner, {
        gymId: gymA.id,
        name: "Other Member",
        phone: "20777888",
        phoneNormalized: "20777888",
      });
      await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      await assignMembership(adminContext(), { memberId: memberC.id, planId: planA.id });

      const results = await listMemberships(adminContext(), { memberId: memberA.id });
      expect(results).toHaveLength(1);
      expect(results[0].memberId).toBe(memberA.id);
    });
  });

  describe("plan price/duration changes are not retroactive", () => {
    it("editing the plan after assignment does not change the already-sold membership's snapshot", async () => {
      await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });

      // Simulate a plan price/duration change the only way Phase 3 allows —
      // archive the old plan and create a new one (plans.ts has no
      // updatePrice; archive-and-recreate is the actual product flow).
      await archivePlan(adminContext(), planA.id);
      await createPlan(adminContext(), { name: "Monthly", priceMillimes: 99999, durationDays: 60 });

      const [row] = await listMemberships(adminContext());
      expect(row.priceMillimesSnapshot).toBe(50000);
      expect(row.durationDaysSnapshot).toBe(30);
    });
  });

  describe("renew", () => {
    it("creates a new row and leaves the prior one intact and queryable as history", async () => {
      const { id: firstId } = await assignMembership(adminContext(), {
        memberId: memberA.id,
        planId: planA.id,
      });
      const { id: renewedId } = await renewMembership(adminContext(), firstId);
      expect(renewedId).not.toBe(firstId);

      const all = await listMemberships(adminContext());
      expect(all.map((m) => m.id).sort()).toEqual([firstId, renewedId].sort());
    });

    it("the renewed membership starts the day after the prior one ends (no gap/overlap)", async () => {
      const { id: firstId } = await assignMembership(adminContext(), {
        memberId: memberA.id,
        planId: planA.id,
      });
      const before = await listMemberships(adminContext());
      const priorEndDate = before.find((m) => m.id === firstId)!.endDate;

      const { id: renewedId } = await renewMembership(adminContext(), firstId);
      const after = await listMemberships(adminContext());
      const renewed = after.find((m) => m.id === renewedId)!;

      const expectedStart = new Date(priorEndDate);
      expectedStart.setDate(expectedStart.getDate() + 1);
      expect(renewed.startDate.toISOString().slice(0, 10)).toBe(
        expectedStart.toISOString().slice(0, 10),
      );
    });

    it("rejects renewing a cancelled membership", async () => {
      const { id } = await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      await cancelMembership(adminContext(), id);
      await expect(renewMembership(adminContext(), id)).rejects.toThrow(ValidationError);
    });

    it("rejects renewing onto an archived plan when an explicit planId is supplied", async () => {
      const { id } = await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      const archivedPlan = await seedPlan(owner, { gymId: gymA.id, name: "Old" });
      await owner.query("UPDATE membership_plans SET archived_at = now() WHERE id = $1", [
        archivedPlan.id,
      ]);

      await expect(
        renewMembership(adminContext(), id, { planId: archivedPlan.id }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("freeze / resume", () => {
    it("freezes and resumes, shifting the end date by the frozen duration", async () => {
      const { id } = await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      const before = (await listMemberships(adminContext())).find((m) => m.id === id)!;

      await freezeMembership(staffContext(), id);
      const frozen = (await listMemberships(adminContext())).find((m) => m.id === id)!;
      expect(frozen.status).toBe("FROZEN");

      await resumeMembership(staffContext(), id);
      const resumed = (await listMemberships(adminContext())).find((m) => m.id === id)!;
      expect(resumed.status).not.toBe("FROZEN");
      expect(resumed.endDate.getTime()).toBeGreaterThanOrEqual(before.endDate.getTime());
    });

    it("rejects freezing an already-frozen membership", async () => {
      const { id } = await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      await freezeMembership(adminContext(), id);
      await expect(freezeMembership(adminContext(), id)).rejects.toThrow(ValidationError);
    });

    it("rejects resuming a membership that isn't frozen", async () => {
      const { id } = await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      await expect(resumeMembership(adminContext(), id)).rejects.toThrow(ValidationError);
    });

    it("rejects freezing a cancelled membership", async () => {
      const { id } = await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      await cancelMembership(adminContext(), id);
      await expect(freezeMembership(adminContext(), id)).rejects.toThrow(ValidationError);
    });

    it("rejects freezing a membership from another gym (app-layer scoping)", async () => {
      const { id } = await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      const adminB = await seedUser(owner, "admin-b-freeze@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      await expect(
        freezeMembership({ userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" }, id),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects resuming a membership from another gym (app-layer scoping)", async () => {
      const { id } = await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      await freezeMembership(adminContext(), id);
      const adminB = await seedUser(owner, "admin-b-resume@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      await expect(
        resumeMembership({ userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" }, id),
      ).rejects.toThrow(NotFoundError);
    });

    it("repeated freeze -> resume -> freeze -> resume does not corrupt the end date", async () => {
      const { id } = await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      const original = (await listMemberships(adminContext())).find((m) => m.id === id)!;

      await freezeMembership(staffContext(), id);
      await resumeMembership(staffContext(), id);
      const afterFirst = (await listMemberships(adminContext())).find((m) => m.id === id)!;

      await freezeMembership(staffContext(), id);
      await resumeMembership(staffContext(), id);
      const afterSecond = (await listMemberships(adminContext())).find((m) => m.id === id)!;

      expect(afterFirst.endDate.getTime()).toBeGreaterThanOrEqual(original.endDate.getTime());
      expect(afterSecond.endDate.getTime()).toBeGreaterThanOrEqual(afterFirst.endDate.getTime());
      expect(afterSecond.status).not.toBe("FROZEN");
    });
  });

  describe("cancel — Gym Admin only", () => {
    it("Gym Admin can cancel", async () => {
      const { id } = await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      await cancelMembership(adminContext(), id);
      const [row] = await listMemberships(adminContext());
      expect(row.status).toBe("CANCELLED");
    });

    it("rejects cancelling an already-cancelled membership", async () => {
      const { id } = await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      await cancelMembership(adminContext(), id);
      await expect(cancelMembership(adminContext(), id)).rejects.toThrow(NotFoundError);
    });

    it("rejects cancelling a membership from another gym (app-layer scoping)", async () => {
      const { id } = await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      const adminB = await seedUser(owner, "admin-b-cancel@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      await expect(
        cancelMembership({ userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" }, id),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("tenant isolation at the service layer", () => {
    it("a gym cannot list another gym's memberships", async () => {
      await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      const adminB = await seedUser(owner, "admin-b@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      const gymBMemberships = await listMemberships({
        userId: adminB.id,
        gymId: gymB.id,
        role: "GYM_ADMIN",
      });
      expect(gymBMemberships).toHaveLength(0);
    });
  });

  // Product-completion audit, P0 #1: the Payments screen's membership picker
  // narrows by the linked member's name/phone via the same matching
  // semantics listMembers() uses, reused via a nested relation filter.
  describe("listMemberships — search (q) narrows by the linked member's name/phone", () => {
    it("matches by the member's name", async () => {
      const memberB = await seedMember(owner, {
        gymId: gymA.id,
        name: "Zied Karray",
        phone: "20 777 888",
        phoneNormalized: "20777888",
      });
      await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id }); // Ali
      await assignMembership(adminContext(), { memberId: memberB.id, planId: planA.id }); // Zied

      const results = await listMemberships(adminContext(), { q: "Ali" });
      expect(results).toHaveLength(1);
      expect(results[0].memberName).toBe("Ali");
    });

    it("matches by the member's phone number", async () => {
      await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });

      const results = await listMemberships(adminContext(), { q: "20123" });
      expect(results).toHaveLength(1);
      expect(results[0].memberId).toBe(memberA.id);
    });

    it("returns an empty list, not an error, when nothing matches", async () => {
      await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });

      const results = await listMemberships(adminContext(), { q: "nobody-with-this-name" });
      expect(results).toHaveLength(0);
    });

    it("an unfiltered call (no q) is unaffected — existing behavior is preserved", async () => {
      await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });

      const results = await listMemberships(adminContext());
      expect(results).toHaveLength(1);
    });

    it("search respects tenant isolation — cannot match another gym's member via q", async () => {
      const adminB = await seedUser(owner, "admin-b-search@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });
      const memberB = await seedMember(owner, {
        gymId: gymB.id,
        name: "Ali", // deliberately the same name as gym A's member
        phone: "29000000",
        phoneNormalized: "29000000",
      });
      const planB = await seedPlan(owner, { gymId: gymB.id, name: "Monthly" });
      await assignMembership(
        { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" },
        { memberId: memberB.id, planId: planB.id },
      );
      await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });

      const results = await listMemberships(adminContext(), { q: "Ali" });
      expect(results).toHaveLength(1);
      expect(results[0].memberId).toBe(memberA.id);
    });
  });

  describe("Phase 8 — gymMembershipDashboardSummary", () => {
    it("activeMembers counts ACTIVE/EXPIRING_SOON and excludes EXPIRED/CANCELLED", async () => {
      // ACTIVE (assigned via the service — default plan duration, not near expiry).
      await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });

      // EXPIRED — a second member, membership ended in the past.
      const memberExpired = await seedMember(owner, {
        gymId: gymA.id,
        name: "Expired Member",
        phone: "20111111",
        phoneNormalized: "20111111",
      });
      await seedMembershipRecord(owner, {
        gymId: gymA.id,
        memberId: memberExpired.id,
        planId: planA.id,
        startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });

      // CANCELLED — a third member.
      const memberCancelled = await seedMember(owner, {
        gymId: gymA.id,
        name: "Cancelled Member",
        phone: "20222222",
        phoneNormalized: "20222222",
      });
      const cancelledMembership = await seedMembershipRecord(owner, {
        gymId: gymA.id,
        memberId: memberCancelled.id,
        planId: planA.id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      await owner.query("UPDATE memberships SET cancelled_at = now() WHERE id = $1", [
        cancelledMembership.id,
      ]);

      const summary = await gymMembershipDashboardSummary(
        adminContext(),
        new Date("2026-01-01"),
        new Date("2026-12-31"),
      );
      expect(summary.activeMembers).toBe(1);
    });

    it("newMembers counts members whose joinDate falls within the period", async () => {
      await seedMember(owner, {
        gymId: gymA.id,
        name: "March joiner",
        phone: "20333333",
        phoneNormalized: "20333333",
        joinDate: new Date("2026-03-15"),
      });
      await seedMember(owner, {
        gymId: gymA.id,
        name: "April joiner",
        phone: "20444444",
        phoneNormalized: "20444444",
        joinDate: new Date("2026-04-01"),
      });
      // memberA (from beforeEach) joins "now" by default — outside the March window.

      const summary = await gymMembershipDashboardSummary(
        adminContext(),
        new Date("2026-03-01"),
        new Date("2026-03-31"),
      );
      expect(summary.newMembers).toBe(1);
    });

    it("expiringSoon lists memberships within the default 7-day window", async () => {
      const memberExpiring = await seedMember(owner, {
        gymId: gymA.id,
        name: "Expiring Member",
        phone: "20555555",
        phoneNormalized: "20555555",
      });
      await seedMembershipRecord(owner, {
        gymId: gymA.id,
        memberId: memberExpiring.id,
        planId: planA.id,
        startDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      });

      const summary = await gymMembershipDashboardSummary(
        adminContext(),
        new Date("2026-01-01"),
        new Date("2026-12-31"),
      );
      expect(summary.expiringSoon).toHaveLength(1);
      expect(summary.expiringSoon[0].memberName).toBe("Expiring Member");
    });

    it("a gym cannot see another gym's membership dashboard data", async () => {
      await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      const adminB = await seedUser(owner, "admin-b@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      const summary = await gymMembershipDashboardSummary(
        { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" },
        new Date("2026-01-01"),
        new Date("2026-12-31"),
      );
      expect(summary.activeMembers).toBe(0);
      expect(summary.newMembers).toBe(0);
      expect(summary.expiringSoon).toHaveLength(0);
    });
  });

  describe("Phase 8 — gymMembershipGrowthTrend", () => {
    it("computes the active-member count as of each period's end, reflecting expirations and new memberships", async () => {
      const member1 = await seedMember(owner, {
        gymId: gymA.id,
        name: "Feb-only member",
        phone: "20111111",
        phoneNormalized: "20111111",
      });
      const member2 = await seedMember(owner, {
        gymId: gymA.id,
        name: "March onward member",
        phone: "20222222",
        phoneNormalized: "20222222",
      });
      const member3 = await seedMember(owner, {
        gymId: gymA.id,
        name: "April onward member",
        phone: "20333333",
        phoneNormalized: "20333333",
      });

      await seedMembershipRecord(owner, {
        gymId: gymA.id,
        memberId: member1.id,
        planId: planA.id,
        startDate: new Date("2026-02-01"),
        endDate: new Date("2026-03-15"),
      });
      await seedMembershipRecord(owner, {
        gymId: gymA.id,
        memberId: member2.id,
        planId: planA.id,
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-06-01"),
      });
      await seedMembershipRecord(owner, {
        gymId: gymA.id,
        memberId: member3.id,
        planId: planA.id,
        startDate: new Date("2026-04-01"),
        endDate: new Date("2026-07-01"),
      });

      const periods = [
        { start: new Date("2026-02-01"), end: new Date("2026-02-28T23:59:59.999") },
        { start: new Date("2026-03-01"), end: new Date("2026-03-31T23:59:59.999") },
        { start: new Date("2026-04-01"), end: new Date("2026-04-30T23:59:59.999") },
      ];
      const trend = await gymMembershipGrowthTrend(adminContext(), periods);
      expect(trend).toHaveLength(3);
      expect(trend[0].activeMembers).toBe(1); // Feb: only member1
      expect(trend[1].activeMembers).toBe(1); // Mar: member1 expired, member2 active
      expect(trend[2].activeMembers).toBe(2); // Apr: member2 and member3 both active
    });

    it("a gym cannot see another gym's membership growth trend", async () => {
      await assignMembership(adminContext(), { memberId: memberA.id, planId: planA.id });
      const adminB = await seedUser(owner, "admin-b@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      const now = new Date();
      const trend = await gymMembershipGrowthTrend(
        { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" },
        [{ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }],
      );
      expect(trend[0].activeMembers).toBe(0);
    });
  });
});
