import "server-only";
import { withPlatform } from "@/lib/server/db";
import type { GymStatus } from "@/lib/server/generated/prisma-client/enums";
import { inviteAuthUser, deleteAuthUserBestEffort } from "@/lib/server/supabaseAdmin";
import { ValidationError } from "@/lib/server/errors";
import { isNonEmpty, isValidEmail } from "@/lib/server/validation";

/**
 * Platform Admin-only gym provisioning/lifecycle. Every function here runs
 * under withPlatform() (docs/architecture.md §5.2) — callers (Server
 * Actions) must call requireRole("PLATFORM_ADMIN") first; this module does
 * not re-check the caller's role itself (see lib/server/auth.ts).
 *
 * Deliberately returns only status metadata, never gym business data
 * (docs/implementation-plan.md Phase 2) — there is no business data to
 * return yet (members/payments/etc. don't exist until later phases), and
 * this module must not become the place that later data gets bolted onto.
 */

export type GymSummary = {
  id: string;
  name: string;
  status: GymStatus;
  createdAt: Date;
};

export async function listGyms(): Promise<GymSummary[]> {
  return withPlatform((tx) =>
    tx.gym.findMany({
      select: { id: true, name: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  );
}

export type CreateGymInput = { name: string; adminEmail: string };

/**
 * Provisions a gym and its initial Gym Admin. This is explicitly NOT one
 * atomic cross-system transaction — Supabase Auth is an external system the
 * PostgreSQL transaction cannot span. The two steps below are sequenced
 * deliberately:
 *
 *   1. Invite the Auth user (external, not rollback-able by us).
 *   2. Write gyms/users/gym_memberships in one PostgreSQL transaction.
 *
 * If step 2 fails, step 1's user is deleted on a best-effort basis so a
 * failed gym creation doesn't leave an orphaned, membership-less Auth user
 * a human would otherwise have to notice and clean up manually. If the
 * compensating deletion itself fails, that is logged (never with
 * credentials) and the original database error is still what's thrown to
 * the caller — see lib/server/supabaseAdmin.ts.
 */
export async function createGym(
  input: CreateGymInput,
  redirectTo: string,
): Promise<{ gymId: string }> {
  const name = input.name.trim();
  const adminEmail = input.adminEmail.trim().toLowerCase();

  if (!isNonEmpty(name)) {
    throw new ValidationError("Gym name is required.");
  }
  if (!isValidEmail(adminEmail)) {
    throw new ValidationError("A valid admin email is required.");
  }

  const authUser = await inviteAuthUser(adminEmail, redirectTo);

  try {
    const gym = await withPlatform(async (tx) => {
      const createdGym = await tx.gym.create({
        data: { name },
        select: { id: true },
      });
      // createMany, not create — see lib/server/services/gymStaff.ts's
      // createGymStaff() for why (avoids Prisma's implicit RETURNING,
      // which would trigger a SELECT-policy check this insert doesn't need
      // to satisfy). Not currently reachable here since Platform Admin
      // satisfies both policies either way, but kept consistent.
      await tx.user.createMany({
        data: [{ id: authUser.id, email: adminEmail }],
      });
      await tx.gymMembership.create({
        data: {
          userId: authUser.id,
          gymId: createdGym.id,
          role: "GYM_ADMIN",
        },
      });
      return createdGym;
    });
    return { gymId: gym.id };
  } catch (dbError) {
    await deleteAuthUserBestEffort(authUser.id);
    throw dbError;
  }
}

export async function setGymStatus(
  gymId: string,
  status: GymStatus,
): Promise<void> {
  await withPlatform((tx) => tx.gym.update({ where: { id: gymId }, data: { status } }));
}
