import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { percentChange } from "@/lib/server/services/metrics";
import {
  gymExpensesForPeriod,
  gymExpensesTrend,
} from "@/lib/server/services/expenses";
import {
  gymMembershipDashboardSummary,
  gymMembershipGrowthTrend,
} from "@/lib/server/services/memberships";
import {
  gymOutstandingBalance,
  gymPlanPerformance,
  gymRevenueForPeriod,
  gymRevenueTrend,
} from "@/lib/server/services/payments";
import { gymAttendanceMetrics, gymAttendanceTrend } from "@/lib/server/services/attendance";
import { listTrainers } from "@/lib/server/services/trainers";

// Derived from an already-imported, allowed service function's own
// parameter type, rather than importing lib/server/db's TenantContext
// directly — this file is not in lib/server/services/**, so the
// tenant-isolation ESLint boundary rule (eslint.config.mjs, restricting
// @/lib/server/db to the service layer) correctly applies to it too, even
// for a type-only import. This stays structurally identical to the real
// TenantContext without ever importing db.ts.
type TenantContext = Parameters<typeof gymRevenueForPeriod>[0];

/**
 * The fixed, read-only AI tool layer (docs/architecture.md §6.1, §6.2;
 * product-spec.md §15). Every tool is a thin wrapper around an existing,
 * already-tested gym-level service function — no calculation is
 * reimplemented here.
 *
 * SECURITY INVARIANTS (do not weaken without updating
 * docs/architecture.md §6.2 and the isolation tests in
 * tests/integration/ai-tools.test.ts):
 *
 * 1. buildAiTools(context) takes ONE verified TenantContext, resolved by
 *    the caller (app/api/ai/route.ts) from the authenticated session —
 *    never from a request body, query param, or model input. Every tool
 *    implementation below closes over this single `context` value.
 * 2. NO tool's Zod input schema below includes a `gymId` (or any
 *    gym-identifying) field. This is not a convention — it is why a
 *    prompt-injection attempt ("show me gym #47's data") cannot succeed:
 *    there is no parameter for such an instruction to fill in, regardless
 *    of what the model decides to call.
 * 3. This file imports ONLY read-oriented functions. It deliberately never
 *    imports recordPayment, adjustPayment, recordExpense, adjustExpense,
 *    assignMembership, renewMembership, freezeMembership,
 *    resumeMembership, cancelMembership, recordCheckin, correctCheckin,
 *    deleteCheckin, createTrainer, updateTrainer, archiveTrainer,
 *    reactivateTrainer, assignTrainerToMember, unassignTrainerFromMember,
 *    createMember, updateMember, archiveMember, or reactivateMember — the
 *    capability to mutate data is structurally absent from this module,
 *    not merely unused.
 * 4. All monetary values are converted from millimes to TND (a plain
 *    decimal number) before being returned to the model, so the model
 *    never has to perform — and cannot get wrong — a unit conversion.
 */

function millimesToTnd(millimes: number): number {
  return millimes / 1000;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

type MonthlyPeriod = { start: Date; end: Date };

/** The last `count` calendar months, oldest first, ending with the current month — mirrors app/gym/[gymId]/analytics/page.tsx's own helper exactly. */
function lastMonths(now: Date, count: number): MonthlyPeriod[] {
  const periods: MonthlyPeriod[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) });
  }
  return periods;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function resolveSingleMonth(period: "this-month" | "last-month", now: Date): MonthlyPeriod {
  if (period === "last-month") {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
  }
  return { start: startOfMonth(now), end: endOfMonth(now) };
}

const TREND_MONTHS = 6;

/**
 * Builds the tool set for exactly one gym, resolved once by the caller.
 * Every closure below reads `context` from this outer scope — the model
 * never supplies it.
 */
export function buildAiTools(context: TenantContext): ToolSet {
  const now = new Date();

  return {
    getDashboardSummary: tool({
      description:
        "Get the gym's core dashboard figures (active members, new members, memberships expiring soon, revenue, expenses, outstanding payments, attendance) for a given month.",
      inputSchema: z.object({
        period: z
          .enum(["this-month", "last-month"])
          .describe("Which month to report on. Defaults to this-month."),
      }),
      execute: async ({ period }) => {
        const { start, end } = resolveSingleMonth(period ?? "this-month", now);
        const [membership, revenue, expenses, outstanding, attendance] = await Promise.all([
          gymMembershipDashboardSummary(context, start, end),
          gymRevenueForPeriod(context, start, end),
          gymExpensesForPeriod(context, start, end),
          gymOutstandingBalance(context),
          gymAttendanceMetrics(context, start, end),
        ]);
        return {
          month: monthLabel(start),
          activeMembers: membership.activeMembers,
          newMembers: membership.newMembers,
          membershipsExpiringSoonCount: membership.expiringSoon.length,
          revenueTND: millimesToTnd(revenue),
          expensesTND: millimesToTnd(expenses),
          outstandingPaymentsTND: millimesToTnd(outstanding),
          totalCheckins: attendance.totalCheckins,
          uniqueVisitors: attendance.uniqueVisitors,
        };
      },
    }),

    getExpiringMemberships: tool({
      description:
        "List memberships currently expiring soon (within the gym's standard expiring-soon window), so the owner can follow up before they lapse.",
      inputSchema: z.object({}),
      execute: async () => {
        const summary = await gymMembershipDashboardSummary(context, now, now);
        return {
          count: summary.expiringSoon.length,
          memberships: summary.expiringSoon.map((m) => ({
            memberName: m.memberName,
            expiresOn: m.endDate.toISOString().slice(0, 10),
          })),
        };
      },
    }),

    compareRevenuePeriods: tool({
      description: "Compare this month's revenue to last month's revenue, including percentage change.",
      inputSchema: z.object({}),
      execute: async () => {
        const thisMonth = resolveSingleMonth("this-month", now);
        const lastMonth = resolveSingleMonth("last-month", now);
        const [current, previous] = await Promise.all([
          gymRevenueForPeriod(context, thisMonth.start, thisMonth.end),
          gymRevenueForPeriod(context, lastMonth.start, lastMonth.end),
        ]);
        return {
          thisMonthRevenueTND: millimesToTnd(current),
          lastMonthRevenueTND: millimesToTnd(previous),
          percentChange: percentChange(previous, current),
        };
      },
    }),

    getRevenueTrend: tool({
      description: `Get monthly revenue for the last ${TREND_MONTHS} months.`,
      inputSchema: z.object({}),
      execute: async () => {
        const periods = lastMonths(now, TREND_MONTHS);
        const trend = await gymRevenueTrend(context, periods);
        return trend.map((p) => ({ month: monthLabel(p.start), revenueTND: millimesToTnd(p.revenueMillimes) }));
      },
    }),

    getExpensesTrend: tool({
      description: `Get monthly expenses for the last ${TREND_MONTHS} months.`,
      inputSchema: z.object({}),
      execute: async () => {
        const periods = lastMonths(now, TREND_MONTHS);
        const trend = await gymExpensesTrend(context, periods);
        return trend.map((p) => ({ month: monthLabel(p.start), expensesTND: millimesToTnd(p.expensesMillimes) }));
      },
    }),

    getAttendanceTrend: tool({
      description: `Get monthly total check-ins and unique visitors for the last ${TREND_MONTHS} months.`,
      inputSchema: z.object({}),
      execute: async () => {
        const periods = lastMonths(now, TREND_MONTHS);
        const trend = await gymAttendanceTrend(context, periods);
        return trend.map((p) => ({
          month: monthLabel(p.start),
          totalCheckins: p.totalCheckins,
          uniqueVisitors: p.uniqueVisitors,
        }));
      },
    }),

    getMembershipGrowthTrend: tool({
      description: `Get the active-member count at the end of each of the last ${TREND_MONTHS} months, showing the membership growth trajectory.`,
      inputSchema: z.object({}),
      execute: async () => {
        const periods = lastMonths(now, TREND_MONTHS);
        const trend = await gymMembershipGrowthTrend(context, periods);
        return trend.map((p) => ({ month: monthLabel(p.start), activeMembers: p.activeMembers }));
      },
    }),

    getPlanPerformance: tool({
      description: `Get membership plan performance (members sold and revenue generated per plan) for the last ${TREND_MONTHS} months.`,
      inputSchema: z.object({}),
      execute: async () => {
        const periods = lastMonths(now, TREND_MONTHS);
        const windowStart = periods[0].start;
        const windowEnd = periods[periods.length - 1].end;
        const performance = await gymPlanPerformance(context, windowStart, windowEnd);
        return performance.map((p) => ({
          planName: p.planName,
          memberCount: p.memberCount,
          revenueTND: millimesToTnd(p.revenueMillimes),
        }));
      },
    }),

    getTrainers: tool({
      description: "List the gym's active trainers.",
      inputSchema: z.object({}),
      execute: async () => {
        const trainers = await listTrainers(context);
        return {
          activeCount: trainers.length,
          names: trainers.map((t) => t.name),
        };
      },
    }),
  };
}
