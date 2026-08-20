import "server-only";
import { withTenant, type TenantContext } from "@/lib/server/db";
import { NotFoundError, ValidationError } from "@/lib/server/errors";
import {
  effectiveExpenseAmount,
  expensesForPeriod,
  type ExpenseAdjustmentForCalc,
} from "@/lib/server/services/metrics";

/**
 * Gym-Admin-only expense recording (product-spec.md §11.7, §13 Rule 11) —
 * callers (Server Actions) call requireGym(gymId) + requireRole("GYM_ADMIN")
 * first; this module does not re-check the caller's role itself. Unlike
 * Payments, there is no Gym-Staff branch anywhere here — Gym Staff has zero
 * access to expense data, at the service layer and (independently) at RLS.
 *
 * Append-only, exactly like lib/server/services/payments.ts: an Expense,
 * once saved, can never be updated or deleted — corrections are always a
 * new ExpenseAdjustment row referencing the original (product-spec.md §13
 * Rule 11 explicitly groups payments and expenses under this regime). A
 * full void is a negative adjustment equal to the current effective
 * amount — there is deliberately no separate void operation, mirroring
 * adjustPayment() exactly. There is also deliberately no update/delete
 * function anywhere in this module — not omitted by convention, but
 * because no such database operation is even possible for app_user to
 * perform (see the Phase 7 migration's grants).
 */

export const EXPENSE_CATEGORIES = [
  "rent",
  "utilities",
  "salaries",
  "equipment",
  "marketing",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type ExpenseAdjustmentSummary = {
  id: string;
  amountMillimes: number;
  reason: string | null;
  recordedByEmail: string;
  createdAt: Date;
};

export type ExpenseSummary = {
  id: string;
  category: string;
  amountMillimes: number;
  effectiveAmountMillimes: number;
  expenseDate: Date;
  note: string | null;
  recordedByEmail: string;
  createdAt: Date;
  adjustments: ExpenseAdjustmentSummary[];
};

const EXPENSE_SELECT = {
  id: true,
  category: true,
  amountMillimes: true,
  expenseDate: true,
  note: true,
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

type ExpenseRow = {
  id: string;
  category: string;
  amountMillimes: number;
  expenseDate: Date;
  note: string | null;
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

function toSummary(row: ExpenseRow): ExpenseSummary {
  return {
    id: row.id,
    category: row.category,
    amountMillimes: row.amountMillimes,
    effectiveAmountMillimes: effectiveExpenseAmount(row),
    expenseDate: row.expenseDate,
    note: row.note,
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

export async function listExpenses(
  context: TenantContext,
  opts?: { periodStart?: Date; periodEnd?: Date },
): Promise<ExpenseSummary[]> {
  const rows = await withTenant(context, (tx) =>
    tx.expense.findMany({
      where: {
        gymId: context.gymId,
        ...(opts?.periodStart || opts?.periodEnd
          ? {
              expenseDate: {
                ...(opts?.periodStart ? { gte: opts.periodStart } : {}),
                ...(opts?.periodEnd ? { lte: opts.periodEnd } : {}),
              },
            }
          : {}),
      },
      select: EXPENSE_SELECT,
      orderBy: { expenseDate: "desc" },
    }),
  );
  return rows.map(toSummary);
}

export type RecordExpenseInput = {
  category: string;
  amountMillimes: number;
  expenseDate: Date;
  note?: string;
};

function isValidCategory(category: string): category is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(category);
}

export async function recordExpense(
  context: TenantContext,
  input: RecordExpenseInput,
): Promise<{ id: string }> {
  if (!isValidCategory(input.category)) {
    throw new ValidationError(`Invalid expense category: ${input.category}`);
  }
  if (!Number.isInteger(input.amountMillimes) || input.amountMillimes <= 0) {
    throw new ValidationError("Expense amount must be a positive integer.");
  }

  return withTenant(context, (tx) =>
    tx.expense.create({
      data: {
        gymId: context.gymId,
        category: input.category,
        amountMillimes: input.amountMillimes,
        expenseDate: input.expenseDate,
        note: input.note?.trim() || null,
        recordedByUserId: context.userId,
      },
      select: { id: true },
    }),
  );
}

export type AdjustExpenseInput = {
  amountMillimes: number;
  reason?: string;
};

/**
 * Gym-Admin-only. Creates a new ExpenseAdjustment row referencing the
 * original — never mutates the Expense itself (product-spec.md §13
 * Rule 11), mirroring lib/server/services/payments.ts#adjustPayment
 * exactly. A full void is a negative adjustment equal to the current
 * effective amount.
 */
export async function adjustExpense(
  context: TenantContext,
  expenseId: string,
  input: AdjustExpenseInput,
): Promise<{ id: string }> {
  if (!Number.isInteger(input.amountMillimes) || input.amountMillimes === 0) {
    throw new ValidationError("Adjustment amount must be a non-zero integer.");
  }

  return withTenant(context, async (tx) => {
    const expense = await tx.expense.findFirst({
      where: { id: expenseId, gymId: context.gymId },
    });
    if (!expense) {
      throw new NotFoundError("Expense not found in this gym.");
    }

    return tx.expenseAdjustment.create({
      data: {
        gymId: context.gymId,
        expenseId,
        amountMillimes: input.amountMillimes,
        reason: input.reason?.trim() || null,
        recordedByUserId: context.userId,
      },
      select: { id: true },
    });
  });
}

/**
 * Rule 9/11: total expenses for a period, across every expense/adjustment
 * in the gym — the direct expense-side counterpart of
 * lib/server/services/payments.ts#gymRevenueForPeriod, same query shape
 * and same composition-over-the-canonical-pure-function pattern (never a
 * second, parallel calculation).
 */
export async function gymExpensesForPeriod(
  context: TenantContext,
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const expenses = await withTenant(context, (tx) =>
    tx.expense.findMany({
      where: { gymId: context.gymId },
      select: {
        amountMillimes: true,
        expenseDate: true,
        adjustments: { select: { amountMillimes: true, createdAt: true } },
      },
    }),
  );
  return expensesForPeriod(
    expenses as {
      amountMillimes: number;
      expenseDate: Date;
      adjustments: ExpenseAdjustmentForCalc[];
    }[],
    periodStart,
    periodEnd,
  );
}

export type MonthlyPeriod = { start: Date; end: Date };
export type ExpensesTrendPoint = MonthlyPeriod & { expensesMillimes: number };

/**
 * Phase 8 Analytics (product-spec.md §11.9): expenses trend — the
 * expense-side counterpart of payments.ts#gymRevenueTrend, same
 * query-once-compose-per-period shape.
 */
export async function gymExpensesTrend(
  context: TenantContext,
  periods: MonthlyPeriod[],
): Promise<ExpensesTrendPoint[]> {
  const expenses = await withTenant(context, (tx) =>
    tx.expense.findMany({
      where: { gymId: context.gymId },
      select: {
        amountMillimes: true,
        expenseDate: true,
        adjustments: { select: { amountMillimes: true, createdAt: true } },
      },
    }),
  );
  const typed = expenses as {
    amountMillimes: number;
    expenseDate: Date;
    adjustments: ExpenseAdjustmentForCalc[];
  }[];
  return periods.map((period) => ({
    ...period,
    expensesMillimes: expensesForPeriod(typed, period.start, period.end),
  }));
}
