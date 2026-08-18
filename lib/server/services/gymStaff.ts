import "server-only";
import { withTenant, type TenantContext } from "@/lib/server/db";
import { inviteAuthUser, deleteAuthUserBestEffort } from "@/lib/server/supabaseAdmin";
import { NotFoundError, ValidationError } from "@/lib/server/errors";
import { isValidEmail } from "@/lib/server/validation";

/**
 * Gym Admin-only staff-login management, scoped to the admin's own gym via
 * TenantContext (docs/architecture.md §5.3). Callers (Server Actions) must
 * call requireGym(gymId) + requireRole("GYM_ADMIN") first — this module
 * does not re-check the caller's role itself.
 */

export type GymStaffSummary = {
  id: string;
  userId: string;
  email: string;
  disabledAt: Date | null;
  createdAt: Date;
};

export async function listGymStaff(
  context: TenantContext,
): Promise<GymStaffSummary[]> {
  return withTenant(context, async (tx) => {
    const memberships = await tx.gymMembership.findMany({
      where: { gymId: context.gymId, role: "GYM_STAFF" },
      orderBy: { createdAt: "desc" },
    });
    if (memberships.length === 0) {
      return [];
    }
    const users = await tx.user.findMany({
      where: { id: { in: memberships.map((m) => m.userId) } },
      select: { id: true, email: true },
    });
    const emailByUserId = new Map(users.map((u) => [u.id, u.email]));
    return memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: emailByUserId.get(m.userId) ?? "",
      disabledAt: m.disabledAt,
      createdAt: m.createdAt,
    }));
  });
}

/**
 * Same non-atomic create-then-compensate pattern as
 * lib/server/services/platformAdmin.ts's createGym() — see that function's
 * doc comment for the full rationale.
 */
export async function createGymStaff(
  context: TenantContext,
  email: string,
  redirectTo: string,
): Promise<{ membershipId: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    throw new ValidationError("A valid staff email is required.");
  }

  const authUser = await inviteAuthUser(normalizedEmail, redirectTo);

  try {
    const membership = await withTenant(context, async (tx) => {
      // createMany, not create: Prisma's create() always does
      // INSERT ... RETURNING, which makes Postgres also evaluate the users
      // SELECT policy on the new row — and a Gym Admin inviting someone new
      // isn't reading their own row, so that RETURNING-triggered check
      // would fail even though the users_insert WITH CHECK explicitly
      // allows this insert. createMany has no RETURNING, so only the
      // INSERT policy applies, matching what's actually being authorized
      // here (see docs/decisions.md — Phase 2 entry).
      await tx.user.createMany({
        data: [{ id: authUser.id, email: normalizedEmail }],
      });
      return tx.gymMembership.create({
        data: {
          userId: authUser.id,
          gymId: context.gymId,
          role: "GYM_STAFF",
        },
        select: { id: true },
      });
    });
    return { membershipId: membership.id };
  } catch (dbError) {
    await deleteAuthUserBestEffort(authUser.id);
    throw dbError;
  }
}

async function setGymStaffDisabled(
  context: TenantContext,
  membershipId: string,
  disabled: boolean,
): Promise<void> {
  const result = await withTenant(context, (tx) =>
    tx.gymMembership.updateMany({
      where: { id: membershipId, gymId: context.gymId, role: "GYM_STAFF" },
      data: { disabledAt: disabled ? new Date() : null },
    }),
  );
  if (result.count === 0) {
    // Either the row doesn't exist, isn't in this gym, or isn't a
    // GYM_STAFF row (e.g. a Gym Admin trying to disable another admin,
    // which is out of Phase 2 scope) — RLS would also reject a cross-gym
    // attempt, but the role/gym filter above gives a clearer error before
    // that even matters.
    throw new NotFoundError("Gym Staff membership not found in this gym.");
  }
}

export async function disableGymStaff(
  context: TenantContext,
  membershipId: string,
): Promise<void> {
  return setGymStaffDisabled(context, membershipId, true);
}

export async function enableGymStaff(
  context: TenantContext,
  membershipId: string,
): Promise<void> {
  return setGymStaffDisabled(context, membershipId, false);
}
