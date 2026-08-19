"use server";

import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import {
  archiveTrainer,
  assignTrainerToMember,
  createTrainer,
  reactivateTrainer,
  unassignTrainerFromMember,
  updateTrainer,
} from "@/lib/server/services/trainers";
import { NotFoundError, ValidationError } from "@/lib/server/errors";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ValidationError || error instanceof NotFoundError) {
    return error.message;
  }
  return fallback;
}

function readTrainerInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    contactPhone: String(formData.get("contactPhone") ?? "") || undefined,
    contactEmail: String(formData.get("contactEmail") ?? "") || undefined,
    specialty: String(formData.get("specialty") ?? "") || undefined,
  };
}

export async function createTrainerAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  try {
    await createTrainer(
      { userId: session.userId, gymId, role: session.role },
      readTrainerInput(formData),
    );
  } catch (error) {
    const message = errorMessage(error, "Could not create trainer.");
    redirect(`/gym/${gymId}/trainers?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/trainers`);
}

export async function updateTrainerAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const trainerId = String(formData.get("trainerId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  try {
    await updateTrainer(
      { userId: session.userId, gymId, role: session.role },
      trainerId,
      readTrainerInput(formData),
    );
  } catch (error) {
    const message = errorMessage(error, "Could not update trainer.");
    redirect(
      `/gym/${gymId}/trainers/${trainerId}/edit?error=${encodeURIComponent(message)}`,
    );
  }

  redirect(`/gym/${gymId}/trainers`);
}

export async function archiveTrainerAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const trainerId = String(formData.get("trainerId") ?? "");
  await archiveTrainer({ userId: session.userId, gymId, role: session.role }, trainerId);
  redirect(`/gym/${gymId}/trainers`);
}

export async function reactivateTrainerAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const trainerId = String(formData.get("trainerId") ?? "");
  await reactivateTrainer({ userId: session.userId, gymId, role: session.role }, trainerId);
  redirect(`/gym/${gymId}/trainers`);
}

export async function assignTrainerAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const trainerId = String(formData.get("trainerId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");

  try {
    await assignTrainerToMember(
      { userId: session.userId, gymId, role: session.role },
      trainerId,
      memberId,
    );
  } catch (error) {
    const message = errorMessage(error, "Could not assign trainer.");
    redirect(`/gym/${gymId}/trainers?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/trainers`);
}

export async function unassignTrainerAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const trainerId = String(formData.get("trainerId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  await unassignTrainerFromMember(
    { userId: session.userId, gymId, role: session.role },
    trainerId,
    memberId,
  );
  redirect(`/gym/${gymId}/trainers`);
}
