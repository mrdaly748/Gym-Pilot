"use server";

import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { correctCheckin, deleteCheckin, recordCheckin } from "@/lib/server/services/attendance";
import { NotFoundError, ValidationError } from "@/lib/server/errors";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ValidationError || error instanceof NotFoundError) {
    return error.message;
  }
  return fallback;
}

export async function checkInAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  const memberId = String(formData.get("memberId") ?? "");

  try {
    await recordCheckin({ userId: session.userId, gymId, role: session.role }, memberId);
  } catch (error) {
    const message = errorMessage(error, "Could not record check-in.");
    redirect(`/gym/${gymId}/attendance?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/attendance`);
}

/** Gym Admin only — requireRole enforces this here; the RLS UPDATE policy (Gym-Admin-only) enforces it independently at the database layer. */
export async function correctCheckinAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const checkinId = String(formData.get("checkinId") ?? "");
  const memberId = String(formData.get("memberId") ?? "") || undefined;

  try {
    await correctCheckin({ userId: session.userId, gymId, role: session.role }, checkinId, {
      memberId,
    });
  } catch (error) {
    const message = errorMessage(error, "Could not correct check-in.");
    redirect(`/gym/${gymId}/attendance?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/attendance`);
}

/** Gym Admin only — requireRole enforces this here; the RLS DELETE policy (Gym-Admin-only) enforces it independently at the database layer. */
export async function deleteCheckinAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const checkinId = String(formData.get("checkinId") ?? "");

  try {
    await deleteCheckin({ userId: session.userId, gymId, role: session.role }, checkinId);
  } catch (error) {
    const message = errorMessage(error, "Could not delete check-in.");
    redirect(`/gym/${gymId}/attendance?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/attendance`);
}
