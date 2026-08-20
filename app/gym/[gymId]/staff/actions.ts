"use server";

import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import {
  createGymStaff,
  disableGymStaff,
  enableGymStaff,
} from "@/lib/server/services/gymStaff";
import { currentOrigin } from "@/lib/server/origin";
import { ValidationError } from "@/lib/server/errors";

export async function createGymStaffAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const email = String(formData.get("email") ?? "");
  const origin = await currentOrigin();

  try {
    await createGymStaff(
      { userId: session.userId, gymId, role: session.role },
      email,
      `${origin}/auth/callback?next=/reset-password`,
    );
  } catch (error) {
    const message =
      error instanceof ValidationError
        ? error.message
        : "Could not invite staff. The email may already be in use.";
    redirect(`/gym/${gymId}/staff?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/staff?success=${encodeURIComponent("Staff invited.")}`);
}

export async function disableGymStaffAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const membershipId = String(formData.get("membershipId") ?? "");
  await disableGymStaff(
    { userId: session.userId, gymId, role: session.role },
    membershipId,
  );
  redirect(`/gym/${gymId}/staff?success=${encodeURIComponent("Staff login disabled.")}`);
}

export async function enableGymStaffAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const membershipId = String(formData.get("membershipId") ?? "");
  await enableGymStaff(
    { userId: session.userId, gymId, role: session.role },
    membershipId,
  );
  redirect(`/gym/${gymId}/staff?success=${encodeURIComponent("Staff login enabled.")}`);
}
