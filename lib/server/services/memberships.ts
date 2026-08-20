import "server-only";
import { withTenant, type TenantContext } from "@/lib/server/db";
import { NotFoundError, ValidationError } from "@/lib/server/errors";
import {
  activeMemberCount,
  addDays,
  deriveMembershipStatus,
  frozenDays,
  isActiveMember,
  newMemberCount,
  type MembershipStatus,
} from "@/lib/server/services/metrics";

/**
 * Gym Admin + Gym Staff membership lifecycle (product-spec.md §11.3,
 * §13 Rules 6–8); cancellation is Gym Admin-only (enforced by the caller's
 * requireRole() and, independently, the memberships_update RLS policy's
 * WITH CHECK — see the Phase 4 migration). Callers (Server Actions) call
 * requireGym(gymId) + requireRole(...) first — this module does not
 * re-check the caller's role itself, matching every other service.
 *
 * No stored status column anywhere (docs/architecture.md §5.5) — every
 * returned membership carries a `status` computed by
 * lib/server/services/metrics.ts at read time, from the same raw data
 * every other consumer (dashboard, analytics, AI, later phases) will read.
 */

export type MembershipSummary = {
  id: string;
  memberId: string;
  memberName: string;
  planId: string;
  planNameSnapshot: string;
  priceMillimesSnapshot: number;
  durationDaysSnapshot: number;
  startDate: Date;
  endDate: Date;
  cancelledAt: Date | null;
  status: MembershipStatus;
  freezeCount: number;
};

type MembershipRow = {
  id: string;
  memberId: string;
  planId: string;
  planNameSnapshot: string;
  priceMillimesSnapshot: number;
  durationDaysSnapshot: number;
  startDate: Date;
  endDate: Date;
  cancelledAt: Date | null;
  member: { name: string };
  freezes: { frozenAt: Date; resumedAt: Date | null }[];
};

function toSummary(row: MembershipRow, now: Date): MembershipSummary {
  return {
    id: row.id,
    memberId: row.memberId,
    memberName: row.member.name,
    planId: row.planId,
    planNameSnapshot: row.planNameSnapshot,
    priceMillimesSnapshot: row.priceMillimesSnapshot,
    durationDaysSnapshot: row.durationDaysSnapshot,
    startDate: row.startDate,
    endDate: row.endDate,
    cancelledAt: row.cancelledAt,
    status: deriveMembershipStatus(row, now),
    freezeCount: row.freezes.length,
  };
}

const MEMBERSHIP_SELECT = {
  id: true,
  memberId: true,
  planId: true,
  planNameSnapshot: true,
  priceMillimesSnapshot: true,
  durationDaysSnapshot: true,
  startDate: true,
  endDate: true,
  cancelledAt: true,
  member: { select: { name: true } },
  freezes: { select: { frozenAt: true, resumedAt: true } },
} as const;

export async function listMemberships(
  context: TenantContext,
  opts?: { memberId?: string },
): Promise<MembershipSummary[]> {
  const now = new Date();
  const rows = await withTenant(context, (tx) =>
    tx.membership.findMany({
      where: { gymId: context.gymId, ...(opts?.memberId ? { memberId: opts.memberId } : {}) },
      select: MEMBERSHIP_SELECT,
      orderBy: { createdAt: "desc" },
    }),
  );
  return rows.map((row) => toSummary(row, now));
}

export type AssignMembershipInput = {
  memberId: string;
  planId: string;
  startDate?: Date;
};

/**
 * Creates a new membership. Rejects a member who already has a
 * current (active/expiring-soon/frozen) membership — product-spec.md §13
 * Rule 8: concurrent/overlapping active memberships are not supported in
 * MVP. Renewing an existing membership goes through renewMembership()
 * instead.
 */
export async function assignMembership(
  context: TenantContext,
  input: AssignMembershipInput,
): Promise<{ id: string }> {
  const now = new Date();

  return withTenant(context, async (tx) => {
    const member = await tx.member.findFirst({
      where: { id: input.memberId, gymId: context.gymId },
    });
    if (!member) {
      throw new NotFoundError("Member not found in this gym.");
    }
    if (member.archivedAt) {
      throw new ValidationError("Cannot assign a membership to an archived member.");
    }

    const plan = await tx.membershipPlan.findFirst({
      where: { id: input.planId, gymId: context.gymId },
    });
    if (!plan) {
      throw new NotFoundError("Plan not found in this gym.");
    }
    if (plan.archivedAt) {
      throw new ValidationError("Cannot assign an archived plan.");
    }

    const existing = await tx.membership.findMany({
      where: { memberId: input.memberId, gymId: context.gymId },
      select: MEMBERSHIP_SELECT,
    });
    const hasCurrent = existing.some((row) => {
      const status = deriveMembershipStatus(row, now);
      return isActiveMember(status) || status === "FROZEN";
    });
    if (hasCurrent) {
      throw new ValidationError(
        "This member already has a current membership. Use renew instead of assigning a new one.",
      );
    }

    const startDate = input.startDate ?? now;
    const endDate = addDays(startDate, plan.durationDays);

    const created = await tx.membership.create({
      data: {
        gymId: context.gymId,
        memberId: input.memberId,
        planId: plan.id,
        planNameSnapshot: plan.name,
        priceMillimesSnapshot: plan.priceMillimes,
        durationDaysSnapshot: plan.durationDays,
        startDate,
        endDate,
      },
      select: { id: true },
    });
    return created;
  });
}

export type RenewMembershipInput = {
  planId?: string;
};

/**
 * Always creates a new, distinct row (product-spec.md §13 Rule 8) — never
 * mutates the prior membership, which remains fully intact and queryable
 * as history. The new membership starts the day after the prior one ends
 * (no gap, no overlap) if renewed before expiry, or today if the prior
 * membership already lapsed. Defaults to the same plan; a different plan
 * may be supplied (its terms are freshly snapshotted, same as assign).
 */
export async function renewMembership(
  context: TenantContext,
  membershipId: string,
  input: RenewMembershipInput = {},
): Promise<{ id: string }> {
  const now = new Date();

  return withTenant(context, async (tx) => {
    const prior = await tx.membership.findFirst({
      where: { id: membershipId, gymId: context.gymId },
    });
    if (!prior) {
      throw new NotFoundError("Membership not found in this gym.");
    }
    if (prior.cancelledAt) {
      throw new ValidationError("Cannot renew a cancelled membership.");
    }

    const planId = input.planId ?? prior.planId;
    const plan = await tx.membershipPlan.findFirst({
      where: { id: planId, gymId: context.gymId },
    });
    if (!plan) {
      throw new NotFoundError("Plan not found in this gym.");
    }
    if (plan.archivedAt) {
      throw new ValidationError("Cannot renew onto an archived plan.");
    }

    const dayAfterPrior = addDays(prior.endDate, 1);
    const startDate = dayAfterPrior.getTime() > now.getTime() ? dayAfterPrior : now;
    const endDate = addDays(startDate, plan.durationDays);

    const created = await tx.membership.create({
      data: {
        gymId: context.gymId,
        memberId: prior.memberId,
        planId: plan.id,
        planNameSnapshot: plan.name,
        priceMillimesSnapshot: plan.priceMillimes,
        durationDaysSnapshot: plan.durationDays,
        startDate,
        endDate,
      },
      select: { id: true },
    });
    return created;
  });
}

/** Rejects if already cancelled or already currently frozen. */
export async function freezeMembership(
  context: TenantContext,
  membershipId: string,
): Promise<void> {
  const now = new Date();

  await withTenant(context, async (tx) => {
    const row = await tx.membership.findFirst({
      where: { id: membershipId, gymId: context.gymId },
      select: MEMBERSHIP_SELECT,
    });
    if (!row) {
      throw new NotFoundError("Membership not found in this gym.");
    }
    if (row.cancelledAt) {
      throw new ValidationError("Cannot freeze a cancelled membership.");
    }
    if (row.freezes.some((f) => f.resumedAt === null)) {
      throw new ValidationError("Membership is already frozen.");
    }

    await tx.membershipFreeze.create({
      data: { gymId: context.gymId, membershipId, frozenAt: now },
    });
  });
}

/**
 * Resolves the open freeze and shifts the membership's end date forward by
 * the number of days it was frozen (product-spec.md §13 Rule 6). Rejects
 * if not currently frozen.
 */
export async function resumeMembership(
  context: TenantContext,
  membershipId: string,
): Promise<void> {
  const now = new Date();

  await withTenant(context, async (tx) => {
    const membership = await tx.membership.findFirst({
      where: { id: membershipId, gymId: context.gymId },
    });
    if (!membership) {
      throw new NotFoundError("Membership not found in this gym.");
    }

    const openFreeze = await tx.membershipFreeze.findFirst({
      where: { membershipId, gymId: context.gymId, resumedAt: null },
    });
    if (!openFreeze) {
      throw new ValidationError("Membership is not currently frozen.");
    }

    const days = frozenDays(openFreeze.frozenAt, now);
    await tx.membershipFreeze.update({
      where: { id: openFreeze.id },
      data: { resumedAt: now },
    });
    await tx.membership.update({
      where: { id: membershipId },
      data: { endDate: addDays(membership.endDate, days) },
    });
  });
}

/** Gym Admin-only (enforced by the caller + RLS). Permanent, distinct from natural expiration. */
export async function cancelMembership(
  context: TenantContext,
  membershipId: string,
): Promise<void> {
  const now = new Date();

  const result = await withTenant(context, (tx) =>
    tx.membership.updateMany({
      where: { id: membershipId, gymId: context.gymId, cancelledAt: null },
      data: { cancelledAt: now },
    }),
  );
  if (result.count === 0) {
    throw new NotFoundError("Membership not found in this gym, or already cancelled.");
  }
}

export type ExpiringMembershipSummary = {
  id: string;
  memberId: string;
  memberName: string;
  endDate: Date;
};

export type MembershipDashboardSummary = {
  activeMembers: number;
  newMembers: number;
  expiringSoon: ExpiringMembershipSummary[];
};

/**
 * Phase 8 dashboard composition (product-spec.md §11.8, §13 Rules 1, 4):
 * active-member count, new-member count for the period, and the list of
 * memberships currently EXPIRING_SOON — both Gym Admin (count) and Gym
 * Staff (list only) need the expiring list, per spec. Composes the
 * existing canonical functions (deriveMembershipStatus, activeMemberCount,
 * newMemberCount) — no second status/counting implementation.
 */
export async function gymMembershipDashboardSummary(
  context: TenantContext,
  periodStart: Date,
  periodEnd: Date,
): Promise<MembershipDashboardSummary> {
  const now = new Date();

  return withTenant(context, async (tx) => {
    const memberships = await tx.membership.findMany({
      where: { gymId: context.gymId },
      select: MEMBERSHIP_SELECT,
    });

    const expiringSoon = memberships
      .filter((m) => deriveMembershipStatus(m, now) === "EXPIRING_SOON")
      .map((m) => ({
        id: m.id,
        memberId: m.memberId,
        memberName: m.member.name,
        endDate: m.endDate,
      }));

    const members = await tx.member.findMany({
      where: { gymId: context.gymId },
      select: { joinDate: true },
    });

    return {
      activeMembers: activeMemberCount(memberships, now),
      newMembers: newMemberCount(
        members.map((m) => m.joinDate),
        periodStart,
        periodEnd,
      ),
      expiringSoon,
    };
  });
}

export type MonthlyPeriod = { start: Date; end: Date };
export type MembershipGrowthTrendPoint = MonthlyPeriod & { activeMembers: number };

/**
 * Phase 8 Analytics (product-spec.md §11.9): "membership growth" — the
 * active-member trajectory, not a bare new-joins count (per the approved
 * decision: a count of new joins alone doesn't capture churn from
 * expirations/cancellations, so it wouldn't faithfully represent
 * "growth"). One point per caller-supplied period, each computed as the
 * active-member count as of that period's end — reusing
 * activeMemberCount() with a different `now` per point, exactly as that
 * function's own signature already supports; no new pure function needed.
 * Queries every membership once, not once per period.
 *
 * deriveMembershipStatus() (Phase 4, unmodified) never checks whether
 * `now >= startDate` — every prior caller only ever evaluates it at the
 * real current instant, where a membership's startDate is always already
 * in the past, so this was never reachable before. This is the first
 * caller to evaluate status at *historical* `now` values, which can
 * legitimately precede a membership's startDate — so a not-yet-started
 * membership is filtered out here, at this call site only, rather than by
 * changing the canonical status function itself.
 */
export async function gymMembershipGrowthTrend(
  context: TenantContext,
  periods: MonthlyPeriod[],
): Promise<MembershipGrowthTrendPoint[]> {
  const memberships = await withTenant(context, (tx) =>
    tx.membership.findMany({
      where: { gymId: context.gymId },
      select: MEMBERSHIP_SELECT,
    }),
  );
  return periods.map((period) => ({
    ...period,
    activeMembers: activeMemberCount(
      memberships.filter((m) => m.startDate <= period.end),
      period.end,
    ),
  }));
}
