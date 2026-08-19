"use server";

import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { archivePlan, createPlan } from "@/lib/server/services/plans";
import { ValidationError } from "@/lib/server/errors";

/**
 * Form price input is a decimal TND string (e.g. "50" or "50.500") —
 * converted to integer millimes here, at the form boundary, so the stored
 * value is always the exact integer (lib/server/schema.prisma's comment on
 * MembershipPlan.priceMillimes has the full rationale). parseFloat + round
 * is safe specifically because we round immediately to the nearest
 * millime and never accumulate a float value across operations.
 */
function parsePriceToMillimes(raw: string): number {
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? Math.round(parsed * 1000) : NaN;
}

export async function createPlanAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const name = String(formData.get("name") ?? "");
  const priceMillimes = parsePriceToMillimes(String(formData.get("price") ?? ""));
  const durationDays = Number.parseInt(String(formData.get("durationDays") ?? ""), 10);

  try {
    await createPlan(
      { userId: session.userId, gymId, role: session.role },
      { name, priceMillimes, durationDays },
    );
  } catch (error) {
    const message =
      error instanceof ValidationError ? error.message : "Could not create plan.";
    redirect(`/gym/${gymId}/memberships/plans?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/memberships/plans`);
}

export async function archivePlanAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const planId = String(formData.get("planId") ?? "");
  await archivePlan({ userId: session.userId, gymId, role: session.role }, planId);
  redirect(`/gym/${gymId}/memberships/plans`);
}
