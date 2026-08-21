import "server-only";
import { withTenant, type TenantContext } from "@/lib/server/db";
import { NotFoundError, ValidationError } from "@/lib/server/errors";
import {
  effectivePaymentAmount,
  outstandingBalance,
  planPerformance,
  revenueForPeriod,
  type AdjustmentForCalc,
  type PlanPerformance,
} from "@/lib/server/services/metrics";

/**
 * Gym Admin + Gym Staff payment recording; Gym Admin-only adjustment
 * (product-spec.md §11.4, §13 Rule 11). Callers (Server Actions) call
 * requireGym(gymId) + requireRole(...) first — this module does not
 * re-check the caller's role itself, matching every other service; the
 * database privileges (SELECT+INSERT only, no UPDATE/DELETE grant — see
 * the Phase 5 migration) are the independent backstop that makes mutation
 * of a saved payment or adjustment structurally impossible, not merely
 * absent from this file.
 *
 * There is deliberately no update/delete function anywhere in this module
 * — not omitted by convention, but because no such database operation is
 * even possible for app_user to perform.
 */

export type AdjustmentSummary = {
  id: string;
  amountMillimes: number;
  reason: string | null;
  recordedByEmail: string;
  createdAt: Date;
};

export type PaymentSummary = {
  id: string;
  membershipId: string;
  amountMillimes: number;
  effectiveAmountMillimes: number;
  method: string;
  paidAt: Date;
  recordedByEmail: string;
  createdAt: Date;
  adjustments: AdjustmentSummary[];
};

const PAYMENT_SELECT = {
  id: true,
  membershipId: true,
  amountMillimes: true,
  method: true,
  paidAt: true,
  createdAt: true,
  recordedBy: { select: { email: true } },
  adjustments: {
    select: {
      id: true,
      amountMillimes: true,
      reason: true,
      createdAt: true,
      recordedBy: { select: { email: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

type PaymentRow = {
  id: string;
  membershipId: string;
  amountMillimes: number;
  method: string;
  paidAt: Date;
  createdAt: Date;
  recordedBy: { email: string };
  adjustments: {
    id: string;
    amountMillimes: number;
    reason: string | null;
    createdAt: Date;
    recordedBy: { email: string };
  }[];
};

function toSummary(row: PaymentRow): PaymentSummary {
  return {
    id: row.id,
    membershipId: row.membershipId,
    amountMillimes: row.amountMillimes,
    effectiveAmountMillimes: effectivePaymentAmount(row),
    method: row.method,
    paidAt: row.paidAt,
    recordedByEmail: row.recordedBy.email,
    createdAt: row.createdAt,
    adjustments: row.adjustments.map((a) => ({
      id: a.id,
      amountMillimes: a.amountMillimes,
      reason: a.reason,
      recordedByEmail: a.recordedBy.email,
      createdAt: a.createdAt,
    })),
  };
}

/**
 * `memberId` (Member Detail/Profile, P0 #2) returns every payment across
 * every one of that member's memberships (a member's payment history isn't
 * scoped to one membership the way `membershipId` is) — via a nested
 * relation filter, since Payment itself carries no memberId column.
 */
export async function listPayments(
  context: TenantContext,
  opts?: { membershipId?: string; memberId?: string },
): Promise<PaymentSummary[]> {
  const rows = await withTenant(context, (tx) =>
    tx.payment.findMany({
      where: {
        gymId: context.gymId,
        ...(opts?.membershipId ? { membershipId: opts.membershipId } : {}),
        ...(opts?.memberId ? { membership: { memberId: opts.memberId } } : {}),
      },
      select: PAYMENT_SELECT,
      orderBy: { paidAt: "desc" },
    }),
  );
  return rows.map(toSummary);
}

export const PAYMENTS_PAGE_SIZE = 25;

export type PaginatedPayments = {
  items: PaymentSummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

/**
 * Security audit finding M2: payments are an append-only ledger that grows
 * with every transaction, forever — unlike entity lists (members, trainers,
 * plans), which are naturally bounded by the gym's real-world size. This is
 * the paginated counterpart to listPayments() above, used only by the
 * Payments screen's "All payments" table; listPayments() itself is left
 * unchanged (still used by tests and any future caller that genuinely needs
 * the full unbounded set). `paidAt` alone isn't a unique sort key, so `id`
 * is added as a tiebreaker — without it, two payments recorded in the same
 * instant could be skipped or duplicated across page boundaries.
 */
export async function listPaymentsPage(
  context: TenantContext,
  opts?: { membershipId?: string; page?: number },
): Promise<PaginatedPayments> {
  const pageSize = PAYMENTS_PAGE_SIZE;
  const page = Math.max(1, Math.floor(opts?.page ?? 1));
  const where = {
    gymId: context.gymId,
    ...(opts?.membershipId ? { membershipId: opts.membershipId } : {}),
  };

  return withTenant(context, async (tx) => {
    const [rows, totalCount] = await Promise.all([
      tx.payment.findMany({
        where,
        select: PAYMENT_SELECT,
        orderBy: [{ paidAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      tx.payment.count({ where }),
    ]);

    return {
      items: rows.map(toSummary),
      page,
      pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    };
  });
}

export type RecordPaymentInput = {
  membershipId: string;
  amountMillimes: number;
  method: string;
  paidAt?: Date;
};

export async function recordPayment(
  context: TenantContext,
  input: RecordPaymentInput,
): Promise<{ id: string }> {
  if (!Number.isInteger(input.amountMillimes) || input.amountMillimes <= 0) {
    throw new ValidationError("Payment amount must be a positive whole number of millimes.");
  }
  const method = input.method.trim();
  if (!method) {
    throw new ValidationError("Payment method is required.");
  }

  return withTenant(context, async (tx) => {
    const membership = await tx.membership.findFirst({
      where: { id: input.membershipId, gymId: context.gymId },
    });
    if (!membership) {
      throw new NotFoundError("Membership not found in this gym.");
    }

    return tx.payment.create({
      data: {
        gymId: context.gymId,
        membershipId: input.membershipId,
        amountMillimes: input.amountMillimes,
        method,
        paidAt: input.paidAt ?? new Date(),
        recordedByUserId: context.userId,
      },
      select: { id: true },
    });
  });
}

export type AdjustPaymentInput = {
  amountMillimes: number;
  reason?: string;
};

/**
 * The single append-only correction operation (product-spec.md §13 Rule
 * 11) — Gym Admin-only. A full void is `amountMillimes = -` the payment's
 * current effective amount; a partial correction is any other signed
 * delta. There is no separate "void" function: the UI may still offer
 * distinct "Void" / "Adjust" actions, but both call this one operation.
 */
export async function adjustPayment(
  context: TenantContext,
  paymentId: string,
  input: AdjustPaymentInput,
): Promise<{ id: string }> {
  if (!Number.isInteger(input.amountMillimes) || input.amountMillimes === 0) {
    throw new ValidationError("Adjustment amount must be a non-zero whole number of millimes.");
  }

  return withTenant(context, async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, gymId: context.gymId },
      select: PAYMENT_SELECT,
    });
    if (!payment) {
      throw new NotFoundError("Payment not found in this gym.");
    }

    return tx.paymentAdjustment.create({
      data: {
        gymId: context.gymId,
        paymentId,
        amountMillimes: input.amountMillimes,
        reason: input.reason?.trim() || null,
        recordedByUserId: context.userId,
      },
      select: { id: true },
    });
  });
}

/**
 * Void — recomputes the payment's current effective amount from the
 * database inside this transaction and creates the adjustment needed to
 * bring it to exactly zero. Never accepts a caller-supplied amount: an
 * amount read from a page render (or any other point in time before this
 * call) could be stale relative to a since-applied adjustment, which would
 * make a "void" over- or under-correct instead of exactly zeroing the
 * balance. Same append-only mechanism as adjustPayment() — this is not a
 * second correction path, just a fresh read of "current" instead of a
 * trusted one.
 */
export async function voidPayment(
  context: TenantContext,
  paymentId: string,
): Promise<{ id: string }> {
  return withTenant(context, async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, gymId: context.gymId },
      select: PAYMENT_SELECT,
    });
    if (!payment) {
      throw new NotFoundError("Payment not found in this gym.");
    }

    const effective = effectivePaymentAmount(payment);
    if (effective === 0) {
      throw new ValidationError("Payment is already fully voided.");
    }

    return tx.paymentAdjustment.create({
      data: {
        gymId: context.gymId,
        paymentId,
        amountMillimes: -effective,
        reason: "Voided",
        recordedByUserId: context.userId,
      },
      select: { id: true },
    });
  });
}

/**
 * Rule 5's gym-level "outstanding payments" metric: the sum of outstanding
 * balances across all current (non-cancelled) memberships. Composes
 * metrics.ts's pure outstandingBalance() per membership — never a second,
 * parallel calculation.
 */
export async function gymOutstandingBalance(context: TenantContext): Promise<number> {
  return withTenant(context, async (tx) => {
    const memberships = await tx.membership.findMany({
      where: { gymId: context.gymId, cancelledAt: null },
      select: {
        priceMillimesSnapshot: true,
        payments: {
          select: {
            amountMillimes: true,
            paidAt: true,
            adjustments: { select: { amountMillimes: true, createdAt: true } },
          },
        },
      },
    });
    return memberships.reduce(
      (sum, m) => sum + outstandingBalance(m.priceMillimesSnapshot, m.payments),
      0,
    );
  });
}

export type OutstandingBalanceSummary = {
  membershipId: string;
  memberId: string;
  memberName: string;
  memberPhone: string;
  planNameSnapshot: string;
  balanceMillimes: number;
};

/**
 * Rule 5, per-membership: the same non-cancelled-membership definition
 * gymOutstandingBalance() sums into one gym-wide total, returned here as
 * individual rows instead — "who owes money" (Dashboard, Gym-Admin-only,
 * same gating as the aggregate — this is gym-wide financial data, not a
 * single record). Reuses outstandingBalance() directly; no second
 * calculation. Excludes cancelled memberships (same where clause as
 * gymOutstandingBalance()) and zero/negative balances, sorted largest
 * balance first.
 */
export async function listOutstandingBalances(
  context: TenantContext,
): Promise<OutstandingBalanceSummary[]> {
  const rows = await withTenant(context, (tx) =>
    tx.membership.findMany({
      where: { gymId: context.gymId, cancelledAt: null },
      select: {
        id: true,
        memberId: true,
        planNameSnapshot: true,
        priceMillimesSnapshot: true,
        member: { select: { name: true, phone: true } },
        payments: {
          select: {
            amountMillimes: true,
            paidAt: true,
            adjustments: { select: { amountMillimes: true, createdAt: true } },
          },
        },
      },
    }),
  );

  return rows
    .map((row) => ({
      membershipId: row.id,
      memberId: row.memberId,
      memberName: row.member.name,
      memberPhone: row.member.phone,
      planNameSnapshot: row.planNameSnapshot,
      balanceMillimes: outstandingBalance(row.priceMillimesSnapshot, row.payments),
    }))
    .filter((row) => row.balanceMillimes > 0)
    .sort((a, b) => b.balanceMillimes - a.balanceMillimes);
}

/** Rule 9: cash-basis revenue for a period, across every payment/adjustment in the gym. */
export async function gymRevenueForPeriod(
  context: TenantContext,
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const payments = await withTenant(context, (tx) =>
    tx.payment.findMany({
      where: { gymId: context.gymId },
      select: {
        amountMillimes: true,
        paidAt: true,
        adjustments: { select: { amountMillimes: true, createdAt: true } },
      },
    }),
  );
  return revenueForPeriod(
    payments as { amountMillimes: number; paidAt: Date; adjustments: AdjustmentForCalc[] }[],
    periodStart,
    periodEnd,
  );
}

export type MonthlyPeriod = { start: Date; end: Date };
export type RevenueTrendPoint = MonthlyPeriod & { revenueMillimes: number };

/**
 * Phase 8 Analytics (product-spec.md §11.9): revenue trend — one point per
 * caller-supplied period (the Analytics page supplies the last 6 monthly
 * boundaries). Queries the gym's payments once, then reuses the same
 * canonical revenueForPeriod() per period — never a second calculation,
 * and never re-queries per period.
 */
export async function gymRevenueTrend(
  context: TenantContext,
  periods: MonthlyPeriod[],
): Promise<RevenueTrendPoint[]> {
  const payments = await withTenant(context, (tx) =>
    tx.payment.findMany({
      where: { gymId: context.gymId },
      select: {
        amountMillimes: true,
        paidAt: true,
        adjustments: { select: { amountMillimes: true, createdAt: true } },
      },
    }),
  );
  const typed = payments as {
    amountMillimes: number;
    paidAt: Date;
    adjustments: AdjustmentForCalc[];
  }[];
  return periods.map((period) => ({
    ...period,
    revenueMillimes: revenueForPeriod(typed, period.start, period.end),
  }));
}

/**
 * Phase 8 Analytics (product-spec.md §11.9): "which plans generate the
 * most members/revenue," scoped to the same last-6-months window as the
 * rest of Analytics (per the approved decision, not mixed with lifetime
 * data). Scoping is by membership startDate — the plan "generated" a
 * member when that membership was sold — but each included membership's
 * full payment history is summed (not further period-filtered), since an
 * installment paid after the window closes is still revenue that
 * membership generated. Groups by planNameSnapshot (never the live plan),
 * per Phase 4's snapshot-integrity principle.
 */
export async function gymPlanPerformance(
  context: TenantContext,
  windowStart: Date,
  windowEnd: Date,
): Promise<PlanPerformance[]> {
  const memberships = await withTenant(context, (tx) =>
    tx.membership.findMany({
      where: { gymId: context.gymId, startDate: { gte: windowStart, lte: windowEnd } },
      select: {
        planNameSnapshot: true,
        payments: {
          select: {
            amountMillimes: true,
            paidAt: true,
            adjustments: { select: { amountMillimes: true, createdAt: true } },
          },
        },
      },
    }),
  );
  return planPerformance(memberships);
}
