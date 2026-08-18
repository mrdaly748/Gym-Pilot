import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/server/supabase";
import { resolveIdentity } from "@/lib/server/services/identity";
import { AuthenticationError } from "@/lib/server/errors";
import {
  checkGym,
  checkRole,
  type Role,
  type SessionContext,
} from "@/lib/server/authorization";

export type { Role, SessionContext };

/**
 * Resolves the current request's verified session context. Every
 * service-layer function receives this as an argument — none accepts a
 * client-supplied gymId or role (docs/architecture.md §3, §7).
 *
 * Always verifies via supabase.auth.getUser(), never getSession() — see
 * lib/server/supabase.ts. Memoized per request via React's cache() so
 * repeated calls in one request don't repeat the Supabase round-trip + DB
 * lookup.
 */
export const getSessionContext = cache(async (): Promise<SessionContext> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthenticationError();
  }

  const identity = await resolveIdentity(user.id);
  if (identity.status !== "ok") {
    // Every non-"ok" outcome (no membership, disabled account, suspended
    // gym) is a hard authentication failure here — this is the single
    // choke point every layout guard goes through, so it blocks both a
    // fresh login attempt and an already-open session hitting a gym that
    // was suspended (or a staff account that was disabled) after the
    // session started. See lib/server/services/identity.ts and
    // docs/decisions.md.
    throw new AuthenticationError(
      `Authenticated, but session is blocked: ${identity.status}.`,
    );
  }

  return {
    userId: identity.userId,
    email: user.email ?? "",
    gymId: identity.gymId,
    role: identity.role,
  };
});

export async function requireRole(...roles: Role[]): Promise<SessionContext> {
  const session = await getSessionContext();
  checkRole(session, roles);
  return session;
}

export async function requireGym(gymId: string): Promise<SessionContext> {
  const session = await getSessionContext();
  checkGym(session, gymId);
  return session;
}
