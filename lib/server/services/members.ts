import "server-only";
import { withTenant, type TenantContext } from "@/lib/server/db";
import { Prisma } from "@/lib/server/generated/prisma-client/client";
import { DuplicateMemberError, NotFoundError, ValidationError } from "@/lib/server/errors";
import { isNonEmpty, memberSearchWhereClause, normalizePhone } from "@/lib/server/validation";

/**
 * Gym Admin + Gym Staff member management (product-spec.md §11.1). Both
 * roles may create/edit/archive/reactivate — callers (Server Actions) must
 * call requireGym(gymId) + requireRole("GYM_ADMIN", "GYM_STAFF") first, the
 * same guard the gym layout itself already applies by default.
 */

export type MemberSummary = {
  id: string;
  name: string;
  phone: string;
  joinDate: Date;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  archivedAt: Date | null;
  createdAt: Date;
};

export async function getMember(
  context: TenantContext,
  memberId: string,
): Promise<MemberSummary | null> {
  return withTenant(context, (tx) =>
    tx.member.findFirst({
      where: { id: memberId, gymId: context.gymId },
      select: {
        id: true,
        name: true,
        phone: true,
        joinDate: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        archivedAt: true,
        createdAt: true,
      },
    }),
  );
}

export async function listMembers(
  context: TenantContext,
  opts?: { q?: string },
): Promise<MemberSummary[]> {
  const q = opts?.q?.trim();
  return withTenant(context, (tx) =>
    tx.member.findMany({
      where: {
        gymId: context.gymId,
        ...(q ? memberSearchWhereClause(q) : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        joinDate: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        archivedAt: true,
        createdAt: true,
      },
      // Search results read best alphabetically; the default (unfiltered)
      // list keeps its existing newest-first order so every other caller's
      // behavior is unchanged.
      orderBy: q ? { name: "asc" } : { createdAt: "desc" },
    }),
  );
}

export type MemberInput = {
  name: string;
  phone: string;
  joinDate: Date;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
};

/**
 * Checks for a normalized-phone match in this gym — including archived
 * members, per product-spec.md §18's "returning member" edge case (a
 * long-absent member should be matched/reactivated on their existing
 * record, not silently duplicated). `excludeMemberId` lets updateMember()
 * re-run this check without matching itself.
 */
async function findDuplicateByPhone(
  context: TenantContext,
  phoneNormalized: string,
  excludeMemberId?: string,
): Promise<{ id: string; name: string } | null> {
  return withTenant(context, (tx) =>
    tx.member.findFirst({
      where: {
        gymId: context.gymId,
        phoneNormalized,
        ...(excludeMemberId ? { id: { not: excludeMemberId } } : {}),
      },
      select: { id: true, name: true },
    }),
  );
}

/**
 * The pre-check in createMember()/updateMember() (findDuplicateByPhone) is
 * not atomic on its own — two concurrent calls for the same phone number
 * could both pass it before either commits. members_gym_id_phone_normalized_key
 * (prisma/migrations/20260826090000_members_unique_phone_per_gym) is the
 * actual, final authority: Postgres rejects the losing INSERT/UPDATE with
 * P2002, and this re-derives the same DuplicateMemberError the pre-check
 * would have thrown, so callers never see a difference between "caught
 * early" and "caught by the database" (same pattern as
 * attendance.ts's recordCheckin()).
 */
async function rethrowAsDuplicateMemberError(
  context: TenantContext,
  phoneNormalized: string,
  excludeMemberId: string | undefined,
  error: unknown,
): Promise<never> {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const raceDuplicate = await findDuplicateByPhone(context, phoneNormalized, excludeMemberId);
    if (raceDuplicate) {
      throw new DuplicateMemberError(raceDuplicate.id, raceDuplicate.name);
    }
  }
  throw error;
}

function validateMemberInput(input: MemberInput): { name: string; phoneNormalized: string } {
  const name = input.name.trim();
  if (!isNonEmpty(name)) {
    throw new ValidationError("Member name is required.");
  }
  const phoneNormalized = normalizePhone(input.phone);
  if (!isNonEmpty(phoneNormalized)) {
    throw new ValidationError("A valid phone number is required.");
  }
  return { name, phoneNormalized };
}

export async function createMember(
  context: TenantContext,
  input: MemberInput,
): Promise<{ id: string }> {
  const { name, phoneNormalized } = validateMemberInput(input);

  const duplicate = await findDuplicateByPhone(context, phoneNormalized);
  if (duplicate) {
    throw new DuplicateMemberError(duplicate.id, duplicate.name);
  }

  try {
    return await withTenant(context, (tx) =>
      tx.member.create({
        data: {
          gymId: context.gymId,
          name,
          phone: input.phone.trim(),
          phoneNormalized,
          joinDate: input.joinDate,
          emergencyContactName: input.emergencyContactName?.trim() || null,
          emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
        },
        select: { id: true },
      }),
    );
  } catch (error) {
    return rethrowAsDuplicateMemberError(context, phoneNormalized, undefined, error);
  }
}

export async function updateMember(
  context: TenantContext,
  memberId: string,
  input: MemberInput,
): Promise<void> {
  const { name, phoneNormalized } = validateMemberInput(input);

  const duplicate = await findDuplicateByPhone(context, phoneNormalized, memberId);
  if (duplicate) {
    throw new DuplicateMemberError(duplicate.id, duplicate.name);
  }

  let result: { count: number };
  try {
    result = await withTenant(context, (tx) =>
      tx.member.updateMany({
        where: { id: memberId, gymId: context.gymId },
        data: {
          name,
          phone: input.phone.trim(),
          phoneNormalized,
          joinDate: input.joinDate,
          emergencyContactName: input.emergencyContactName?.trim() || null,
          emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
        },
      }),
    );
  } catch (error) {
    return rethrowAsDuplicateMemberError(context, phoneNormalized, memberId, error);
  }
  if (result.count === 0) {
    throw new NotFoundError("Member not found in this gym.");
  }
}

async function setMemberArchived(
  context: TenantContext,
  memberId: string,
  archived: boolean,
): Promise<void> {
  const result = await withTenant(context, (tx) =>
    tx.member.updateMany({
      where: { id: memberId, gymId: context.gymId },
      data: { archivedAt: archived ? new Date() : null },
    }),
  );
  if (result.count === 0) {
    throw new NotFoundError("Member not found in this gym.");
  }
}

export async function archiveMember(
  context: TenantContext,
  memberId: string,
): Promise<void> {
  return setMemberArchived(context, memberId, true);
}

export async function reactivateMember(
  context: TenantContext,
  memberId: string,
): Promise<void> {
  return setMemberArchived(context, memberId, false);
}
