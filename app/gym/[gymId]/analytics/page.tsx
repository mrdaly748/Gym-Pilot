import Link from "next/link";
import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { gymAttendanceTrend } from "@/lib/server/services/attendance";
import { gymExpensesTrend } from "@/lib/server/services/expenses";
import { gymMembershipGrowthTrend } from "@/lib/server/services/memberships";
import { gymPlanPerformance, gymRevenueTrend } from "@/lib/server/services/payments";
import { percentChange } from "@/lib/server/services/metrics";

type MonthlyPeriod = { start: Date; end: Date };

const TREND_MONTHS = 6;

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** The last TREND_MONTHS calendar months, oldest first, ending with the current month. */
function lastMonths(now: Date, count: number): MonthlyPeriod[] {
  const periods: MonthlyPeriod[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) });
  }
  return periods;
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function formatMillimes(millimes: number): string {
  return (millimes / 1000).toFixed(3) + " TND";
}

function formatPercentChange(change: number | null): string {
  if (change === null) {
    return "New";
  }
  const pct = (change * 100).toFixed(1);
  return change > 0 ? `+${pct}%` : `${pct}%`;
}

/** A pure-CSS relative-width bar — no charting dependency of any kind. */
function Bar({ value, max }: { value: number; max: number }) {
  const widthPercent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded bg-gray-100">
      <div
        className="h-2 rounded bg-gray-700"
        style={{ width: `${widthPercent}%` }}
      />
    </div>
  );
}

function TrendTable({
  title,
  periods,
  values,
  format,
}: {
  title: string;
  periods: MonthlyPeriod[];
  values: number[];
  format: (n: number) => string;
}) {
  const max = Math.max(0, ...values);
  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium">{title}</h2>
      <table className="mt-2 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-300">
            <th className="py-2 pr-4">Month</th>
            <th className="py-2 pr-4">Value</th>
            <th className="py-2">Trend</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((period, i) => (
            <tr key={period.start.toISOString()} className="border-b border-gray-100">
              <td className="py-2 pr-4">{formatMonthLabel(period.start)}</td>
              <td className="py-2 pr-4">{format(values[i])}</td>
              <td className="py-2">
                <Bar value={values[i]} max={max} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * Gym-Admin-only (product-spec.md §11.9: "analytics is sensitive
 * financial/business reporting, not part of the Gym Staff operational
 * role"). Unlike the Dashboard, there is no Gym-Staff branch at all here —
 * a Staff session (or an unauthenticated one) is redirected straight back
 * to the gym home page, matching app/gym/[gymId]/staff/page.tsx's exact
 * try/catch/redirect pattern, not rendered with an authorization error.
 */
export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ gymId: string }>;
}) {
  const { gymId } = await params;

  let session;
  try {
    session = await requireGym(gymId);
    await requireRole("GYM_ADMIN");
  } catch {
    redirect(`/gym/${gymId}`);
  }

  const context = { userId: session.userId, gymId, role: session.role };
  const now = new Date();
  const periods = lastMonths(now, TREND_MONTHS);
  const windowStart = periods[0].start;
  const windowEnd = periods[periods.length - 1].end;

  const [revenueTrend, expensesTrend, attendanceTrend, membershipTrend, planPerformance] =
    await Promise.all([
      gymRevenueTrend(context, periods),
      gymExpensesTrend(context, periods),
      gymAttendanceTrend(context, periods),
      gymMembershipGrowthTrend(context, periods),
      gymPlanPerformance(context, windowStart, windowEnd),
    ]);

  // Period-over-period comparison reuses the last two trend points already
  // fetched above — no extra queries.
  const thisMonth = periods.length - 1;
  const lastMonth = periods.length - 2;
  const comparisons = [
    {
      label: "Revenue",
      previous: revenueTrend[lastMonth].revenueMillimes,
      current: revenueTrend[thisMonth].revenueMillimes,
      format: formatMillimes,
    },
    {
      label: "Expenses",
      previous: expensesTrend[lastMonth].expensesMillimes,
      current: expensesTrend[thisMonth].expensesMillimes,
      format: formatMillimes,
    },
    {
      label: "Total check-ins",
      previous: attendanceTrend[lastMonth].totalCheckins,
      current: attendanceTrend[thisMonth].totalCheckins,
      format: (n: number) => String(n),
    },
    {
      label: "Active members",
      previous: membershipTrend[lastMonth].activeMembers,
      current: membershipTrend[thisMonth].activeMembers,
      format: (n: number) => String(n),
    },
  ];

  return (
    <main className="p-8">
      <Link href={`/gym/${gymId}`} className="text-sm underline">
        &larr; Gym
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Analytics</h1>
      <p className="mt-1 text-sm text-gray-600">
        Last {TREND_MONTHS} months ({formatMonthLabel(windowStart)} &ndash;{" "}
        {formatMonthLabel(windowEnd)}).
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-medium">This month vs. last month</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="py-2 pr-4">Metric</th>
              <th className="py-2 pr-4">Last month</th>
              <th className="py-2 pr-4">This month</th>
              <th className="py-2">Change</th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((c) => (
              <tr key={c.label} className="border-b border-gray-100">
                <td className="py-2 pr-4">{c.label}</td>
                <td className="py-2 pr-4">{c.format(c.previous)}</td>
                <td className="py-2 pr-4">{c.format(c.current)}</td>
                <td className="py-2">{formatPercentChange(percentChange(c.previous, c.current))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <TrendTable
        title="Revenue trend"
        periods={periods}
        values={revenueTrend.map((p) => p.revenueMillimes)}
        format={formatMillimes}
      />
      <TrendTable
        title="Expenses trend"
        periods={periods}
        values={expensesTrend.map((p) => p.expensesMillimes)}
        format={formatMillimes}
      />
      <TrendTable
        title="Membership growth (active members at month end)"
        periods={periods}
        values={membershipTrend.map((p) => p.activeMembers)}
        format={(n) => String(n)}
      />
      <TrendTable
        title="Attendance trend (total check-ins)"
        periods={periods}
        values={attendanceTrend.map((p) => p.totalCheckins)}
        format={(n) => String(n)}
      />

      <section className="mt-8">
        <h2 className="text-sm font-medium">Plan performance (last {TREND_MONTHS} months)</h2>
        {planPerformance.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No memberships sold in this period.</p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="py-2 pr-4">Plan</th>
                <th className="py-2 pr-4">Members</th>
                <th className="py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {planPerformance.map((p) => (
                <tr key={p.planName} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{p.planName}</td>
                  <td className="py-2 pr-4">{p.memberCount}</td>
                  <td className="py-2">{formatMillimes(p.revenueMillimes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
