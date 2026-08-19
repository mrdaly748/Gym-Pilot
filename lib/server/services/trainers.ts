import "server-only";
import { withTenant, type TenantContext } from "@/lib/server/db";
import { NotFoundError, ValidationError } from "@/lib/server/errors";
import { isNonEmpty } from "@/lib/server/validation";

/**
 * Gym-Admin-only trainer directory (product-spec.md §11.6) — callers
 * (Server Actions) call requireGym(gymId) + requireRole("GYM_ADMIN") first;
 * this module does not re-check the caller's role itself, matching every
 * other service. Unlike members.ts/payments.ts, there is no Gym-Staff
 * branch anywhere here — Gym Staff has zero access to trainer data, at the
 * service layer and (independently) at the RLS layer.
 *
 * Archiving follows the same idiom as Member/MembershipPlan: archivedAt
 * hides a trainer from new selections/assignments while every existing
 * TrainerMemberLink is preserved untouched (product-spec.md §13 Rule 12).
 */

export type TrainerSummary = {
  id: string;
  name: string;
  contactPhone: string | null;
  contactEmail: string | null;
  specialty: string | null;
  archivedAt: Date | null;
  createdAt: Date;
};

const TRAINER_SELECT = {
  id: true,
  name: true,
  contactPhone: true,
  contactEmail: true,
  specialty: true,
  archivedAt: true,
  createdAt: true,
} as const;

export async function listTrainers(
  context: TenantContext,
  opts?: { includeArchived?: boolean },
): Promise<TrainerSummary[]> {
  return withTenant(context, (tx) =>
    tx.trainer.findMany({
      where: {
        gymId: context.gymId,
        ...(opts?.includeArchived ? {} : { archivedAt: null }),
      },
      select: TRAINER_SELECT,
      orderBy: { createdAt: "desc" },
    }),
  );
}

export async function getTrainer(
  context: TenantContext,
  trainerId: string,
): Promise<TrainerSummary | null> {
  return withTenant(context, (tx) =>
    tx.trainer.findFirst({
      where: { id: trainerId, gymId: context.gymId },
      select: TRAINER_SELECT,
    }),
  );
}

export type TrainerInput = {
  name: string;
  contactPhone?: string;
  contactEmail?: string;
  specialty?: string;
};

function validateTrainerInput(input: TrainerInput): string {
  const name = input.name.trim();
  if (!isNonEmpty(name)) {
    throw new ValidationError("Trainer name is required.");
  }
  return name;
}

export async function createTrainer(
  context: TenantContext,
  input: TrainerInput,
): Promise<{ id: string }> {
  const name = validateTrainerInput(input);
  return withTenant(context, (tx) =>
    tx.trainer.create({
      data: {
        gymId: context.gymId,
        name,
        contactPhone: input.contactPhone?.trim() || null,
        contactEmail: input.contactEmail?.trim() || null,
        specialty: input.specialty?.trim() || null,
      },
      select: { id: true },
    }),
  );
}

export async function updateTrainer(
  context: TenantContext,
  trainerId: string,
  input: TrainerInput,
): Promise<void> {
  const name = validateTrainerInput(input);
  const result = await withTenant(context, (tx) =>
    tx.trainer.updateMany({
      where: { id: trainerId, gymId: context.gymId },
      data: {
        name,
        contactPhone: input.contactPhone?.trim() || null,
        contactEmail: input.contactEmail?.trim() || null,
        specialty: input.specialty?.trim() || null,
      },
    }),
  );
  if (result.count === 0) {
    throw new NotFoundError("Trainer not found in this gym.");
  }
}

async function setTrainerArchived(
  context: TenantContext,
  trainerId: string,
  archived: boolean,
): Promise<void> {
  const result = await withTenant(context, (tx) =>
    tx.trainer.updateMany({
      where: { id: trainerId, gymId: context.gymId },
      data: { archivedAt: archived ? new Date() : null },
    }),
  );
  if (result.count === 0) {
    throw new NotFoundError("Trainer not found in this gym.");
  }
}

export async function archiveTrainer(
  context: TenantContext,
  trainerId: string,
): Promise<void> {
  return setTrainerArchived(context, trainerId, true);
}

export async function reactivateTrainer(
  context: TenantContext,
  trainerId: string,
): Promise<void> {
  return setTrainerArchived(context, trainerId, false);
}

/**
 * Links a trainer to a member — many-to-many (product-spec.md §11.6: "one
 * or more members" per trainer; nothing restricts a member to a single
 * trainer). Rejects an archived trainer (Rule 12: archived trainers are
 * excluded from new assignments) and rejects a duplicate link — checked
 * here for a clear ValidationError, backed independently by the database's
 * own unique constraint on (trainerId, memberId).
 */
export async function assignTrainerToMember(
  context: TenantContext,
  trainerId: string,
  memberId: string,
): Promise<{ id: string }> {
  return withTenant(context, async (tx) => {
    const trainer = await tx.trainer.findFirst({
      where: { id: trainerId, gymId: context.gymId },
    });
    if (!trainer) {
      throw new NotFoundError("Trainer not found in this gym.");
    }
    if (trainer.archivedAt) {
      throw new ValidationError("Cannot assign an archived trainer.");
    }

    const member = await tx.member.findFirst({
      where: { id: memberId, gymId: context.gymId },
    });
    if (!member) {
      throw new NotFoundError("Member not found in this gym.");
    }

    const existing = await tx.trainerMemberLink.findFirst({
      where: { trainerId, memberId, gymId: context.gymId },
    });
    if (existing) {
      throw new ValidationError("This trainer is already linked to this member.");
    }

    return tx.trainerMemberLink.create({
      data: { gymId: context.gymId, trainerId, memberId },
      select: { id: true },
    });
  });
}

export async function unassignTrainerFromMember(
  context: TenantContext,
  trainerId: string,
  memberId: string,
): Promise<void> {
  const result = await withTenant(context, (tx) =>
    tx.trainerMemberLink.deleteMany({
      where: { trainerId, memberId, gymId: context.gymId },
    }),
  );
  if (result.count === 0) {
    throw new NotFoundError("Trainer-member link not found in this gym.");
  }
}

export type TrainerMemberSummary = { memberId: string; memberName: string };

export async function listMembersForTrainer(
  context: TenantContext,
  trainerId: string,
): Promise<TrainerMemberSummary[]> {
  const rows = await withTenant(context, (tx) =>
    tx.trainerMemberLink.findMany({
      where: { trainerId, gymId: context.gymId },
      select: { memberId: true, member: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  );
  return rows.map((r) => ({ memberId: r.memberId, memberName: r.member.name }));
}

export type MemberTrainerSummary = { trainerId: string; trainerName: string };

export async function listTrainersForMember(
  context: TenantContext,
  memberId: string,
): Promise<MemberTrainerSummary[]> {
  const rows = await withTenant(context, (tx) =>
    tx.trainerMemberLink.findMany({
      where: { memberId, gymId: context.gymId },
      select: { trainerId: true, trainer: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  );
  return rows.map((r) => ({ trainerId: r.trainerId, trainerName: r.trainer.name }));
}
