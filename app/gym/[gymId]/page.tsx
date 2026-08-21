import Link from "next/link";
import { getSessionContext } from "@/lib/server/auth";
import { gymAttendanceMetrics } from "@/lib/server/services/attendance";
import { gymMembershipDashboardSummary } from "@/lib/server/services/memberships";
import { gymRevenueForPeriod } from "@/lib/server/services/payments";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import {
  AnalyticsIcon,
  AttendanceIcon,
  ClockIcon,
  DashboardIcon,
  LogoMark,
  MembersIcon,
  MembershipsIcon,
  PaymentsIcon,
} from "@/components/ui/icons";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function formatMillimes(millimes: number): string {
  return (millimes / 1000).toFixed(3) + " TND";
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Already verified by app/gym/[gymId]/layout.tsx — getSessionContext() is
 * cached per request (React's cache()), so re-reading it here to branch by
 * role and to build the overview stats costs nothing extra. Home is
 * deliberately a *small* overview, not a second Dashboard: 3 stats and a
 * compact expiring-soon preview, reusing the exact same
 * gymMembershipDashboardSummary/gymAttendanceMetrics/gymRevenueForPeriod
 * calls Dashboard already makes — no new query, no new metric, no chart.
 * The full breakdown stays on Dashboard; Analytics stays the place for
 * trends. Gym Staff never triggers gymRevenueForPeriod at all (defense in
 * depth, same discipline as dashboard/page.tsx).
 */
export default async function GymHomePage({
  params,
}: {
  params: Promise<{ gymId: string }>;
}) {
  const { gymId } = await params;
  const session = await getSessionContext();
  const context = { userId: session.userId, gymId, role: session.role };

  const now = new Date();
  const start = startOfMonth(now);
  const end = endOfMonth(now);

  const [membershipSummary, attendance] = await Promise.all([
    gymMembershipDashboardSummary(context, start, end),
    gymAttendanceMetrics(context, start, end),
  ]);
  const revenue =
    session.role === "GYM_ADMIN" ? await gymRevenueForPeriod(context, start, end) : null;

  const isAdmin = session.role === "GYM_ADMIN";
  const expiringPreview = membershipSummary.expiringSoon.slice(0, 3);

  const quickActions = [
    { href: `/gym/${gymId}/dashboard`, label: "Dashboard", icon: DashboardIcon },
    { href: `/gym/${gymId}/members`, label: "Members", icon: MembersIcon },
    { href: `/gym/${gymId}/memberships`, label: "Memberships", icon: MembershipsIcon },
    { href: `/gym/${gymId}/payments`, label: "Payments", icon: PaymentsIcon },
    { href: `/gym/${gymId}/attendance`, label: "Attendance", icon: AttendanceIcon },
    ...(isAdmin
      ? [{ href: `/gym/${gymId}/analytics`, label: "Analytics", icon: AnalyticsIcon }]
      : []),
  ];

  return (
    <main className="p-6 md:p-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-lg border border-border-subtle bg-surface-2 p-6 md:p-8">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(600px circle at 85% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%)",
          }}
        />
        <div className="relative flex items-start gap-4">
          <LogoMark className="hidden h-12 w-12 sm:flex" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Welcome back
            </h1>
            <p className="mt-1 max-w-md text-sm text-text-secondary">
              {isAdmin
                ? "Here's how your gym is doing this month."
                : "Here's today's snapshot — jump into check-ins, members, or payments below."}
            </p>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          Quick actions
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex flex-col items-start gap-2.5 rounded-lg border border-border-subtle bg-surface-2 p-4 transition-colors hover:border-accent/40 hover:bg-surface-3"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft-bg text-accent">
                <action.icon className="h-4.5 w-4.5" />
              </span>
              <span className="text-sm font-medium text-foreground group-hover:text-accent">
                {action.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* High-level overview */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          This month at a glance
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard
            label="Active members"
            value={String(membershipSummary.activeMembers)}
            icon={<MembersIcon className="h-4.5 w-4.5" />}
            tone="accent"
          />
          <StatCard
            label="Expiring soon"
            value={String(membershipSummary.expiringSoon.length)}
            icon={<ClockIcon className="h-4.5 w-4.5" />}
            tone="warning"
          />
          {isAdmin ? (
            <StatCard
              label="Revenue"
              value={formatMillimes(revenue ?? 0)}
              icon={<PaymentsIcon className="h-4.5 w-4.5" />}
              tone="success"
            />
          ) : (
            <StatCard
              label="Check-ins today"
              value={String(attendance.totalCheckins)}
              icon={<AttendanceIcon className="h-4.5 w-4.5" />}
              tone="accent"
            />
          )}
        </div>
      </section>

      {/* Expiring soon preview */}
      {expiringPreview.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
            Needs attention
          </h2>
          <div className="mt-3 rounded-lg border border-border-subtle bg-surface-2 p-2">
            <ul className="divide-y divide-border-subtle">
              {expiringPreview.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <Link
                    href={`/gym/${gymId}/members/${m.memberId}`}
                    className="text-sm font-medium text-foreground hover:text-accent"
                  >
                    {m.memberName}
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary">{formatDate(m.endDate)}</span>
                    <Badge status="expiring-soon" />
                  </div>
                </li>
              ))}
            </ul>
            {membershipSummary.expiringSoon.length > expiringPreview.length && (
              <Link
                href={`/gym/${gymId}/dashboard`}
                className="block px-3 py-2 text-xs font-medium text-accent hover:text-accent-strong-hover"
              >
                View all {membershipSummary.expiringSoon.length} expiring memberships →
              </Link>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
