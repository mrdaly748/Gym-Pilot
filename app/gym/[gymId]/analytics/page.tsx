import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { gymAttendanceTrend } from "@/lib/server/services/attendance";
import { gymExpensesTrend } from "@/lib/server/services/expenses";
import { gymMembershipGrowthTrend } from "@/lib/server/services/memberships";
import { gymPlanPerformance, gymRevenueTrend } from "@/lib/server/services/payments";
import { percentChange } from "@/lib/server/services/metrics";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Table, Thead, Th, Td, Tr, EmptyRow } from "@/components/ui/Table";
import { TrendAreaChart, type TrendPoint } from "@/components/charts/TrendAreaChart";
import { BarComparisonChart, type BarPoint } from "@/components/charts/BarComparisonChart";
import { AnalyticsIcon, AttendanceIcon, ExpensesIcon, MembersIcon, PaymentsIcon } from "@/components/ui/icons";

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
  return date.toLocaleDateString(undefined, { month: "short" });
}

function formatMonthYear(date: Date): string {
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
      icon: <PaymentsIcon className="h-4.5 w-4.5" />,
      tone: "success" as const,
    },
    {
      label: "Expenses",
      previous: expensesTrend[lastMonth].expensesMillimes,
      current: expensesTrend[thisMonth].expensesMillimes,
      format: formatMillimes,
      icon: <ExpensesIcon className="h-4.5 w-4.5" />,
      tone: "neutral" as const,
    },
    {
      label: "Total check-ins",
      previous: attendanceTrend[lastMonth].totalCheckins,
      current: attendanceTrend[thisMonth].totalCheckins,
      format: (n: number) => String(n),
      icon: <AttendanceIcon className="h-4.5 w-4.5" />,
      tone: "accent" as const,
    },
    {
      label: "Active members",
      previous: membershipTrend[lastMonth].activeMembers,
      current: membershipTrend[thisMonth].activeMembers,
      format: (n: number) => String(n),
      icon: <MembersIcon className="h-4.5 w-4.5" />,
      tone: "accent" as const,
    },
  ];

  const revenuePoints: TrendPoint[] = revenueTrend.map((p) => ({
    label: formatMonthLabel(p.start),
    value: p.revenueMillimes / 1000,
  }));
  const expensesPoints: TrendPoint[] = expensesTrend.map((p) => ({
    label: formatMonthLabel(p.start),
    value: p.expensesMillimes / 1000,
  }));
  const membershipPoints: TrendPoint[] = membershipTrend.map((p) => ({
    label: formatMonthLabel(p.start),
    value: p.activeMembers,
  }));
  const attendancePoints: TrendPoint[] = attendanceTrend.map((p) => ({
    label: formatMonthLabel(p.start),
    value: p.totalCheckins,
  }));
  const planPoints: BarPoint[] = planPerformance.map((p) => ({
    label: p.planName,
    value: p.revenueMillimes / 1000,
  }));

  return (
    <main className="p-6 md:p-8">
      <PageHeader
        title="Analytics"
        backHref={`/gym/${gymId}`}
        backLabel="Gym"
        description={`Last ${TREND_MONTHS} months (${formatMonthYear(windowStart)} – ${formatMonthYear(windowEnd)}).`}
      />

      <section>
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          This month vs. last month
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {comparisons.map((c) => (
            <StatCard
              key={c.label}
              label={c.label}
              value={c.format(c.current)}
              icon={c.icon}
              tone={c.tone}
            />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-4 text-xs text-text-tertiary sm:grid-cols-4">
          {comparisons.map((c) => (
            <p key={c.label}>
              {formatPercentChange(percentChange(c.previous, c.current))} vs.{" "}
              {c.format(c.previous)}
            </p>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <ChartPanel title="Revenue trend">
          <TrendAreaChart data={revenuePoints} format="tnd" />
        </ChartPanel>
        <ChartPanel title="Expenses trend">
          <TrendAreaChart data={expensesPoints} format="tnd" color="var(--danger)" />
        </ChartPanel>
        <ChartPanel title="Membership growth (active members, month end)">
          <TrendAreaChart data={membershipPoints} format="count" color="var(--accent2)" />
        </ChartPanel>
        <ChartPanel title="Attendance trend (total check-ins)">
          <TrendAreaChart data={attendancePoints} format="count" color="var(--info)" />
        </ChartPanel>
      </div>

      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          Plan performance (last {TREND_MONTHS} months)
        </h2>
        {planPerformance.length === 0 ? (
          <div className="mt-3 rounded-lg border border-border-subtle bg-surface-2 px-4 py-8 text-center text-sm text-text-secondary">
            No memberships sold in this period.
          </div>
        ) : (
          <>
            <div className="mt-3 rounded-lg border border-border-subtle bg-surface-2 p-4">
              <BarComparisonChart data={planPoints} format="tnd" color="var(--accent-cyan)" />
            </div>
            <div className="mt-3">
              <Table>
                <Thead>
                  <tr>
                    <Th>Plan</Th>
                    <Th>Members</Th>
                    <Th>Revenue</Th>
                  </tr>
                </Thead>
                <tbody>
                  {planPerformance.map((p) => (
                    <Tr key={p.planName}>
                      <Td className="font-medium">{p.planName}</Td>
                      <Td className="text-text-secondary">{p.memberCount}</Td>
                      <Td className="text-text-secondary">{formatMillimes(p.revenueMillimes)}</Td>
                    </Tr>
                  ))}
                  {planPerformance.length === 0 && <EmptyRow colSpan={3}>No data.</EmptyRow>}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-2 p-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-text-tertiary uppercase">
        <AnalyticsIcon className="h-3.5 w-3.5" />
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}
