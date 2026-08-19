/**
 * Canonical, pure business-logic definitions (product-spec.md §13.0's
 * single-source-of-truth requirement). No database access here — every
 * function takes plain data and returns a result, so this is exactly the
 * "same code the dashboard, analytics, and AI tools all call" per the
 * architecture's canonical-metrics principle, and is fully unit-testable
 * without a database (docs/architecture.md §5.5).
 *
 * Deliberately no `"server-only"` import: this module has no secrets and no
 * side effects, and later phases (dashboard Server Components, AI tools)
 * need to call it from wherever they run.
 */

export type MembershipStatus =
  | "ACTIVE"
  | "EXPIRING_SOON"
  | "EXPIRED"
  | "FROZEN"
  | "CANCELLED";

export type FreezePeriod = {
  frozenAt: Date;
  resumedAt: Date | null;
};

export type MembershipForStatus = {
  startDate: Date;
  endDate: Date;
  cancelledAt: Date | null;
  freezes: FreezePeriod[];
};

const DEFAULT_EXPIRING_SOON_WINDOW_DAYS = 7;

function isSameOrBefore(a: Date, b: Date): boolean {
  return a.getTime() <= b.getTime();
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

/** True if any freeze period on this membership has no resumedAt yet. */
export function isCurrentlyFrozen(freezes: FreezePeriod[]): boolean {
  return freezes.some((f) => f.resumedAt === null);
}

/**
 * The canonical membership status (product-spec.md §13 Rules 1–3, 6, 7).
 * Precedence, matching the spec's own framing (each state is distinct, not
 * layered): cancelled > frozen > expired > expiring soon > active. A
 * cancelled or frozen membership is excluded from "active"/"expired"
 * entirely, even if its dates would otherwise say so — both are their own
 * permanent/paused state (Rules 6 and 7).
 */
export function deriveMembershipStatus(
  membership: MembershipForStatus,
  now: Date = new Date(),
  expiringSoonWindowDays: number = DEFAULT_EXPIRING_SOON_WINDOW_DAYS,
): MembershipStatus {
  if (membership.cancelledAt !== null) {
    return "CANCELLED";
  }
  if (isCurrentlyFrozen(membership.freezes)) {
    return "FROZEN";
  }
  if (now.getTime() > membership.endDate.getTime()) {
    return "EXPIRED";
  }
  const daysUntilEnd = daysBetween(now, membership.endDate);
  if (daysUntilEnd <= expiringSoonWindowDays) {
    return "EXPIRING_SOON";
  }
  return "ACTIVE";
}

/** Rule 1: only ACTIVE and EXPIRING_SOON count as "active" for the active-member metric. */
export function isActiveMember(status: MembershipStatus): boolean {
  return status === "ACTIVE" || status === "EXPIRING_SOON";
}

/**
 * Rule 4: a member is "new" for a period if their join date falls within
 * it. Uses Member.joinDate directly (collected at member registration,
 * Phase 3) rather than re-deriving "first-ever membership start" from
 * membership records — the same fact, simpler source, no risk of the two
 * ever disagreeing.
 */
export function isNewMember(
  joinDate: Date,
  periodStart: Date,
  periodEnd: Date,
): boolean {
  return (
    isSameOrBefore(periodStart, joinDate) && isSameOrBefore(joinDate, periodEnd)
  );
}

/**
 * Rule 6: freezing pauses the countdown; resuming pushes the end date back
 * by the number of days frozen. Rounds up (ceil) so a member never loses
 * value from a partial frozen day — a deliberate, gym-friendly rounding
 * choice, not an arbitrary one.
 */
export function frozenDays(frozenAt: Date, resumedAt: Date): number {
  return Math.ceil(daysBetween(frozenAt, resumedAt));
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
