import { notFound } from "next/navigation";
import Link from "next/link";
import { requireGym, requireRole } from "@/lib/server/auth";
import { getMember } from "@/lib/server/services/members";
import { listMemberships } from "@/lib/server/services/memberships";
import { listPayments, type PaymentSummary } from "@/lib/server/services/payments";
import { listCheckins } from "@/lib/server/services/attendance";
import { outstandingBalance } from "@/lib/server/services/metrics";
import { archiveMemberAction, reactivateMemberAction } from "../actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { Table, Thead, Th, Td, Tr, EmptyRow } from "@/components/ui/Table";
import { Flash } from "@/components/ui/Flash";
import { AttendanceIcon, PaymentsIcon } from "@/components/ui/icons";

const STATUS_BADGE: Record<string, BadgeStatus> = {
  ACTIVE: "active",
  EXPIRING_SOON: "expiring-soon",
  EXPIRED: "expired",
  FROZEN: "frozen",
  CANCELLED: "cancelled",
};

// A profile view shows recent activity, not a full historical ledger —
// those already exist on the Payments/Attendance screens. A member's own
// history rarely approaches this, but the cap keeps the page bounded
// regardless (same production-readiness discipline as the M2 pagination
// fix, applied here as a simple cap since a single member's own history
// doesn't warrant full pagination controls).
const RECENT_LIMIT = 20;

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString();
}

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString();
}

function formatMillimes(millimes: number): string {
  return (millimes / 1000).toFixed(3) + " TND";
}

/**
 * Gym Admin AND Gym Staff (product-spec.md §11.1, same as the Members list
 * and edit pages) — no extra role check beyond what
 * app/gym/[gymId]/layout.tsx already requires. Payment and attendance
 * detail are shown to both roles for the same reason the Payments and
 * Attendance screens already show them to both: these are per-record
 * operational figures Staff needs (e.g. "does this member still owe
 * money"), not the gym-wide financial *aggregates* product-spec.md §11.8
 * reserves for Gym Admin — this page never calls gymOutstandingBalance()
 * or any other gym-level aggregate.
 */
export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ gymId: string; memberId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { gymId, memberId } = await params;
  const { error, success } = await searchParams;
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  const context = { userId: session.userId, gymId, role: session.role };

  const member = await getMember(context, memberId);
  if (!member) {
    notFound();
  }

  const [memberships, payments, checkins] = await Promise.all([
    listMemberships(context, { memberId }),
    listPayments(context, { memberId }),
    listCheckins(context, { memberId }),
  ]);

  const paymentsByMembership = new Map<string, PaymentSummary[]>();
  for (const payment of payments) {
    const existing = paymentsByMembership.get(payment.membershipId);
    if (existing) {
      existing.push(payment);
    } else {
      paymentsByMembership.set(payment.membershipId, [payment]);
    }
  }

  // Mirrors product-spec.md §13 Rule 5's gym-level definition ("sum of
  // outstanding balances across all current, non-cancelled memberships"),
  // applied at member scope instead of gym scope — the same rule, not a
  // new one.
  const currentMemberships = memberships.filter((m) => m.status !== "CANCELLED");
  const totalOutstanding = currentMemberships.reduce(
    (sum, m) => sum + outstandingBalance(m.priceMillimesSnapshot, paymentsByMembership.get(m.id) ?? []),
    0,
  );

  // listMemberships() already orders newest-first; the first row is the
  // member's current/most recent membership (same "most recent counts as
  // current" convention lib/server/services/attendance.ts already uses).
  const current = memberships[0] ?? null;

  const recentPayments = payments.slice(0, RECENT_LIMIT);
  const recentCheckins = checkins.slice(0, RECENT_LIMIT);

  return (
    <main className="p-6 md:p-8">
      <PageHeader
        title={member.name}
        backHref={`/gym/${gymId}/members`}
        backLabel="Members"
        actions={
          <>
            <Link
              href={`/gym/${gymId}/members/${member.id}/edit`}
              className="inline-flex items-center justify-center rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-3"
            >
              Edit
            </Link>
            {member.archivedAt ? (
              <form action={reactivateMemberAction}>
                <input type="hidden" name="gymId" value={gymId} />
                <input type="hidden" name="memberId" value={member.id} />
                <Button type="submit" variant="ghost">
                  Reactivate
                </Button>
              </form>
            ) : (
              <form action={archiveMemberAction}>
                <input type="hidden" name="gymId" value={gymId} />
                <input type="hidden" name="memberId" value={member.id} />
                <ConfirmSubmitButton
                  confirmTitle="Archive this member?"
                  confirmMessage={`${member.name} will be hidden from active lists. Their history is preserved and this can be undone.`}
                  confirmLabel="Archive"
                >
                  Archive
                </ConfirmSubmitButton>
              </form>
            )}
          </>
        }
      />

      <Flash error={error} success={success} />

      <section className="rounded-lg border border-border-subtle bg-surface-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge status={member.archivedAt ? "archived" : "active"} />
          {current && <Badge status={STATUS_BADGE[current.status] ?? "active"} />}
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-tertiary">Phone</dt>
            <dd className="text-foreground">{member.phone}</dd>
          </div>
          <div>
            <dt className="text-text-tertiary">Member since</dt>
            <dd className="text-foreground">{formatDate(member.joinDate)}</dd>
          </div>
          {(member.emergencyContactName || member.emergencyContactPhone) && (
            <div className="sm:col-span-2">
              <dt className="text-text-tertiary">Emergency contact</dt>
              <dd className="text-foreground">
                {member.emergencyContactName ?? "—"}
                {member.emergencyContactPhone ? ` — ${member.emergencyContactPhone}` : ""}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:max-w-md">
        <StatCard
          label="Outstanding balance"
          value={formatMillimes(Math.max(0, totalOutstanding))}
          icon={<PaymentsIcon className="h-4.5 w-4.5" />}
          tone={totalOutstanding > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Total check-ins"
          value={String(checkins.length)}
          icon={<AttendanceIcon className="h-4.5 w-4.5" />}
          tone="accent"
        />
      </div>

      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          Membership history
        </h2>
        <div className="mt-3">
          <Table>
            <Thead>
              <tr>
                <Th>Plan</Th>
                <Th>Price</Th>
                <Th>Start</Th>
                <Th>End</Th>
                <Th>Status</Th>
                <Th>Outstanding</Th>
              </tr>
            </Thead>
            <tbody>
              {memberships.map((m) => {
                const balance =
                  m.status === "CANCELLED"
                    ? null
                    : outstandingBalance(m.priceMillimesSnapshot, paymentsByMembership.get(m.id) ?? []);
                return (
                  <Tr key={m.id}>
                    <Td className="font-medium">{m.planNameSnapshot}</Td>
                    <Td className="text-text-secondary">{formatMillimes(m.priceMillimesSnapshot)}</Td>
                    <Td className="text-text-secondary">{formatDate(m.startDate)}</Td>
                    <Td className="text-text-secondary">{formatDate(m.endDate)}</Td>
                    <Td>
                      <Badge status={STATUS_BADGE[m.status] ?? "active"} />
                    </Td>
                    <Td className="text-text-secondary">
                      {balance === null ? "—" : formatMillimes(Math.max(0, balance))}
                    </Td>
                  </Tr>
                );
              })}
              {memberships.length === 0 && (
                <EmptyRow colSpan={6}>No memberships yet.</EmptyRow>
              )}
            </tbody>
          </Table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          Recent payments
        </h2>
        <div className="mt-3">
          <Table>
            <Thead>
              <tr>
                <Th>Date</Th>
                <Th>Amount</Th>
                <Th>Effective</Th>
                <Th>Method</Th>
                <Th>Recorded by</Th>
              </tr>
            </Thead>
            <tbody>
              {recentPayments.map((p) => (
                <Tr key={p.id}>
                  <Td className="text-text-secondary">{formatDate(p.paidAt)}</Td>
                  <Td className="font-medium">{formatMillimes(p.amountMillimes)}</Td>
                  <Td>
                    {formatMillimes(p.effectiveAmountMillimes)}
                    {p.adjustments.length > 0 && (
                      <span className="ml-1 text-xs text-text-tertiary">
                        ({p.adjustments.length} adjustment
                        {p.adjustments.length > 1 ? "s" : ""})
                      </span>
                    )}
                  </Td>
                  <Td className="text-text-secondary">{p.method}</Td>
                  <Td className="text-text-secondary">{p.recordedByEmail}</Td>
                </Tr>
              ))}
              {recentPayments.length === 0 && (
                <EmptyRow colSpan={5}>No payments yet.</EmptyRow>
              )}
            </tbody>
          </Table>
          {payments.length > RECENT_LIMIT && (
            <p className="mt-2 text-xs text-text-tertiary">
              Showing the {RECENT_LIMIT} most recent of {payments.length} payments. See the{" "}
              <Link href={`/gym/${gymId}/payments`} className="text-accent hover:text-accent-strong-hover">
                Payments
              </Link>{" "}
              page for the full record.
            </p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          Recent check-ins
        </h2>
        <div className="mt-3">
          <Table>
            <Thead>
              <tr>
                <Th>Checked in</Th>
                <Th>Membership status</Th>
                <Th>Recorded by</Th>
              </tr>
            </Thead>
            <tbody>
              {recentCheckins.map((c) => (
                <Tr key={c.id}>
                  <Td className="text-text-secondary">{formatDateTime(c.checkedInAt)}</Td>
                  <Td>
                    {c.membershipStatus ? (
                      <Badge status={STATUS_BADGE[c.membershipStatus] ?? "active"} />
                    ) : (
                      <span className="text-text-tertiary">No membership</span>
                    )}
                  </Td>
                  <Td className="text-text-secondary">{c.recordedByEmail}</Td>
                </Tr>
              ))}
              {recentCheckins.length === 0 && (
                <EmptyRow colSpan={3}>No check-ins yet.</EmptyRow>
              )}
            </tbody>
          </Table>
          {checkins.length > RECENT_LIMIT && (
            <p className="mt-2 text-xs text-text-tertiary">
              Showing the {RECENT_LIMIT} most recent of {checkins.length} check-ins. See the{" "}
              <Link href={`/gym/${gymId}/attendance`} className="text-accent hover:text-accent-strong-hover">
                Attendance
              </Link>{" "}
              page for the full record.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
