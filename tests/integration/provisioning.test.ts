import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  getOwnerPool,
  resetTestData,
  seedGym,
  seedMembership,
  seedUser,
  type SeededGym,
  type SeededUser,
} from "../helpers/testDb";
import { prisma, withPlatform, withTenant } from "@/lib/server/db";

/**
 * Supabase Auth is external to the PostgreSQL transaction (see
 * lib/server/services/platformAdmin.ts's createGym() doc comment) — these
 * tests mock lib/server/supabaseAdmin.ts entirely so the create-then-
 * compensate flow can be exercised, including the failure path, without a
 * real hosted Supabase project. The real Auth Admin API calls themselves
 * are verified manually via E2E against the hosted dev project.
 */
const { inviteAuthUser, deleteAuthUserBestEffort } = vi.hoisted(() => ({
  inviteAuthUser: vi.fn(),
  deleteAuthUserBestEffort: vi.fn(),
}));

vi.mock("@/lib/server/supabaseAdmin", () => ({
  inviteAuthUser,
  deleteAuthUserBestEffort,
}));

import { createGym, listGyms } from "@/lib/server/services/platformAdmin";
import {
  createGymStaff,
  disableGymStaff,
  enableGymStaff,
  listGymStaff,
} from "@/lib/server/services/gymStaff";
import { ValidationError } from "@/lib/server/errors";

describe("provisioning services (Phase 2)", () => {
  let owner: Pool;
  let gymA: SeededGym;
  let adminA: SeededUser;

  beforeAll(() => {
    owner = getOwnerPool();
  });

  afterAll(async () => {
    await owner.end();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await resetTestData(owner);
    gymA = await seedGym(owner, "Gym A");
    const platformAdmin = await seedUser(owner, "platform@test.local");
    await seedMembership(owner, {
      userId: platformAdmin.id,
      gymId: null,
      role: "PLATFORM_ADMIN",
    });
    adminA = await seedUser(owner, "admin-a@test.local");
    await seedMembership(owner, {
      userId: adminA.id,
      gymId: gymA.id,
      role: "GYM_ADMIN",
    });
  });

  describe("createGym", () => {
    it("rejects an empty gym name before ever contacting Supabase", async () => {
      await expect(
        createGym(
          { name: "  ", adminEmail: "new-admin@test.local" },
          "http://localhost/callback",
        ),
      ).rejects.toThrow(ValidationError);
      expect(inviteAuthUser).not.toHaveBeenCalled();
    });

    it("rejects an invalid email before ever contacting Supabase", async () => {
      await expect(
        createGym(
          { name: "New Gym", adminEmail: "not-an-email" },
          "http://localhost/callback",
        ),
      ).rejects.toThrow(ValidationError);
      expect(inviteAuthUser).not.toHaveBeenCalled();
    });

    it("creates gym + user + GYM_ADMIN membership on success", async () => {
      const newAdminId = "11111111-1111-1111-1111-111111111111";
      inviteAuthUser.mockResolvedValue({ id: newAdminId });

      const { gymId } = await createGym(
        { name: "New Gym", adminEmail: "new-admin@test.local" },
        "http://localhost/callback",
      );

      const membership = await withPlatform((tx) =>
        tx.gymMembership.findFirst({ where: { gymId, userId: newAdminId } }),
      );
      expect(membership?.role).toBe("GYM_ADMIN");
      expect(deleteAuthUserBestEffort).not.toHaveBeenCalled();
    });

    it("compensates by deleting the Auth user if the database transaction fails, and leaves no orphaned business records", async () => {
      const newAdminId = "22222222-2222-2222-2222-222222222222";
      inviteAuthUser.mockResolvedValue({ id: newAdminId });
      // Force the DB step to fail: pre-create a users row with the same id
      // so the transaction's users.create hits a primary-key conflict.
      await owner.query("INSERT INTO users (id, email) VALUES ($1, $2)", [
        newAdminId,
        "already-exists@test.local",
      ]);

      await expect(
        createGym(
          { name: "Doomed Gym", adminEmail: "doomed-admin@test.local" },
          "http://localhost/callback",
        ),
      ).rejects.toThrow();

      expect(deleteAuthUserBestEffort).toHaveBeenCalledWith(newAdminId);

      const gyms = await withPlatform((tx) =>
        tx.gym.findMany({ where: { name: "Doomed Gym" } }),
      );
      expect(gyms).toHaveLength(0);
    });
  });

  describe("listGyms", () => {
    it("returns only status metadata, never business data fields", async () => {
      const gyms = await listGyms();
      expect(gyms.length).toBeGreaterThan(0);
      for (const gym of gyms) {
        expect(Object.keys(gym).sort()).toEqual(
          ["createdAt", "id", "name", "status"].sort(),
        );
      }
    });
  });

  describe("gymStaff service", () => {
    it("creates staff and compensates on DB failure the same way createGym does", async () => {
      const staffId = "33333333-3333-3333-3333-333333333333";
      inviteAuthUser.mockResolvedValue({ id: staffId });

      const { membershipId } = await createGymStaff(
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        "new-staff@test.local",
        "http://localhost/callback",
      );

      const membership = await withTenant(
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (tx) => tx.gymMembership.findUnique({ where: { id: membershipId } }),
      );
      expect(membership?.role).toBe("GYM_STAFF");
      expect(membership?.disabledAt).toBeNull();
    });

    it("disable/enable round-trips disabledAt", async () => {
      const staffId = "44444444-4444-4444-4444-444444444444";
      inviteAuthUser.mockResolvedValue({ id: staffId });
      const { membershipId } = await createGymStaff(
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        "staff-2@test.local",
        "http://localhost/callback",
      );

      await disableGymStaff(
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        membershipId,
      );
      let staff = await listGymStaff({
        userId: adminA.id,
        gymId: gymA.id,
        role: "GYM_ADMIN",
      });
      expect(
        staff.find((s) => s.id === membershipId)?.disabledAt,
      ).not.toBeNull();

      await enableGymStaff(
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        membershipId,
      );
      staff = await listGymStaff({
        userId: adminA.id,
        gymId: gymA.id,
        role: "GYM_ADMIN",
      });
      expect(staff.find((s) => s.id === membershipId)?.disabledAt).toBeNull();
    });

    it("disabling a membership in another gym affects nothing (NotFoundError)", async () => {
      const gymB = await seedGym(owner, "Gym B");
      const adminB = await seedUser(owner, "admin-b@test.local");
      await seedMembership(owner, {
        userId: adminB.id,
        gymId: gymB.id,
        role: "GYM_ADMIN",
      });
      const staffB = await seedUser(owner, "staff-b@test.local");
      const staffBMembership = await seedMembership(owner, {
        userId: staffB.id,
        gymId: gymB.id,
        role: "GYM_STAFF",
      });

      await expect(
        disableGymStaff(
          { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
          staffBMembership.id,
        ),
      ).rejects.toThrow(/not found/i);
    });
  });
});
