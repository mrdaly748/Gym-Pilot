import "server-only";
import { withTenant, type TenantContext } from "@/lib/server/db";
import type { Prisma } from "@/lib/server/generated/prisma-client/client";
import { NotFoundError, ValidationError } from "@/lib/server/errors";
import {
  deriveMembershipStatus,
  totalCheckins,
  uniqueVisitors,
  type MembershipStatus,
} from "@/lib/server/services/metrics";

/**
 * Gym Admin + Gym Staff attendance (product-spec.md §11.5, §5.3): both roles
 * may check a member in and view history/metrics. Correcting/deleting an
 * existing check-in is Gym-Admin-only — enforced here by the caller's
 * requireRole() (Server Action layer) and, independently, by the
 * attendance_checkins RLS policies (see the Phase 6 migration). Unlike
 * Payments, there is no role split on read/insert — only on correction.
 *
 * Check-in targets a Member, not a Membership, and never requires or is
 * blocked by membership status (product-spec.md §18) — the member's current
 * status is computed via metrics.ts's deriveMembershipStatus() (the same
 * function memberships.ts/payments.ts use, never a second implementation)
 * purely to surface it to staff.
 */

export type CheckinSummary = {
  id: string;
  memberId: string;
  memberName: string;
  checkedInAt: Date;
  recordedByEmail: string;
  membershipStatus: MembershipStatus | null;
};

const CHECKIN_SELECT = {
  id: true,
  memberId: true,
  checkedInAt: true,
  member: { select: { name: true } },
  recordedBy: { select: { email: true } },
} as const;

type CheckinRow = {
  id: string;
  memberId: string;
  checkedInAt: Date;
  member: { name: string };
  recordedBy: { email: string };
};

function toSummary(
  row: CheckinRow,
  membershipStatus: MembershipStatus | null,
): CheckinSummary {
  return {
    id: row.id,
    memberId: row.memberId,
    memberName: row.member.name,
    checkedInAt: row.checkedInAt,
    recordedByEmail: row.recordedBy.email,
    membershipStatus,
  };
}

/**
 * Lists check-ins, each annotated with the member's *current* membership
 * status (product-spec.md §18: surfaced to staff, never a blocker) — looked
 * up once per distinct member in the result set, not once per query caller,
 * to keep this reasonable at MVP scale without a second N+1-prone path.
 */
export async function listCheckins(
  context: TenantContext,
  opts?: { memberId?: string; periodStart?: Date; periodEnd?: Date },
): Promise<CheckinSummary[]> {
  const now = new Date();

  return withTenant(context, async (tx) => {
    const rows = await tx.attendanceCheckin.findMany({
      where: {
        gymId: context.gymId,
        ...(opts?.memberId ? { memberId: opts.memberId } : {}),
        ...(opts?.periodStart || opts?.periodEnd
          ? {
              checkedInAt: {
                ...(opts?.periodStart ? { gte: opts.periodStart } : {}),
                ...(opts?.periodEnd ? { lte: opts.periodEnd } : {}),
              },
            }
          : {}),
      },
      select: CHECKIN_SELECT,
      orderBy: { checkedInAt: "desc" },
    });

    const distinctMemberIds = [...new Set(rows.map((r) => r.memberId))];
    const statusByMember = new Map<string, MembershipStatus | null>();
    for (const memberId of distinctMemberIds) {
      statusByMember.set(
        memberId,
        await currentMembershipStatus(tx, context.gymId, memberId, now),
      );
    }

    return rows.map((row) => toSummary(row, statusByMember.get(row.memberId) ?? null));
  });
}

/**
 * The member's current membership status, derived the same way
 * memberships.ts does, for surfacing to staff at check-in time. `null` if
 * the member has never had a membership — a valid, expected case (Rule 10
 * doesn't require a membership to exist for attendance). When a member has
 * multiple membership records (renewal history), the most recently started
 * one is treated as "current" for display purposes.
 */
async function currentMembershipStatus(
  tx: Prisma.TransactionClient,
  gymId: string,
  memberId: string,
  now: Date,
): Promise<MembershipStatus | null> {
  const membership = await tx.membership.findFirst({
    where: { gymId, memberId },
    select: {
      startDate: true,
      endDate: true,
      cancelledAt: true,
      freezes: { select: { frozenAt: true, resumedAt: true } },
    },
    orderBy: { startDate: "desc" },
  });
  if (!membership) {
    return null;
  }
  return deriveMembershipStatus(membership, now);
}

export type RecordCheckinResult = {
  id: string;
  membershipStatus: MembershipStatus | null;
};

/**
 * Records a check-in. Never blocked by membership status — active,
 * expiring, expired, frozen, cancelled, or no membership at all are all
 * accepted (product-spec.md §18); the current status is only ever surfaced,
 * never enforced. Archived members are rejected: an archived member record
 * is no longer a current customer, distinct from "membership" status.
 */
export async function recordCheckin(
  context: TenantContext,
  memberId: string,
): Promise<RecordCheckinResult> {
  const now = new Date();

  return withTenant(context, async (tx) => {
    const member = await tx.member.findFirst({
      where: { id: memberId, gymId: context.gymId },
    });
    if (!member) {
      throw new NotFoundError("Member not found in this gym.");
    }
    if (member.archivedAt) {
      throw new ValidationError("Cannot check in an archived member.");
    }

    const membershipStatus = await currentMembershipStatus(
      tx,
      context.gymId,
      memberId,
      now,
    );

    const created = await tx.attendanceCheckin.create({
      data: {
        gymId: context.gymId,
        memberId,
        checkedInAt: now,
        recordedByUserId: context.userId,
      },
      select: { id: true },
    });

    return { id: created.id, membershipStatus };
  });
}

export type CorrectCheckinInput = {
  memberId?: string;
  checkedInAt?: Date;
};

/**
 * Gym-Admin-only (enforced by the caller + RLS). Simplest correction path
 * for a mis-recorded check-in (wrong member selected, or wrong time) — a
 * direct UPDATE of the existing row, not a second adjustment/history table.
 * Unlike Payment, attendance carries no financial consequence, so
 * product-spec.md Rule 11's append-only regime (scoped to payments/expenses
 * only) doesn't apply here.
 */
export async function correctCheckin(
  context: TenantContext,
  checkinId: string,
  input: CorrectCheckinInput,
): Promise<void> {
  if (input.memberId) {
    const member = await withTenant(context, (tx) =>
      tx.member.findFirst({ where: { id: input.memberId, gymId: context.gymId } }),
    );
    if (!member) {
      throw new NotFoundError("Member not found in this gym.");
    }
  }

  const result = await withTenant(context, (tx) =>
    tx.attendanceCheckin.updateMany({
      where: { id: checkinId, gymId: context.gymId },
      data: {
        ...(input.memberId ? { memberId: input.memberId } : {}),
        ...(input.checkedInAt ? { checkedInAt: input.checkedInAt } : {}),
      },
    }),
  );
  if (result.count === 0) {
    throw new NotFoundError("Check-in not found in this gym.");
  }
}

/** Gym-Admin-only (enforced by the caller + RLS). Removes a mis-recorded check-in entirely. */
export async function deleteCheckin(
  context: TenantContext,
  checkinId: string,
): Promise<void> {
  const result = await withTenant(context, (tx) =>
    tx.attendanceCheckin.deleteMany({
      where: { id: checkinId, gymId: context.gymId },
    }),
  );
  if (result.count === 0) {
    throw new NotFoundError("Check-in not found in this gym.");
  }
}

export type AttendanceMetrics = {
  totalCheckins: number;
  uniqueVisitors: number;
};

export async function gymAttendanceMetrics(
  context: TenantContext,
  periodStart: Date,
  periodEnd: Date,
): Promise<AttendanceMetrics> {
  const rows = await withTenant(context, (tx) =>
    tx.attendanceCheckin.findMany({
      where: { gymId: context.gymId, checkedInAt: { gte: periodStart, lte: periodEnd } },
      select: { memberId: true, checkedInAt: true },
    }),
  );
  return {
    totalCheckins: totalCheckins(rows, periodStart, periodEnd),
    uniqueVisitors: uniqueVisitors(rows, periodStart, periodEnd),
  };
}

export type MonthlyPeriod = { start: Date; end: Date };
export type AttendanceTrendPoint = MonthlyPeriod & AttendanceMetrics;

/**
 * Phase 8 Analytics (product-spec.md §11.9): attendance trend — one point
 * per caller-supplied period. Queries check-ins once across the whole
 * caller-supplied window (not once per period), then reuses the same
 * canonical totalCheckins()/uniqueVisitors() per period.
 */
export async function gymAttendanceTrend(
  context: TenantContext,
  periods: MonthlyPeriod[],
): Promise<AttendanceTrendPoint[]> {
  if (periods.length === 0) {
    return [];
  }
  const windowStart = periods[0].start;
  const windowEnd = periods[periods.length - 1].end;

  const rows = await withTenant(context, (tx) =>
    tx.attendanceCheckin.findMany({
      where: { gymId: context.gymId, checkedInAt: { gte: windowStart, lte: windowEnd } },
      select: { memberId: true, checkedInAt: true },
    }),
  );
  return periods.map((period) => ({
    ...period,
    totalCheckins: totalCheckins(rows, period.start, period.end),
    uniqueVisitors: uniqueVisitors(rows, period.start, period.end),
  }));
}
