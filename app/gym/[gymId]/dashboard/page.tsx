import Link from "next/link";
import { requireGym, requireRole } from "@/lib/server/auth";
import { gymAttendanceMetrics, gymAttendanceTrend } from "@/lib/server/services/attendance";
import { gymExpensesForPeriod } from "@/lib/server/services/expenses";
import { gymMembershipDashboardSummary } from "@/lib/server/services/memberships";
import {
  gymOutstandingBalance,
  gymRevenueForPeriod,
  gymRevenueTrend,
  listOutstandingBalances,
  type OutstandingBalanceSummary,
} from "@/lib/server/services/payments";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Table, Thead, Th, Td, Tr, EmptyRow } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { TrendAreaChart, type TrendPoint } from "@/components/charts/TrendAreaChart";
import {
  AttendanceIcon,
  ClockIcon,
  ExpensesIcon,
  MembersIcon,
  PaymentsIcon,
  UserPlusIcon,
} from "@/components/ui/icons";

type Period = "this-month" | "last-month";

function isPeriod(value: string | undefined): value is Period {
  return value === "this-month" || value === "last-month";
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfToday(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfToday(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

type MonthlyPeriod = { start: Date; end: Date };
const TREND_MONTHS = 6;

/** Same "last N calendar months" window Analytics uses (gymRevenueTrend/gymAttendanceTrend are period-agnostic — this is a UI-side composition choice, not new backend logic). */
function lastMonths(now: Date, count: number): MonthlyPeriod[] {
  const periods: MonthlyPeriod[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) });
  }
  return periods;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short" });
}

/**
 * Validates the ?period= query param and falls back safely to "this-month"
 * for anything missing or unrecognized — never trusts client input as an
 * arbitrary date range (product-spec.md §16: no unvalidated input reaches
 * a tenant-scoped query).
 */
function resolvePeriod(
  requested: string | undefined,
  now: Date,
): { period: Period; start: Date; end: Date } {
  const period: Period = isPeriod(requested) ? requested : "this-month";
  if (period === "last-month") {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { period, start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
  }
  return { period, start: startOfMonth(now), end: endOfMonth(now) };
}

function formatMillimes(millimes: number): string {
  return (millimes / 1000).toFixed(3) + " TND";
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString();
}

/**
 * Gym Admin AND Gym Staff (product-spec.md §11.8) — role-branched below,
 * before any query runs. Gym Staff's branch never calls
 * gymRevenueForPeriod/gymExpensesForPeriod/gymOutstandingBalance/
 * gymRevenueTrend at all — not merely omitted from the rendered output, so
 * there is no code path on this page through which a Staff session's
 * request can even reach the financial tables it has zero RLS access to
 * anyway (defense in depth, per every prior phase's authorization
 * discipline).
 */
export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ gymId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { gymId } = await params;
  const { period: requestedPeriod } = await searchParams;
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  const context = { userId: session.userId, gymId, role: session.role };
  const now = new Date();
  const { period, start, end } = resolvePeriod(requestedPeriod, now);
  const trendPeriods = lastMonths(now, TREND_MONTHS);

  if (session.role === "GYM_STAFF") {
    const [membershipSummary, todayAttendance, attendanceTrend] = await Promise.all([
      gymMembershipDashboardSummary(context, start, end),
      gymAttendanceMetrics(context, startOfToday(now), endOfToday(now)),
      gymAttendanceTrend(context, trendPeriods),
    ]);

    const attendancePoints: TrendPoint[] = attendanceTrend.map((p) => ({
      label: monthLabel(p.start),
      value: p.totalCheckins,
    }));

    return (
      <main className="p-6 md:p-8">
        <PageHeader title="Dashboard" backHref={`/gym/${gymId}`} backLabel="Gym" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          <StatCard
            label="Today's check-ins"
            value={String(todayAttendance.totalCheckins)}
            icon={<AttendanceIcon className="h-4.5 w-4.5" />}
            tone="accent"
          />
          <StatCard
            label="Today's unique visitors"
            value={String(todayAttendance.uniqueVisitors)}
            icon={<MembersIcon className="h-4.5 w-4.5" />}
          />
        </div>

        <section className="mt-8 rounded-lg border border-border-subtle bg-surface-2 p-4">
          <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
            Check-ins — last {TREND_MONTHS} months
          </h2>
          <div className="mt-3">
            <TrendAreaChart data={attendancePoints} format="count" />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
            Memberships expiring soon
          </h2>
          <div className="mt-3">
            <ExpiringList gymId={gymId} items={membershipSummary.expiringSoon} />
          </div>
        </section>
      </main>
    );
  }

  const [membershipSummary, revenue, expenses, outstanding, attendance, revenueTrend, outstandingBalances] =
    await Promise.all([
      gymMembershipDashboardSummary(context, start, end),
      gymRevenueForPeriod(context, start, end),
      gymExpensesForPeriod(context, start, end),
      gymOutstandingBalance(context),
      gymAttendanceMetrics(context, start, end),
      gymRevenueTrend(context, trendPeriods),
      listOutstandingBalances(context),
    ]);

  const revenuePoints: TrendPoint[] = revenueTrend.map((p) => ({
    label: monthLabel(p.start),
    value: p.revenueMillimes / 1000,
  }));

  const periodSwitcher = (
    <nav className="flex gap-1 rounded-lg border border-border-subtle bg-surface-2 p-1 text-sm">
      <Link
        href={`/gym/${gymId}/dashboard?period=this-month`}
        className={`rounded-md px-3 py-1.5 ${
          period === "this-month"
            ? "bg-accent-soft-bg font-medium text-accent"
            : "text-text-secondary hover:text-foreground"
        }`}
      >
        This month
      </Link>
      <Link
        href={`/gym/${gymId}/dashboard?period=last-month`}
        className={`rounded-md px-3 py-1.5 ${
          period === "last-month"
            ? "bg-accent-soft-bg font-medium text-accent"
            : "text-text-secondary hover:text-foreground"
        }`}
      >
        Last month
      </Link>
    </nav>
  );

  return (
    <main className="p-6 md:p-8">
      <PageHeader
        title="Dashboard"
        backHref={`/gym/${gymId}`}
        backLabel="Gym"
        actions={periodSwitcher}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Active members"
          value={String(membershipSummary.activeMembers)}
          icon={<MembersIcon className="h-4.5 w-4.5" />}
          tone="accent"
        />
        <StatCard
          label="New members"
          value={String(membershipSummary.newMembers)}
          icon={<UserPlusIcon className="h-4.5 w-4.5" />}
          tone="success"
        />
        <StatCard
          label="Memberships expiring soon"
          value={String(membershipSummary.expiringSoon.length)}
          icon={<ClockIcon className="h-4.5 w-4.5" />}
          tone="warning"
        />
        <StatCard
          label="Outstanding payments"
          value={formatMillimes(outstanding)}
          icon={<PaymentsIcon className="h-4.5 w-4.5" />}
          tone="warning"
        />
        <StatCard
          label="Revenue"
          value={formatMillimes(revenue)}
          icon={<PaymentsIcon className="h-4.5 w-4.5" />}
          tone="success"
        />
        <StatCard
          label="Total expenses"
          value={formatMillimes(expenses)}
          icon={<ExpensesIcon className="h-4.5 w-4.5" />}
        />
        <StatCard
          label="Total check-ins"
          value={String(attendance.totalCheckins)}
          icon={<AttendanceIcon className="h-4.5 w-4.5" />}
          tone="accent"
        />
        <StatCard label="Unique visitors" value={String(attendance.uniqueVisitors)} icon={<MembersIcon className="h-4.5 w-4.5" />} />
      </div>

      <section className="mt-8 rounded-lg border border-border-subtle bg-surface-2 p-4">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          Revenue — last {TREND_MONTHS} months
        </h2>
        <div className="mt-3">
          <TrendAreaChart data={revenuePoints} format="tnd" />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          Memberships expiring soon
        </h2>
        <div className="mt-3">
          <ExpiringList gymId={gymId} items={membershipSummary.expiringSoon} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          Who owes money
        </h2>
        <div className="mt-3">
          <OutstandingBalancesList gymId={gymId} items={outstandingBalances} />
        </div>
      </section>
    </main>
  );
}

function OutstandingBalancesList({
  gymId,
  items,
}: {
  gymId: string;
  items: OutstandingBalanceSummary[];
}) {
  return (
    <Table>
      <Thead>
        <tr>
          <Th>Member</Th>
          <Th>Plan</Th>
          <Th>Owed</Th>
        </tr>
      </Thead>
      <tbody>
        {items.map((item) => (
          <Tr key={item.membershipId}>
            <Td>
              <Link
                href={`/gym/${gymId}/members/${item.memberId}`}
                className="font-medium text-foreground hover:text-accent"
              >
                {item.memberName}
              </Link>
            </Td>
            <Td className="text-text-secondary">{item.planNameSnapshot}</Td>
            <Td className="font-medium text-warning-text">{formatMillimes(item.balanceMillimes)}</Td>
          </Tr>
        ))}
        {items.length === 0 && <EmptyRow colSpan={3}>Nobody currently owes a balance.</EmptyRow>}
      </tbody>
    </Table>
  );
}

function ExpiringList({
  gymId,
  items,
}: {
  gymId: string;
  items: { id: string; memberId: string; memberName: string; endDate: Date }[];
}) {
  return (
    <Table>
      <Thead>
        <tr>
          <Th>Member</Th>
          <Th>Expires</Th>
          <Th>Status</Th>
        </tr>
      </Thead>
      <tbody>
        {items.map((item) => (
          <Tr key={item.id}>
            <Td>
              <Link
                href={`/gym/${gymId}/members/${item.memberId}`}
                className="font-medium text-foreground hover:text-accent"
              >
                {item.memberName}
              </Link>
            </Td>
            <Td className="text-text-secondary">{formatDate(item.endDate)}</Td>
            <Td>
              <Badge status="expiring-soon" />
            </Td>
          </Tr>
        ))}
        {items.length === 0 && <EmptyRow colSpan={3}>No memberships expiring soon.</EmptyRow>}
      </tbody>
    </Table>
  );
}
