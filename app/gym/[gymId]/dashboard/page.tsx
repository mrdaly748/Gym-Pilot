import Link from "next/link";
import { requireGym, requireRole } from "@/lib/server/auth";
import { gymAttendanceMetrics } from "@/lib/server/services/attendance";
import { gymExpensesForPeriod } from "@/lib/server/services/expenses";
import { gymMembershipDashboardSummary } from "@/lib/server/services/memberships";
import { gymOutstandingBalance, gymRevenueForPeriod } from "@/lib/server/services/payments";

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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

/**
 * Gym Admin AND Gym Staff (product-spec.md §11.8) — role-branched below,
 * before any query runs. Gym Staff's branch never calls
 * gymRevenueForPeriod/gymExpensesForPeriod/gymOutstandingBalance at all —
 * not merely omitted from the rendered output, so there is no code path on
 * this page through which a Staff session's request can even reach the
 * financial tables it has zero RLS access to anyway (defense in depth, per
 * every prior phase's authorization discipline).
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

  if (session.role === "GYM_STAFF") {
    const [membershipSummary, todayAttendance] = await Promise.all([
      gymMembershipDashboardSummary(context, start, end),
      gymAttendanceMetrics(context, startOfToday(now), endOfToday(now)),
    ]);

    return (
      <main className="p-8">
        <Link href={`/gym/${gymId}`} className="text-sm underline">
          &larr; Gym
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Dashboard</h1>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="Today's check-ins" value={String(todayAttendance.totalCheckins)} />
          <StatCard label="Today's unique visitors" value={String(todayAttendance.uniqueVisitors)} />
        </div>

        <section className="mt-8">
          <h2 className="text-sm font-medium">Memberships expiring soon</h2>
          <ExpiringList gymId={gymId} items={membershipSummary.expiringSoon} />
        </section>

        <section className="mt-8">
          <Link href={`/gym/${gymId}/members`} className="text-sm underline">
            Go to Members &rarr;
          </Link>
        </section>
      </main>
    );
  }

  const [membershipSummary, revenue, expenses, outstanding, attendance] = await Promise.all([
    gymMembershipDashboardSummary(context, start, end),
    gymRevenueForPeriod(context, start, end),
    gymExpensesForPeriod(context, start, end),
    gymOutstandingBalance(context),
    gymAttendanceMetrics(context, start, end),
  ]);

  return (
    <main className="p-8">
      <Link href={`/gym/${gymId}`} className="text-sm underline">
        &larr; Gym
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <nav className="flex gap-3 text-sm">
          <Link
            href={`/gym/${gymId}/dashboard?period=this-month`}
            className={period === "this-month" ? "font-semibold underline" : "underline"}
          >
            This month
          </Link>
          <Link
            href={`/gym/${gymId}/dashboard?period=last-month`}
            className={period === "last-month" ? "font-semibold underline" : "underline"}
          >
            Last month
          </Link>
        </nav>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Active members" value={String(membershipSummary.activeMembers)} />
        <StatCard label="New members" value={String(membershipSummary.newMembers)} />
        <StatCard label="Memberships expiring soon" value={String(membershipSummary.expiringSoon.length)} />
        <StatCard label="Outstanding payments" value={formatMillimes(outstanding)} />
        <StatCard label="Revenue" value={formatMillimes(revenue)} />
        <StatCard label="Total expenses" value={formatMillimes(expenses)} />
        <StatCard label="Total check-ins" value={String(attendance.totalCheckins)} />
        <StatCard label="Unique visitors" value={String(attendance.uniqueVisitors)} />
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Memberships expiring soon</h2>
        <ExpiringList gymId={gymId} items={membershipSummary.expiringSoon} />
      </section>
    </main>
  );
}

function ExpiringList({
  gymId,
  items,
}: {
  gymId: string;
  items: { id: string; memberId: string; memberName: string; endDate: Date }[];
}) {
  if (items.length === 0) {
    return <p className="mt-2 text-sm text-gray-500">No memberships expiring soon.</p>;
  }
  return (
    <table className="mt-2 w-full text-left text-sm">
      <thead>
        <tr className="border-b border-gray-300">
          <th className="py-2 pr-4">Member</th>
          <th className="py-2">Expires</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} className="border-b border-gray-100">
            <td className="py-2 pr-4">
              <Link href={`/gym/${gymId}/members/${item.memberId}/edit`} className="underline">
                {item.memberName}
              </Link>
            </td>
            <td className="py-2">{formatDate(item.endDate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
