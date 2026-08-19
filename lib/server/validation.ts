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

/**
 * Deterministic duplicate-phone normalization (Phase 3, product-spec.md
 * §11.1/§18): strip everything but digits. Absorbs formatting variance
 * ("+216 20 123 456" vs "20-123-456" vs "20123456") with no fuzzy matching
 * and no phone-parsing library — does not resolve a genuine country-code
 * mismatch, an accepted MVP limitation (see docs/decisions.md).
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}
