import "server-only";
import { withUser, withTenant } from "@/lib/server/db";

export type ResolvedIdentity = {
  status: "ok";
  userId: string;
  gymId: string | null;
  role: "PLATFORM_ADMIN" | "GYM_ADMIN" | "GYM_STAFF";
};

/**
 * Every non-"ok" outcome is a hard block, never a partial/degraded session
 * (docs/architecture.md §4, §7). Distinguished so callers (login, and
 * lib/server/auth.ts's getSessionContext()) can surface the specific,
 * non-technical message spec §19 requires instead of a generic error.
 */
export type IdentityResolution =
  | ResolvedIdentity
  | { status: "no_membership" }
  | { status: "gym_suspended" }
  | { status: "account_disabled" };

/**
 * Resolves a verified Supabase user id to their gym/role context by querying
 * gym_memberships under app.current_user_id — the bootstrap RLS policy
 * (docs/architecture.md §5.3b). This is the only module lib/server/auth.ts
 * calls into.
 *
 * A user could theoretically hold more than one membership (docs/architecture.md
 * §3), though the product does not build a multi-gym switcher in MVP. If a
 * gymId is requested (e.g. from a URL param), a matching membership is
 * preferred — but the requested gymId is never trusted directly, only used
 * to pick among the user's own verified memberships.
 *
 * Phase 2 additions: a disabled membership (gym_memberships.disabled_at) or
 * a suspended gym both block the session here, at the single point every
 * caller (login, and every later request via getSessionContext()) goes
 * through — see docs/decisions.md.
 */
export async function resolveIdentity(
  userId: string,
  requestedGymId?: string,
): Promise<IdentityResolution> {
  const membership = await withUser(userId, async (tx) => {
    const memberships = await tx.gymMembership.findMany({
      where: { userId },
    });

    if (memberships.length === 0) {
      return null;
    }

    return (
      (requestedGymId &&
        memberships.find((m) => m.gymId === requestedGymId)) ||
      memberships[0]
    );
  });

  if (!membership) {
    return { status: "no_membership" };
  }

  if (membership.disabledAt) {
    return { status: "account_disabled" };
  }

  if (membership.gymId === null) {
    // Platform Admin: no gym to check the status of.
    return {
      status: "ok",
      userId: membership.userId,
      gymId: null,
      role: membership.role,
    };
  }

  // gymId and role are now both known — safe to open a tenant-scoped
  // transaction (RLS's gyms_select policy requires app.current_gym_id to be
  // set to read a non-platform-admin's own gym row).
  const gym = await withTenant(
    { userId: membership.userId, gymId: membership.gymId, role: membership.role },
    (tx) =>
      tx.gym.findUnique({
        where: { id: membership.gymId! },
        select: { status: true },
      }),
  );

  if (!gym) {
    throw new Error(
      "Invariant violated: gym_memberships.gym_id references a missing gym.",
    );
  }

  if (gym.status === "SUSPENDED") {
    return { status: "gym_suspended" };
  }

  return {
    status: "ok",
    userId: membership.userId,
    gymId: membership.gymId,
    role: membership.role,
  };
}
