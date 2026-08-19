"use server";

import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import {
  archiveMember,
  createMember,
  reactivateMember,
  updateMember,
} from "@/lib/server/services/members";
import { DuplicateMemberError, ValidationError } from "@/lib/server/errors";

function readMemberInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    joinDate: new Date(String(formData.get("joinDate") ?? "")),
    emergencyContactName:
      String(formData.get("emergencyContactName") ?? "") || undefined,
    emergencyContactPhone:
      String(formData.get("emergencyContactPhone") ?? "") || undefined,
  };
}

export async function createMemberAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  try {
    await createMember(
      { userId: session.userId, gymId, role: session.role },
      readMemberInput(formData),
    );
  } catch (error) {
    let message = "Could not create member.";
    if (error instanceof DuplicateMemberError) {
      message = `A member with this phone number already exists: ${error.existingMemberName}.`;
    } else if (error instanceof ValidationError) {
      message = error.message;
    }
    redirect(`/gym/${gymId}/members?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/members`);
}

export async function updateMemberAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  try {
    await updateMember(
      { userId: session.userId, gymId, role: session.role },
      memberId,
      readMemberInput(formData),
    );
  } catch (error) {
    let message = "Could not update member.";
    if (error instanceof DuplicateMemberError) {
      message = `A member with this phone number already exists: ${error.existingMemberName}.`;
    } else if (error instanceof ValidationError) {
      message = error.message;
    }
    redirect(
      `/gym/${gymId}/members/${memberId}/edit?error=${encodeURIComponent(message)}`,
    );
  }

  redirect(`/gym/${gymId}/members`);
}

export async function archiveMemberAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  const memberId = String(formData.get("memberId") ?? "");
  await archiveMember({ userId: session.userId, gymId, role: session.role }, memberId);
  redirect(`/gym/${gymId}/members`);
}

export async function reactivateMemberAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  const memberId = String(formData.get("memberId") ?? "");
  await reactivateMember({ userId: session.userId, gymId, role: session.role }, memberId);
  redirect(`/gym/${gymId}/members`);
}
