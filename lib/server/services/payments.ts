import "server-only";
import { withTenant, type TenantContext } from "@/lib/server/db";
import { NotFoundError, ValidationError } from "@/lib/server/errors";
import {
  effectivePaymentAmount,
  outstandingBalance,
  revenueForPeriod,
  type AdjustmentForCalc,
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

export async function listPayments(
  context: TenantContext,
  opts?: { membershipId?: string },
): Promise<PaymentSummary[]> {
  const rows = await withTenant(context, (tx) =>
    tx.payment.findMany({
      where: {
        gymId: context.gymId,
        ...(opts?.membershipId ? { membershipId: opts.membershipId } : {}),
      },
      select: PAYMENT_SELECT,
      orderBy: { paidAt: "desc" },
    }),
  );
  return rows.map(toSummary);
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
