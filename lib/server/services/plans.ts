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

export type CreatePlanInput = {
  name: string;
  priceMillimes: number;
  durationDays: number;
};

export async function createPlan(
  context: TenantContext,
  input: CreatePlanInput,
): Promise<{ id: string }> {
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
