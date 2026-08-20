import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  getOwnerPool,
  resetTestData,
  seedCheckin,
  seedGym,
  seedMember,
  seedMembershipRecord,
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
  correctCheckin,
  deleteCheckin,
  gymAttendanceMetrics,
  gymAttendanceTrend,
  listCheckins,
  recordCheckin,
} from "@/lib/server/services/attendance";
import { NotFoundError, ValidationError } from "@/lib/server/errors";

describe("Phase 6 attendance service", () => {
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

  describe("recordCheckin — status surfaced, never blocks", () => {
    it("active membership: check-in succeeds and surfaces ACTIVE", async () => {
      await seedMembershipRecord(owner, {
        gymId: gymA.id,
        memberId: memberA.id,
        planId: planA.id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      const result = await recordCheckin(adminContext(), memberA.id);
      expect(result.membershipStatus).toBe("ACTIVE");
    });

    it("expiring-soon membership: check-in succeeds and surfaces EXPIRING_SOON", async () => {
      await seedMembershipRecord(owner, {
        gymId: gymA.id,
        memberId: memberA.id,
        planId: planA.id,
        startDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      });
      const result = await recordCheckin(staffContext(), memberA.id);
      expect(result.membershipStatus).toBe("EXPIRING_SOON");
    });

    it("expired membership: check-in still succeeds and surfaces EXPIRED", async () => {
      await seedMembershipRecord(owner, {
        gymId: gymA.id,
        memberId: memberA.id,
        planId: planA.id,
        startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });
      const result = await recordCheckin(staffContext(), memberA.id);
      expect(result.membershipStatus).toBe("EXPIRED");
    });

    it("frozen membership: check-in still succeeds and surfaces FROZEN", async () => {
      const membership = await seedMembershipRecord(owner, {
        gymId: gymA.id,
        memberId: memberA.id,
        planId: planA.id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      await owner.query(
        "INSERT INTO membership_freezes (gym_id, membership_id, frozen_at) VALUES ($1, $2, now())",
        [gymA.id, membership.id],
      );
      const result = await recordCheckin(adminContext(), memberA.id);
      expect(result.membershipStatus).toBe("FROZEN");
    });

    it("cancelled membership: check-in still succeeds and surfaces CANCELLED", async () => {
      const membership = await seedMembershipRecord(owner, {
        gymId: gymA.id,
        memberId: memberA.id,
        planId: planA.id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      await owner.query("UPDATE memberships SET cancelled_at = now() WHERE id = $1", [
        membership.id,
      ]);
      const result = await recordCheckin(staffContext(), memberA.id);
      expect(result.membershipStatus).toBe("CANCELLED");
    });

    it("no membership at all: check-in still succeeds and surfaces null", async () => {
      const result = await recordCheckin(adminContext(), memberA.id);
      expect(result.membershipStatus).toBeNull();
    });

    it("rejects an archived member", async () => {
      const archived = await seedMember(owner, {
        gymId: gymA.id,
        name: "Archived Member",
        phone: "20999999",
        phoneNormalized: "20999999",
        archivedAt: new Date(),
      });
      await expect(recordCheckin(adminContext(), archived.id)).rejects.toThrow(ValidationError);
    });

    it("rejects a member from another gym", async () => {
      const memberB = await seedMember(owner, {
        gymId: gymB.id,
        name: "Sami",
        phone: "20888888",
        phoneNormalized: "20888888",
      });
      await expect(recordCheckin(adminContext(), memberB.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe("listCheckins", () => {
    it("lists by member", async () => {
      const memberC = await seedMember(owner, {
        gymId: gymA.id,
        name: "Other",
        phone: "20777777",
        phoneNormalized: "20777777",
      });
      await recordCheckin(adminContext(), memberA.id);
      await recordCheckin(adminContext(), memberC.id);

      const rows = await listCheckins(adminContext(), { memberId: memberA.id });
      expect(rows).toHaveLength(1);
      expect(rows[0].memberId).toBe(memberA.id);
    });

    it("lists by period", async () => {
      await seedCheckin(owner, {
        gymId: gymA.id,
        memberId: memberA.id,
        checkedInAt: new Date("2026-03-15"),
        recordedByUserId: adminA.id,
      });
      await seedCheckin(owner, {
        gymId: gymA.id,
        memberId: memberA.id,
        checkedInAt: new Date("2026-04-15"),
        recordedByUserId: adminA.id,
      });

      const march = await listCheckins(adminContext(), {
        periodStart: new Date("2026-03-01"),
        periodEnd: new Date("2026-03-31"),
      });
      expect(march).toHaveLength(1);
    });
  });

  describe("gymAttendanceMetrics", () => {
    it("matches hand-computed total/unique-visitor values", async () => {
      const memberC = await seedMember(owner, {
        gymId: gymA.id,
        name: "Other",
        phone: "20777777",
        phoneNormalized: "20777777",
      });
      await seedCheckin(owner, {
        gymId: gymA.id,
        memberId: memberA.id,
        checkedInAt: new Date("2026-03-05"),
        recordedByUserId: adminA.id,
      });
      await seedCheckin(owner, {
        gymId: gymA.id,
        memberId: memberA.id,
        checkedInAt: new Date("2026-03-10"),
        recordedByUserId: adminA.id,
      });
      await seedCheckin(owner, {
        gymId: gymA.id,
        memberId: memberC.id,
        checkedInAt: new Date("2026-03-20"),
        recordedByUserId: staffA.id,
      });

      const result = await gymAttendanceMetrics(
        adminContext(),
        new Date("2026-03-01"),
        new Date("2026-03-31"),
      );
      expect(result.totalCheckins).toBe(3);
      expect(result.uniqueVisitors).toBe(2);
    });
  });

  describe("correction behavior — Gym Admin only at the service layer", () => {
    it("correctCheckin updates the recorded time of a mis-recorded check-in", async () => {
      const { id: checkinId } = await recordCheckin(staffContext(), memberA.id);
      const correctedTime = new Date("2026-03-01T09:00:00Z");
      await correctCheckin(adminContext(), checkinId, { checkedInAt: correctedTime });

      const [row] = await listCheckins(adminContext(), { memberId: memberA.id });
      expect(row.checkedInAt.toISOString()).toBe(correctedTime.toISOString());
    });

    it("correctCheckin rejects an unknown check-in", async () => {
      await expect(
        correctCheckin(adminContext(), "00000000-0000-0000-0000-000000000000", {
          checkedInAt: new Date(),
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("deleteCheckin removes a mis-recorded check-in", async () => {
      const { id: checkinId } = await recordCheckin(staffContext(), memberA.id);
      await deleteCheckin(adminContext(), checkinId);

      const rows = await listCheckins(adminContext(), { memberId: memberA.id });
      expect(rows).toHaveLength(0);
    });

    it("deleteCheckin rejects an unknown check-in", async () => {
      await expect(
        deleteCheckin(adminContext(), "00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("tenant isolation at the service layer", () => {
    it("a gym cannot list another gym's check-ins", async () => {
      await recordCheckin(adminContext(), memberA.id);
      const adminB = await seedUser(owner, "admin-b@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      const gymBCheckins = await listCheckins({ userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });
      expect(gymBCheckins).toHaveLength(0);
    });
  });

  describe("Phase 8 — gymAttendanceTrend", () => {
    it("returns one point per period with exact hand-computed totals/unique-visitor counts", async () => {
      const memberC = await seedMember(owner, {
        gymId: gymA.id,
        name: "Other",
        phone: "20777777",
        phoneNormalized: "20777777",
      });
      await seedCheckin(owner, {
        gymId: gymA.id,
        memberId: memberA.id,
        checkedInAt: new Date("2026-03-05"),
        recordedByUserId: adminA.id,
      });
      await seedCheckin(owner, {
        gymId: gymA.id,
        memberId: memberA.id,
        checkedInAt: new Date("2026-03-10"),
        recordedByUserId: adminA.id,
      });
      await seedCheckin(owner, {
        gymId: gymA.id,
        memberId: memberC.id,
        checkedInAt: new Date("2026-04-01"),
        recordedByUserId: adminA.id,
      });

      const periods = [
        { start: new Date("2026-03-01"), end: new Date("2026-03-31T23:59:59.999") },
        { start: new Date("2026-04-01"), end: new Date("2026-04-30T23:59:59.999") },
        { start: new Date("2026-05-01"), end: new Date("2026-05-31T23:59:59.999") },
      ];
      const trend = await gymAttendanceTrend(adminContext(), periods);
      expect(trend).toHaveLength(3);
      expect(trend[0]).toMatchObject({ totalCheckins: 2, uniqueVisitors: 1 });
      expect(trend[1]).toMatchObject({ totalCheckins: 1, uniqueVisitors: 1 });
      expect(trend[2]).toMatchObject({ totalCheckins: 0, uniqueVisitors: 0 });
    });

    it("an empty periods array returns an empty trend", async () => {
      const trend = await gymAttendanceTrend(adminContext(), []);
      expect(trend).toEqual([]);
    });

    it("a gym cannot see another gym's attendance trend", async () => {
      await recordCheckin(adminContext(), memberA.id);
      const adminB = await seedUser(owner, "admin-b@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      const now = new Date();
      const trend = await gymAttendanceTrend(
        { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" },
        [{ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }],
      );
      expect(trend[0].totalCheckins).toBe(0);
    });
  });
});
