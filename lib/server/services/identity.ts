import "server-only";
import { withUser } from "@/lib/server/db";

export type ResolvedIdentity = {
  userId: string;
  gymId: string | null;
  role: "PLATFORM_ADMIN" | "GYM_ADMIN" | "GYM_STAFF";
};

/**
 * Resolves a verified Supabase user id to their gym/role context by querying
 * gym_memberships under app.current_user_id — the bootstrap RLS policy
 * (docs/architecture.md §5.3b). This is the only module lib/server/auth.ts
 * calls into.
 *
 * Returns null if the user has no membership row. Not treated as an error
 * here — the caller (lib/server/auth.ts) decides how to respond.
 *
 * A user could theoretically hold more than one membership (docs/architecture.md
 * §3), though the product does not build a multi-gym switcher in MVP. If a
 * gymId is requested (e.g. from a URL param), a matching membership is
 * preferred — but the requested gymId is never trusted directly, only used
 * to pick among the user's own verified memberships.
 */
export async function resolveIdentity(
  userId: string,
  requestedGymId?: string,
): Promise<ResolvedIdentity | null> {
  return withUser(userId, async (tx) => {
    const memberships = await tx.gymMembership.findMany({
      where: { userId },
    });

    if (memberships.length === 0) {
      return null;
    }

    const match =
      (requestedGymId &&
        memberships.find((m) => m.gymId === requestedGymId)) ||
      memberships[0];

    return {
      userId: match.userId,
      gymId: match.gymId,
      role: match.role,
    };
  });
}
