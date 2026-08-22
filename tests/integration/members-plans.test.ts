import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  getOwnerPool,
  resetTestData,
  seedGym,
  seedMember,
  seedMembership,
  seedUser,
  type SeededGym,
  type SeededUser,
} from "../helpers/testDb";
import { prisma, withTenant } from "@/lib/server/db";
import {
  archiveMember,
  createMember,
  getMember,
  listMembers,
  reactivateMember,
  updateMember,
} from "@/lib/server/services/members";
import { archivePlan, createPlan, getPlan, listPlans, updatePlan } from "@/lib/server/services/plans";
import { DuplicateMemberError, NotFoundError, ValidationError } from "@/lib/server/errors";

describe("Phase 3 services (members + plans)", () => {
  let owner: Pool;
  let gymA: SeededGym;
  let gymB: SeededGym;
  let adminA: SeededUser;
  let staffA: SeededUser;

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
  });

  const adminContext = () => ({ userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" as const });
  const staffContext = () => ({ userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" as const });

  describe("members", () => {
    it("creates a member as Gym Admin or Gym Staff", async () => {
      const { id } = await createMember(adminContext(), {
        name: "Ali",
        phone: "20 123 456",
        joinDate: new Date("2026-01-01"),
      });
      expect(id).toBeTruthy();

      const staffCreated = await createMember(staffContext(), {
        name: "Sami",
        phone: "20 999 999",
        joinDate: new Date("2026-01-02"),
      });
      expect(staffCreated.id).toBeTruthy();

      const members = await listMembers(adminContext());
      expect(members).toHaveLength(2);
    });

    it("rejects a duplicate phone number, including a reformatted variant", async () => {
      await createMember(adminContext(), {
        name: "Ali",
        phone: "20-123-456",
        joinDate: new Date("2026-01-01"),
      });

      await expect(
        createMember(adminContext(), {
          name: "Ali Again",
          phone: "(20) 123 456", // same digits, different formatting
          joinDate: new Date("2026-02-01"),
        }),
      ).rejects.toThrow(DuplicateMemberError);
    });

    it("matches a duplicate against an archived member too (returning-member edge case)", async () => {
      const archived = await seedMember(owner, {
        gymId: gymA.id,
        name: "Old Member",
        phone: "20 123 456",
        phoneNormalized: "20123456",
        archivedAt: new Date(),
      });

      let caught: unknown;
      try {
        await createMember(adminContext(), {
          name: "Old Member Returning",
          phone: "20123456",
          joinDate: new Date(),
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(DuplicateMemberError);
      expect((caught as DuplicateMemberError).existingMemberId).toBe(archived.id);
    });

    it("allows the same phone number to be used in two different gyms (tenant isolation)", async () => {
      const gymBAdmin = await seedUser(owner, "admin-b-same-phone@test.local");
      await seedMembership(owner, { userId: gymBAdmin.id, gymId: gymB.id, role: "GYM_ADMIN" });

      await createMember(adminContext(), { name: "Ali", phone: "20123456", joinDate: new Date() });
      const { id } = await createMember(
        { userId: gymBAdmin.id, gymId: gymB.id, role: "GYM_ADMIN" },
        { name: "Different Ali", phone: "20123456", joinDate: new Date() },
      );
      expect(id).toBeTruthy();
    });

    it("the database's own unique index rejects a duplicate row even when the app-layer pre-check is bypassed", async () => {
      await withTenant(adminContext(), (tx) =>
        tx.member.create({
          data: {
            gymId: gymA.id,
            name: "Ali",
            phone: "20123456",
            phoneNormalized: "20123456",
            joinDate: new Date(),
          },
        }),
      );

      await expect(
        withTenant(adminContext(), (tx) =>
          tx.member.create({
            data: {
              gymId: gymA.id,
              name: "Ali Duplicate",
              phone: "20123456",
              phoneNormalized: "20123456",
              joinDate: new Date(),
            },
          }),
        ),
      ).rejects.toThrow(/unique constraint/i);
    });

    it("a genuine race (two concurrent creates with the same phone) still results in exactly one row, and the loser sees a DuplicateMemberError", async () => {
      const results = await Promise.allSettled([
        createMember(adminContext(), { name: "Ali", phone: "20123456", joinDate: new Date() }),
        createMember(adminContext(), { name: "Ali Again", phone: "20123456", joinDate: new Date() }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateMemberError);

      const members = await listMembers(adminContext());
      expect(members).toHaveLength(1);
    });

    it("updateMember excludes the member's own row from the duplicate check", async () => {
      const { id } = await createMember(adminContext(), {
        name: "Ali",
        phone: "20123456",
        joinDate: new Date(),
      });

      await expect(
        updateMember(adminContext(), id, {
          name: "Ali Updated",
          phone: "20123456",
          joinDate: new Date(),
        }),
      ).resolves.toBeUndefined();
    });

    it("archives and reactivates a member (soft-delete only)", async () => {
      const { id } = await createMember(adminContext(), {
        name: "Ali",
        phone: "20123456",
        joinDate: new Date(),
      });

      await archiveMember(staffContext(), id);
      let members = await listMembers(adminContext());
      expect(members.find((m) => m.id === id)?.archivedAt).not.toBeNull();

      await reactivateMember(staffContext(), id);
      members = await listMembers(adminContext());
      expect(members.find((m) => m.id === id)?.archivedAt).toBeNull();
    });

    it("archiving a member in another gym fails (NotFoundError, app-layer scoping)", async () => {
      const gymBAdmin = await seedUser(owner, "admin-b@test.local");
      await seedMembership(owner, { userId: gymBAdmin.id, gymId: gymB.id, role: "GYM_ADMIN" });
      const { id } = await createMember(adminContext(), {
        name: "Ali",
        phone: "20123456",
        joinDate: new Date(),
      });

      await expect(
        archiveMember({ userId: gymBAdmin.id, gymId: gymB.id, role: "GYM_ADMIN" }, id),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects reactivating a member from another gym (NotFoundError, app-layer scoping)", async () => {
      const gymBAdmin = await seedUser(owner, "admin-b-reactivate@test.local");
      await seedMembership(owner, { userId: gymBAdmin.id, gymId: gymB.id, role: "GYM_ADMIN" });
      const { id } = await createMember(adminContext(), {
        name: "Ali",
        phone: "20123456",
        joinDate: new Date(),
      });
      await archiveMember(adminContext(), id);

      await expect(
        reactivateMember({ userId: gymBAdmin.id, gymId: gymB.id, role: "GYM_ADMIN" }, id),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects reactivating an unknown member id", async () => {
      await expect(
        reactivateMember(adminContext(), "00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects an empty name", async () => {
      await expect(
        createMember(adminContext(), { name: "  ", phone: "20123456", joinDate: new Date() }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects an invalid phone number (empty after normalization)", async () => {
      await expect(
        createMember(adminContext(), { name: "Ali", phone: "abc", joinDate: new Date() }),
      ).rejects.toThrow(ValidationError);
    });
  });

  // Product-completion audit, P0 #2: Member Detail/Profile page relies on
  // getMember() to resolve the record it's rendering.
  describe("getMember", () => {
    it("returns a member's full record for a Gym Admin or Gym Staff in their own gym", async () => {
      const { id } = await createMember(adminContext(), {
        name: "Ali",
        phone: "20123456",
        joinDate: new Date("2026-01-01"),
        emergencyContactName: "Mona",
        emergencyContactPhone: "20999999",
      });

      const asAdmin = await getMember(adminContext(), id);
      expect(asAdmin?.name).toBe("Ali");
      expect(asAdmin?.emergencyContactName).toBe("Mona");

      const asStaff = await getMember(staffContext(), id);
      expect(asStaff?.id).toBe(id);
    });

    it("returns null for a member that doesn't exist", async () => {
      const result = await getMember(adminContext(), "00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });

    it("returns null for a member in another gym (tenant isolation)", async () => {
      const gymBAdmin = await seedUser(owner, "admin-b-getmember@test.local");
      await seedMembership(owner, { userId: gymBAdmin.id, gymId: gymB.id, role: "GYM_ADMIN" });
      const { id } = await createMember(
        { userId: gymBAdmin.id, gymId: gymB.id, role: "GYM_ADMIN" },
        { name: "Sami", phone: "20111222", joinDate: new Date() },
      );

      const result = await getMember(adminContext(), id);
      expect(result).toBeNull();
    });

    it("still returns an archived member's record (the detail page must be able to show/reactivate them)", async () => {
      const { id } = await createMember(adminContext(), {
        name: "Old Timer",
        phone: "20555666",
        joinDate: new Date("2020-01-01"),
      });
      await archiveMember(adminContext(), id);

      const result = await getMember(adminContext(), id);
      expect(result?.archivedAt).not.toBeNull();
    });
  });

  // Product-completion audit, P0 #1: server-side search by name or phone.
  describe("listMembers — search (q)", () => {
    beforeEach(async () => {
      await createMember(adminContext(), {
        name: "Ahmed Ben Ali",
        phone: "20 111 222",
        joinDate: new Date("2026-01-01"),
      });
      await createMember(adminContext(), {
        name: "Sami Trabelsi",
        phone: "22 333 444",
        joinDate: new Date("2026-01-02"),
      });
    });

    it("matches a partial, case-insensitive name", async () => {
      const results = await listMembers(adminContext(), { q: "ahmed" });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Ahmed Ben Ali");
    });

    it("matches a partial phone number regardless of formatting", async () => {
      const results = await listMembers(adminContext(), { q: "22-333" });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Sami Trabelsi");
    });

    it("a query with no digits never matches by an empty phone filter", async () => {
      // "Ben" has no digits — normalizePhone("Ben") === "", which must not
      // silently become a contains-everything phone filter.
      const results = await listMembers(adminContext(), { q: "Ben" });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Ahmed Ben Ali");
    });

    it("returns an empty list, not an error, when nothing matches", async () => {
      const results = await listMembers(adminContext(), { q: "nonexistent-member-xyz" });
      expect(results).toHaveLength(0);
    });

    it("an empty/whitespace query behaves like no search at all", async () => {
      const results = await listMembers(adminContext(), { q: "   " });
      expect(results).toHaveLength(2);
    });

    it("search still finds archived members (archive/reactivate stays reachable via search)", async () => {
      const { id } = await createMember(adminContext(), {
        name: "Old Timer",
        phone: "20 555 666",
        joinDate: new Date("2020-01-01"),
      });
      await archiveMember(adminContext(), id);

      const results = await listMembers(adminContext(), { q: "Old Timer" });
      expect(results).toHaveLength(1);
      expect(results[0].archivedAt).not.toBeNull();
    });

    it("Gym Staff can search too (same as the unfiltered list)", async () => {
      const results = await listMembers(staffContext(), { q: "Sami" });
      expect(results).toHaveLength(1);
    });

    it("a gym cannot search into another gym's members (tenant isolation)", async () => {
      const gymBAdmin = await seedUser(owner, "admin-b-search@test.local");
      await seedMembership(owner, { userId: gymBAdmin.id, gymId: gymB.id, role: "GYM_ADMIN" });
      await createMember({ userId: gymBAdmin.id, gymId: gymB.id, role: "GYM_ADMIN" }, {
        name: "Ahmed In Gym B",
        phone: "29 000 000",
        joinDate: new Date(),
      });

      const results = await listMembers(adminContext(), { q: "Ahmed" });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Ahmed Ben Ali");
    });
  });

  describe("plans", () => {
    it("Gym Admin creates and lists plans, including zero-price", async () => {
      await createPlan(adminContext(), { name: "Trial", priceMillimes: 0, durationDays: 7 });
      await createPlan(adminContext(), { name: "Monthly", priceMillimes: 50000, durationDays: 30 });

      const plans = await listPlans(adminContext());
      expect(plans).toHaveLength(2);
      expect(plans.find((p) => p.name === "Trial")?.priceMillimes).toBe(0);
    });

    it("archives a plan and it remains listed (not hard-deleted)", async () => {
      const { id } = await createPlan(adminContext(), {
        name: "Monthly",
        priceMillimes: 50000,
        durationDays: 30,
      });
      await archivePlan(adminContext(), id);

      const plans = await listPlans(adminContext());
      const archived = plans.find((p) => p.id === id);
      expect(archived).toBeDefined();
      expect(archived?.archivedAt).not.toBeNull();
    });

    it("rejects a negative price", async () => {
      await expect(
        createPlan(adminContext(), { name: "Bad", priceMillimes: -1, durationDays: 30 }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects a non-positive duration", async () => {
      await expect(
        createPlan(adminContext(), { name: "Bad", priceMillimes: 50000, durationDays: 0 }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects archiving an already-archived plan", async () => {
      const { id } = await createPlan(adminContext(), {
        name: "Monthly",
        priceMillimes: 50000,
        durationDays: 30,
      });
      await archivePlan(adminContext(), id);

      await expect(archivePlan(adminContext(), id)).rejects.toThrow(NotFoundError);
    });

    it("rejects archiving a plan from another gym (app-layer scoping)", async () => {
      const gymBAdmin = await seedUser(owner, "admin-b-archive-plan@test.local");
      await seedMembership(owner, { userId: gymBAdmin.id, gymId: gymB.id, role: "GYM_ADMIN" });
      const { id } = await createPlan(adminContext(), {
        name: "Monthly",
        priceMillimes: 50000,
        durationDays: 30,
      });

      await expect(
        archivePlan({ userId: gymBAdmin.id, gymId: gymB.id, role: "GYM_ADMIN" }, id),
      ).rejects.toThrow(NotFoundError);

      const plans = await listPlans(adminContext());
      expect(plans.find((p) => p.id === id)?.archivedAt).toBeNull();
    });

    it("a gym cannot list another gym's plans at the service layer (tenant isolation)", async () => {
      const gymBAdmin = await seedUser(owner, "admin-b-list-plans@test.local");
      await seedMembership(owner, { userId: gymBAdmin.id, gymId: gymB.id, role: "GYM_ADMIN" });
      await createPlan(adminContext(), { name: "Gym A Plan", priceMillimes: 50000, durationDays: 30 });

      const gymBPlans = await listPlans({ userId: gymBAdmin.id, gymId: gymB.id, role: "GYM_ADMIN" });
      expect(gymBPlans).toHaveLength(0);
    });

    describe("updatePlan", () => {
      it("updates name, price, and duration", async () => {
        const { id } = await createPlan(adminContext(), {
          name: "Monthly",
          priceMillimes: 50000,
          durationDays: 30,
        });

        await updatePlan(adminContext(), id, {
          name: "Monthly (updated)",
          priceMillimes: 60000,
          durationDays: 31,
        });

        const plan = await getPlan(adminContext(), id);
        expect(plan?.name).toBe("Monthly (updated)");
        expect(plan?.priceMillimes).toBe(60000);
        expect(plan?.durationDays).toBe(31);
      });

      it("rejects an empty name", async () => {
        const { id } = await createPlan(adminContext(), {
          name: "Monthly",
          priceMillimes: 50000,
          durationDays: 30,
        });

        await expect(
          updatePlan(adminContext(), id, { name: "  ", priceMillimes: 50000, durationDays: 30 }),
        ).rejects.toThrow(ValidationError);
      });

      it("rejects a negative price", async () => {
        const { id } = await createPlan(adminContext(), {
          name: "Monthly",
          priceMillimes: 50000,
          durationDays: 30,
        });

        await expect(
          updatePlan(adminContext(), id, { name: "Monthly", priceMillimes: -1, durationDays: 30 }),
        ).rejects.toThrow(ValidationError);
      });

      it("rejects a non-positive duration", async () => {
        const { id } = await createPlan(adminContext(), {
          name: "Monthly",
          priceMillimes: 50000,
          durationDays: 30,
        });

        await expect(
          updatePlan(adminContext(), id, { name: "Monthly", priceMillimes: 50000, durationDays: 0 }),
        ).rejects.toThrow(ValidationError);
      });

      it("throws NotFoundError for an unknown plan id", async () => {
        await expect(
          updatePlan(adminContext(), "00000000-0000-0000-0000-000000000000", {
            name: "Monthly",
            priceMillimes: 50000,
            durationDays: 30,
          }),
        ).rejects.toThrow(NotFoundError);
      });

      it("rejects updating a plan in another gym (NotFoundError, app-layer scoping)", async () => {
        const gymBAdmin = await seedUser(owner, "admin-b-plans@test.local");
        await seedMembership(owner, { userId: gymBAdmin.id, gymId: gymB.id, role: "GYM_ADMIN" });
        const { id } = await createPlan(adminContext(), {
          name: "Monthly",
          priceMillimes: 50000,
          durationDays: 30,
        });

        await expect(
          updatePlan({ userId: gymBAdmin.id, gymId: gymB.id, role: "GYM_ADMIN" }, id, {
            name: "Hijacked",
            priceMillimes: 1,
            durationDays: 1,
          }),
        ).rejects.toThrow(NotFoundError);

        const plan = await getPlan(adminContext(), id);
        expect(plan?.name).toBe("Monthly");
      });

      it("allows editing an archived plan (matches updateMember/updateTrainer behavior)", async () => {
        const { id } = await createPlan(adminContext(), {
          name: "Old Trial",
          priceMillimes: 0,
          durationDays: 7,
        });
        await archivePlan(adminContext(), id);

        await updatePlan(adminContext(), id, {
          name: "Old Trial (corrected)",
          priceMillimes: 0,
          durationDays: 14,
        });

        const plan = await getPlan(adminContext(), id);
        expect(plan?.name).toBe("Old Trial (corrected)");
        expect(plan?.durationDays).toBe(14);
        expect(plan?.archivedAt).not.toBeNull();
      });
    });
  });
});
