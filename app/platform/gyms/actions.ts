"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server/auth";
import { createGym, setGymStatus } from "@/lib/server/services/platformAdmin";
import { currentOrigin } from "@/lib/server/origin";
import { ValidationError } from "@/lib/server/errors";

export async function createGymAction(formData: FormData): Promise<void> {
  await requireRole("PLATFORM_ADMIN");

  const name = String(formData.get("name") ?? "");
  const adminEmail = String(formData.get("adminEmail") ?? "");
  const origin = await currentOrigin();

  try {
    await createGym(
      { name, adminEmail },
      `${origin}/auth/callback?next=/reset-password`,
    );
  } catch (error) {
    const message =
      error instanceof ValidationError
        ? error.message
        : "Could not create gym. The admin email may already be in use.";
    redirect(`/platform/gyms?error=${encodeURIComponent(message)}`);
  }

  redirect(`/platform/gyms?success=${encodeURIComponent("Gym created.")}`);
}

export async function suspendGymAction(formData: FormData): Promise<void> {
  await requireRole("PLATFORM_ADMIN");
  const gymId = String(formData.get("gymId") ?? "");
  await setGymStatus(gymId, "SUSPENDED");
  redirect(`/platform/gyms?success=${encodeURIComponent("Gym suspended.")}`);
}

export async function reactivateGymAction(formData: FormData): Promise<void> {
  await requireRole("PLATFORM_ADMIN");
  const gymId = String(formData.get("gymId") ?? "");
  await setGymStatus(gymId, "ACTIVE");
  redirect(`/platform/gyms?success=${encodeURIComponent("Gym reactivated.")}`);
}
