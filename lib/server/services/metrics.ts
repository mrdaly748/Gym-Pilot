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

// ---------------------------------------------------------------------------
// Phase 5: payments & financial integrity (product-spec.md §13 Rules 5, 9, 11)
// ---------------------------------------------------------------------------

export type AdjustmentForCalc = {
  amountMillimes: number;
  createdAt: Date;
};

export type PaymentForCalc = {
  amountMillimes: number;
  paidAt: Date;
  adjustments: AdjustmentForCalc[];
};

function isWithinPeriod(date: Date, periodStart: Date, periodEnd: Date): boolean {
  return isSameOrBefore(periodStart, date) && isSameOrBefore(date, periodEnd);
}

/**
 * A payment's effective amount is its recorded amount plus every
 * adjustment's signed delta against it (Rule 11) — never a replacement
 * value, always additive, so the original amount and every correction
 * remain independently visible and summable.
 */
export function effectivePaymentAmount(payment: PaymentForCalc): number {
  return (
    payment.amountMillimes +
    payment.adjustments.reduce((sum, a) => sum + a.amountMillimes, 0)
  );
}

/**
 * Rule 5: outstanding balance for one membership = its (snapshotted) plan
 * price minus the sum of its payments' effective amounts. Deliberately
 * takes the snapshot price as a parameter rather than reading
 * MembershipPlan — the caller must pass `membership.priceMillimesSnapshot`,
 * never the live plan's current price, so a later plan edit can never
 * retroactively change a historical balance (product-spec.md §18).
 */
export function outstandingBalance(
  planPriceMillimesSnapshot: number,
  payments: PaymentForCalc[],
): number {
  const totalEffective = payments.reduce(
    (sum, p) => sum + effectivePaymentAmount(p),
    0,
  );
  return planPriceMillimesSnapshot - totalEffective;
}

/**
 * Rule 9: revenue for a period is cash-basis — the sum of financial events
 * *recorded* within that period, not retroactively reattributed. A
 * payment's amount contributes to the period containing its `paidAt`; an
 * adjustment's delta contributes to the period containing its own
 * `createdAt`, independently — so a correction made in a later period never
 * rewrites an earlier, already-closed period's reported revenue.
 */
export function revenueForPeriod(
  payments: PaymentForCalc[],
  periodStart: Date,
  periodEnd: Date,
): number {
  let total = 0;
  for (const payment of payments) {
    if (isWithinPeriod(payment.paidAt, periodStart, periodEnd)) {
      total += payment.amountMillimes;
    }
    for (const adjustment of payment.adjustments) {
      if (isWithinPeriod(adjustment.createdAt, periodStart, periodEnd)) {
        total += adjustment.amountMillimes;
      }
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Phase 6: attendance (product-spec.md §13 Rule 10)
// ---------------------------------------------------------------------------

export type CheckinForCalc = {
  memberId: string;
  checkedInAt: Date;
};

/** Rule 10a: total check-ins recorded within a period — every row counts. */
export function totalCheckins(
  checkins: CheckinForCalc[],
  periodStart: Date,
  periodEnd: Date,
): number {
  return checkins.filter((c) => isWithinPeriod(c.checkedInAt, periodStart, periodEnd))
    .length;
}

/**
 * Rule 10b: "unique visitors" — the count of distinct members who checked in
 * at least once within a period. A member checking in multiple times in the
 * same period is counted once here (contrast with totalCheckins, which
 * counts every row).
 */
export function uniqueVisitors(
  checkins: CheckinForCalc[],
  periodStart: Date,
  periodEnd: Date,
): number {
  const memberIds = new Set(
    checkins
      .filter((c) => isWithinPeriod(c.checkedInAt, periodStart, periodEnd))
      .map((c) => c.memberId),
  );
  return memberIds.size;
}
