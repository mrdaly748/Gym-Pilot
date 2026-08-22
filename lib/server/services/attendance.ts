import "server-only";
import { withTenant, type TenantContext } from "@/lib/server/db";
import { Prisma } from "@/lib/server/generated/prisma-client/client";
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

export const CHECKINS_PAGE_SIZE = 25;

export type PaginatedCheckins = {
  items: CheckinSummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

/**
 * Security audit finding M2: check-ins are the fastest-growing table in the
 * schema — one row per visit, unbounded over a gym's lifetime, unlike entity
 * lists (members, trainers) that are naturally bounded by the gym's
 * real-world size. This is the paginated counterpart to listCheckins()
 * above, used only by the Attendance screen's "Recent check-ins" table;
 * listCheckins() itself is left unchanged (still used by tests and any
 * future caller that genuinely needs the full set for a bounded period).
 * `checkedInAt` alone isn't a unique sort key, so `id` is added as a
 * tiebreaker to keep offset pagination stable across page boundaries.
 */
export async function listCheckinsPage(
  context: TenantContext,
  opts?: { memberId?: string; periodStart?: Date; periodEnd?: Date; page?: number },
): Promise<PaginatedCheckins> {
  const now = new Date();
  const pageSize = CHECKINS_PAGE_SIZE;
  const page = Math.max(1, Math.floor(opts?.page ?? 1));
  const where = {
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
  };

  return withTenant(context, async (tx) => {
    const [rows, totalCount] = await Promise.all([
      tx.attendanceCheckin.findMany({
        where,
        select: CHECKIN_SELECT,
        orderBy: [{ checkedInAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      tx.attendanceCheckin.count({ where }),
    ]);

    const distinctMemberIds = [...new Set(rows.map((r) => r.memberId))];
    const statusByMember = new Map<string, MembershipStatus | null>();
    for (const memberId of distinctMemberIds) {
      statusByMember.set(
        memberId,
        await currentMembershipStatus(tx, context.gymId, memberId, now),
      );
    }

    return {
      items: rows.map((row) => toSummary(row, statusByMember.get(row.memberId) ?? null)),
      page,
      pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    };
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
 * The same "local calendar day" boundary the rest of the app already uses
 * (e.g. app/gym/[gymId]/dashboard/page.tsx's startOfToday()/endOfToday()) —
 * plain Date-component construction, not a UTC/timezone conversion. Kept
 * here rather than in metrics.ts since it's specific to this one rule, not
 * a canonical business metric shared across screens.
 */
function calendarDayRange(date: Date): { start: Date; end: Date } {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
    end: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999),
  };
}

const ALREADY_CHECKED_IN_TODAY_MESSAGE = "This member has already checked in today.";

/**
 * Records a check-in. Never blocked by membership status — active,
 * expiring, expired, frozen, cancelled, or no membership at all are all
 * accepted (product-spec.md §18); the current status is only ever surfaced,
 * never enforced. Archived members are rejected: an archived member record
 * is no longer a current customer, distinct from "membership" status.
 *
 * At most one check-in per member per calendar day (MVP hardening pass —
 * intentional product decision, not derived from product-spec.md). The
 * findFirst() below handles the common case with a clear error before any
 * write is attempted; it is not atomic by itself, so the actual, final
 * authority is the database's own unique index (see the migration this
 * commit adds) — the try/catch around create() below exists specifically
 * to translate that race's raw Postgres/Prisma error into the exact same
 * ValidationError the pre-check throws, so callers never see a difference
 * between "caught early" and "caught by the database."
 */
export async function recordCheckin(
  context: TenantContext,
  memberId: string,
): Promise<RecordCheckinResult> {
  const now = new Date();
  const { start: dayStart, end: dayEnd } = calendarDayRange(now);

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

    const existingToday = await tx.attendanceCheckin.findFirst({
      where: {
        gymId: context.gymId,
        memberId,
        checkedInAt: { gte: dayStart, lte: dayEnd },
      },
      select: { id: true },
    });
    if (existingToday) {
      throw new ValidationError(ALREADY_CHECKED_IN_TODAY_MESSAGE);
    }

    const membershipStatus = await currentMembershipStatus(
      tx,
      context.gymId,
      memberId,
      now,
    );

    let created: { id: string };
    try {
      created = await tx.attendanceCheckin.create({
        data: {
          gymId: context.gymId,
          memberId,
          checkedInAt: now,
          recordedByUserId: context.userId,
        },
        select: { id: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ValidationError(ALREADY_CHECKED_IN_TODAY_MESSAGE);
      }
      throw error;
    }

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
