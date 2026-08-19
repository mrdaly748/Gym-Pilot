import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  getOwnerPool,
  resetTestData,
  seedGym,
  seedMember,
  seedMembership,
  seedPlan,
  seedUser,
  type SeededGym,
  type SeededMember,
  type SeededPlan,
  type SeededUser,
} from "../helpers/testDb";
import { prisma } from "@/lib/server/db";
import {
  assignMembership,
  cancelMembership,
  freezeMembership,
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
});
