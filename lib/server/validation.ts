/**
 * Pure, dependency-free input checks — unit-testable without a database or
 * "server-only" (unlike lib/server/authorization.ts's role/gym checks,
 * these guard form input, not authorization decisions).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}
