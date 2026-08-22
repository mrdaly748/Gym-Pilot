import "server-only";
import { withTenant, type TenantContext } from "@/lib/server/db";
import { NotFoundError, ValidationError } from "@/lib/server/errors";
import { isNonEmpty } from "@/lib/server/validation";

/**
 * Gym Admin-only membership-plan management (product-spec.md §11.2).
 * Callers (Server Actions) must call requireRole("GYM_ADMIN") first — this
 * module does not re-check the caller's role itself, matching every other
 * service in this codebase; the membership_plans_insert/update RLS policies
 * (Phase 3 migration) are the independent backstop.
 *
 * Both roles may SELECT (Gym Staff will need to see plans to eventually
 * assign them, Phase 4) — only GYM_ADMIN may write.
 */

export type PlanSummary = {
  id: string;
  name: string;
  priceMillimes: number;
  durationDays: number;
  archivedAt: Date | null;
  createdAt: Date;
};

export async function listPlans(context: TenantContext): Promise<PlanSummary[]> {
  return withTenant(context, (tx) =>
    tx.membershipPlan.findMany({
      where: { gymId: context.gymId },
      select: {
        id: true,
        name: true,
        priceMillimes: true,
        durationDays: true,
        archivedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  );
}

export async function getPlan(
  context: TenantContext,
  planId: string,
): Promise<PlanSummary | null> {
  return withTenant(context, (tx) =>
    tx.membershipPlan.findFirst({
      where: { id: planId, gymId: context.gymId },
      select: {
        id: true,
        name: true,
        priceMillimes: true,
        durationDays: true,
        archivedAt: true,
        createdAt: true,
      },
    }),
  );
}

export type PlanInput = {
  name: string;
  priceMillimes: number;
  durationDays: number;
};

function validatePlanInput(input: PlanInput): { name: string } {
  const name = input.name.trim();
  if (!isNonEmpty(name)) {
    throw new ValidationError("Plan name is required.");
  }
  if (!Number.isInteger(input.priceMillimes) || input.priceMillimes < 0) {
    throw new ValidationError("Price must be a non-negative whole number of millimes.");
  }
  if (!Number.isInteger(input.durationDays) || input.durationDays <= 0) {
    throw new ValidationError("Duration must be a positive whole number of days.");
  }
  return { name };
}

export type CreatePlanInput = PlanInput;

export async function createPlan(
  context: TenantContext,
  input: CreatePlanInput,
): Promise<{ id: string }> {
  const { name } = validatePlanInput(input);

  return withTenant(context, (tx) =>
    tx.membershipPlan.create({
      data: {
        gymId: context.gymId,
        name,
        priceMillimes: input.priceMillimes,
        durationDays: input.durationDays,
      },
      select: { id: true },
    }),
  );
}

/**
 * Edits a plan's name/price/duration. Existing memberships are unaffected —
 * price/duration/name are snapshotted onto the Membership row at assignment
 * time (see memberships.ts), so correcting a plan here never retroactively
 * changes an already-sold membership (product-spec.md §18). Mirrors
 * updateMember()/updateTrainer(): an archived plan can still be edited (the
 * same convention those two services already use — archiving only hides a
 * record from *new* selections, it doesn't freeze its own fields).
 */
export async function updatePlan(
  context: TenantContext,
  planId: string,
  input: PlanInput,
): Promise<void> {
  const { name } = validatePlanInput(input);

  const result = await withTenant(context, (tx) =>
    tx.membershipPlan.updateMany({
      where: { id: planId, gymId: context.gymId },
      data: {
        name,
        priceMillimes: input.priceMillimes,
        durationDays: input.durationDays,
      },
    }),
  );
  if (result.count === 0) {
    throw new NotFoundError("Plan not found in this gym.");
  }
}

export async function archivePlan(
  context: TenantContext,
  planId: string,
): Promise<void> {
  const result = await withTenant(context, (tx) =>
    tx.membershipPlan.updateMany({
      where: { id: planId, gymId: context.gymId, archivedAt: null },
      data: { archivedAt: new Date() },
    }),
  );
  if (result.count === 0) {
    throw new NotFoundError("Plan not found in this gym, or already archived.");
  }
}
