import { AuthorizationError } from "@/lib/server/errors";

/**
 * Pure role/gym-scope checks — deliberately dependency-free (no Prisma, no
 * Supabase, no "server-only") so they're genuinely unit-testable without a
 * database (tests/unit/authorization.test.ts), unlike lib/server/auth.ts's
 * getSessionContext()/requireRole()/requireGym(), which need a real
 * session and DB lookup. See docs/implementation-plan.md Phase 1.
 */

export type Role = "PLATFORM_ADMIN" | "GYM_ADMIN" | "GYM_STAFF";

export type SessionContext = {
  userId: string;
  email: string;
  gymId: string | null;
  role: Role;
};

/**
 * Throws AuthorizationError (a hard failure, never a silent no-op or a
 * UI-only hide — docs/architecture.md §4) unless `session.role` is one of
 * `roles`.
 */
export function checkRole(session: SessionContext, roles: Role[]): void {
  if (!roles.includes(session.role)) {
    throw new AuthorizationError(
      `Requires one of: ${roles.join(", ")}. Current role: ${session.role}.`,
    );
  }
}

/**
 * Throws AuthorizationError unless the session is scoped to `gymId`. A
 * gymId taken from a URL param must always be validated through this —
 * never trusted directly.
 */
export function checkGym(session: SessionContext, gymId: string): void {
  if (session.gymId !== gymId) {
    throw new AuthorizationError("Not authorized for this gym.");
  }
}
