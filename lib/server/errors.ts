/**
 * Typed, explicit errors for the security-critical paths (auth, authorization,
 * tenant context). Callers should check `instanceof`, never string-match
 * `.message`. See docs/architecture.md §4, §7.
 */

export class AuthenticationError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "AuthenticationError";
  }
}

/** Thrown by requireRole()/requireGym() when the caller's role or gym
 * context doesn't permit the attempted action. Always a hard failure — never
 * caught and silently downgraded to a no-op. */
export class AuthorizationError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Bad input from a form/action — distinct from AuthorizationError (a role
 * problem) and NotFoundError (a missing record). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Thrown when a member's normalized phone number matches an existing member
 * in the same gym (including archived ones — product-spec.md §18's
 * "returning member" edge case). Carries enough to let the caller surface
 * the existing record ("view/reactivate?") instead of a generic validation
 * message — see lib/server/services/members.ts.
 */
export class DuplicateMemberError extends Error {
  existingMemberId: string;
  existingMemberName: string;

  constructor(existingMemberId: string, existingMemberName: string) {
    super(`A member with this phone number already exists: ${existingMemberName}`);
    this.name = "DuplicateMemberError";
    this.existingMemberId = existingMemberId;
    this.existingMemberName = existingMemberName;
  }
}
