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

/**
 * The single, reusable member-search matching semantics (product-completion
 * audit, P0 #1: search by name or phone) — shared by every list function
 * that offers member lookup (members.ts, memberships.ts) so "what counts as
 * a match" is defined once, not re-decided per caller.
 *
 * Case-insensitive substring match on name, OR a substring match against
 * the same normalized-digits-only phone representation duplicate detection
 * already uses (normalizePhone) — so "20 98" and "2098" find the same
 * members a formatting-variant duplicate check would. A query with no
 * digits at all (e.g. a name) never adds a phone filter, which an empty
 * `contains` would otherwise match against every row.
 */
export function memberSearchWhereClause(q: string): {
  OR: ({ name: { contains: string; mode: "insensitive" } } | { phoneNormalized: { contains: string } })[];
} {
  const phoneDigits = normalizePhone(q);
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" as const } },
      ...(phoneDigits ? [{ phoneNormalized: { contains: phoneDigits } }] : []),
    ],
  };
}
