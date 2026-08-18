import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
import { resolveIdentity } from "@/lib/server/services/identity";

/**
 * Exercises the application layer (Prisma, via lib/server/db.ts and
 * lib/server/services/identity.ts) against the same ephemeral database the
 * raw-SQL isolation suite uses — complements those tests rather than
 * duplicating them. See docs/implementation-plan.md Phase 1.
 */
describe("application-layer auth/tenant context", () => {
  let owner: Pool;
  let gymA: SeededGym;
  let gymB: SeededGym;
  let adminA: SeededUser;

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
    await seedMembership(owner, {
      userId: adminA.id,
      gymId: gymA.id,
      role: "GYM_ADMIN",
    });
  });

  it("resolveIdentity resolves the correct gymId/role for a provisioned user", async () => {
    const identity = await resolveIdentity(adminA.id);
    expect(identity).toEqual({
      status: "ok",
      userId: adminA.id,
      gymId: gymA.id,
      role: "GYM_ADMIN",
    });
  });

  it("resolveIdentity reports no_membership for a user with no membership row", async () => {
    const orphan = await seedUser(owner, "orphan@test.local");
    const identity = await resolveIdentity(orphan.id);
    expect(identity).toEqual({ status: "no_membership" });
  });

  it("resolveIdentity reports account_disabled for a disabled membership", async () => {
    const staff = await seedUser(owner, "disabled-staff@test.local");
    await seedMembership(owner, {
      userId: staff.id,
      gymId: gymA.id,
      role: "GYM_STAFF",
      disabledAt: new Date(),
    });
    const identity = await resolveIdentity(staff.id);
    expect(identity).toEqual({ status: "account_disabled" });
  });

  it("resolveIdentity reports gym_suspended for a membership in a suspended gym", async () => {
    const suspendedGym = await seedGym(owner, "Suspended Gym", "SUSPENDED");
    const admin = await seedUser(owner, "admin-suspended@test.local");
    await seedMembership(owner, {
      userId: admin.id,
      gymId: suspendedGym.id,
      role: "GYM_ADMIN",
    });
    const identity = await resolveIdentity(admin.id);
    expect(identity).toEqual({ status: "gym_suspended" });
  });

  it("resolveIdentity ignores gym status for a Platform Admin (no gymId to check)", async () => {
    const platformAdmin = await seedUser(owner, "pa-ok@test.local");
    await seedMembership(owner, {
      userId: platformAdmin.id,
      gymId: null,
      role: "PLATFORM_ADMIN",
    });
    const identity = await resolveIdentity(platformAdmin.id);
    expect(identity).toEqual({
      status: "ok",
      userId: platformAdmin.id,
      gymId: null,
      role: "PLATFORM_ADMIN",
    });
  });

  it("withTenant-scoped Prisma queries only see the caller's own gym", async () => {
    const visibleGyms = await withTenant(
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (tx) => tx.gym.findMany(),
    );
    expect(visibleGyms.map((g) => g.id)).toEqual([gymA.id]);
  });

  it("withTenant-scoped Prisma queries cannot read another gym by id", async () => {
    const result = await withTenant(
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (tx) => tx.gym.findUnique({ where: { id: gymB.id } }),
    );
    expect(result).toBeNull();
  });

  it("withPlatform-scoped Prisma queries see every gym", async () => {
    const platformAdmin = await seedUser(owner, "platform-admin@test.local");
    await seedMembership(owner, {
      userId: platformAdmin.id,
      gymId: null,
      role: "PLATFORM_ADMIN",
    });

    const allGyms = await withPlatform((tx) => tx.gym.findMany());
    expect(allGyms.map((g) => g.id).sort()).toEqual(
      [gymA.id, gymB.id].sort(),
    );
  });
});
