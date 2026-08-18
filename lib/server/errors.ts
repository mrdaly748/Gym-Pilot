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
