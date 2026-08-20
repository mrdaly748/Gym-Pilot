"use server";

import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import {
  assignMembership,
  cancelMembership,
  freezeMembership,
  renewMembership,
  resumeMembership,
} from "@/lib/server/services/memberships";
import { NotFoundError, ValidationError } from "@/lib/server/errors";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ValidationError || error instanceof NotFoundError) {
    return error.message;
  }
  return fallback;
}

export async function assignMembershipAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  const memberId = String(formData.get("memberId") ?? "");
  const planId = String(formData.get("planId") ?? "");

  try {
    await assignMembership(
      { userId: session.userId, gymId, role: session.role },
      { memberId, planId },
    );
  } catch (error) {
    const message = errorMessage(error, "Could not assign membership.");
    redirect(`/gym/${gymId}/memberships?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/memberships?success=${encodeURIComponent("Membership assigned.")}`);
}

export async function renewMembershipAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  const membershipId = String(formData.get("membershipId") ?? "");

  try {
    await renewMembership({ userId: session.userId, gymId, role: session.role }, membershipId);
  } catch (error) {
    const message = errorMessage(error, "Could not renew membership.");
    redirect(`/gym/${gymId}/memberships?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/memberships?success=${encodeURIComponent("Membership renewed.")}`);
}

export async function freezeMembershipAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  const membershipId = String(formData.get("membershipId") ?? "");

  try {
    await freezeMembership({ userId: session.userId, gymId, role: session.role }, membershipId);
  } catch (error) {
    const message = errorMessage(error, "Could not freeze membership.");
    redirect(`/gym/${gymId}/memberships?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/memberships?success=${encodeURIComponent("Membership frozen.")}`);
}

export async function resumeMembershipAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  const membershipId = String(formData.get("membershipId") ?? "");

  try {
    await resumeMembership({ userId: session.userId, gymId, role: session.role }, membershipId);
  } catch (error) {
    const message = errorMessage(error, "Could not resume membership.");
    redirect(`/gym/${gymId}/memberships?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/memberships?success=${encodeURIComponent("Membership resumed.")}`);
}

/** Gym Admin only — requireRole enforces this here; RLS's WITH CHECK enforces it independently at the database layer too. */
export async function cancelMembershipAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const membershipId = String(formData.get("membershipId") ?? "");

  try {
    await cancelMembership({ userId: session.userId, gymId, role: session.role }, membershipId);
  } catch (error) {
    const message = errorMessage(error, "Could not cancel membership.");
    redirect(`/gym/${gymId}/memberships?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/memberships?success=${encodeURIComponent("Membership cancelled.")}`);
}
