import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  getOwnerPool,
  resetTestData,
  seedGym,
  seedMember,
  seedMembership,
  seedTrainer,
  seedUser,
  type SeededGym,
  type SeededMember,
  type SeededTrainer,
  type SeededUser,
} from "../helpers/testDb";
import { prisma } from "@/lib/server/db";
import {
  archiveTrainer,
  assignTrainerToMember,
  createTrainer,
  getTrainer,
  listMembersForTrainer,
  listTrainers,
  listTrainersForMember,
  reactivateTrainer,
  unassignTrainerFromMember,
  updateTrainer,
} from "@/lib/server/services/trainers";
import { NotFoundError, ValidationError } from "@/lib/server/errors";

describe("Phase 7 trainers service", () => {
  let owner: Pool;
  let gymA: SeededGym;
  let gymB: SeededGym;
  let adminA: SeededUser;
  let memberA: SeededMember;

  beforeAll(() => {
    owner = getOwnerPool();
  });

  afterAll(async () => {
    await owner.end();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetTestData(owner);
    gymA = await seedGym(owner, "Gym A");
    gymB = await seedGym(owner, "Gym B");
    adminA = await seedUser(owner, "admin-a@test.local");
    await seedMembership(owner, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" });
    memberA = await seedMember(owner, {
      gymId: gymA.id,
      name: "Ali",
      phone: "20123456",
      phoneNormalized: "20123456",
    });
  });

  const adminContext = () => ({ userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" as const });

  describe("trainer CRUD", () => {
    it("creates, lists, and updates a trainer", async () => {
      const { id } = await createTrainer(adminContext(), {
        name: "Coach Sam",
        contactPhone: "20111111",
        specialty: "Strength",
      });
      const [row] = await listTrainers(adminContext());
      expect(row.id).toBe(id);
      expect(row.name).toBe("Coach Sam");
      expect(row.specialty).toBe("Strength");

      await updateTrainer(adminContext(), id, { name: "Coach Samir", specialty: "Powerlifting" });
      const updated = await getTrainer(adminContext(), id);
      expect(updated?.name).toBe("Coach Samir");
      expect(updated?.specialty).toBe("Powerlifting");
    });

    it("rejects an empty name", async () => {
      await expect(
        createTrainer(adminContext(), { name: "   " }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects updating a trainer that doesn't exist in this gym", async () => {
      await expect(
        updateTrainer(adminContext(), "00000000-0000-0000-0000-000000000000", { name: "X" }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("trainer archival", () => {
    let trainer: SeededTrainer;

    beforeEach(async () => {
      trainer = await seedTrainer(owner, { gymId: gymA.id, name: "Coach Sam" });
    });

    it("archiving excludes a trainer from the active list but not from direct lookup", async () => {
      await archiveTrainer(adminContext(), trainer.id);

      const active = await listTrainers(adminContext());
      expect(active).toHaveLength(0);

      const all = await listTrainers(adminContext(), { includeArchived: true });
      expect(all).toHaveLength(1);
      expect(all[0].archivedAt).not.toBeNull();

      const direct = await getTrainer(adminContext(), trainer.id);
      expect(direct?.archivedAt).not.toBeNull();
    });

    it("reactivating restores a trainer to the active list", async () => {
      await archiveTrainer(adminContext(), trainer.id);
      await reactivateTrainer(adminContext(), trainer.id);

      const active = await listTrainers(adminContext());
      expect(active).toHaveLength(1);
      expect(active[0].archivedAt).toBeNull();
    });

    it("archiving a trainer preserves their existing member links", async () => {
      await assignTrainerToMember(adminContext(), trainer.id, memberA.id);
      await archiveTrainer(adminContext(), trainer.id);

      const members = await listMembersForTrainer(adminContext(), trainer.id);
      expect(members).toHaveLength(1);
      expect(members[0].memberId).toBe(memberA.id);
    });

    it("rejects archiving a trainer from another gym (app-layer scoping)", async () => {
      const adminB = await seedUser(owner, "admin-b-archive-trainer@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      await expect(
        archiveTrainer({ userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" }, trainer.id),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects archiving an unknown trainer id", async () => {
      await expect(
        archiveTrainer(adminContext(), "00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects reactivating a trainer from another gym (app-layer scoping)", async () => {
      await archiveTrainer(adminContext(), trainer.id);
      const adminB = await seedUser(owner, "admin-b-reactivate-trainer@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      await expect(
        reactivateTrainer({ userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" }, trainer.id),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects reactivating an unknown trainer id", async () => {
      await expect(
        reactivateTrainer(adminContext(), "00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("member-trainer association", () => {
    let trainer: SeededTrainer;

    beforeEach(async () => {
      trainer = await seedTrainer(owner, { gymId: gymA.id, name: "Coach Sam" });
    });

    it("assigns and lists a trainer for a member, and a member for a trainer", async () => {
      await assignTrainerToMember(adminContext(), trainer.id, memberA.id);

      const membersForTrainer = await listMembersForTrainer(adminContext(), trainer.id);
      expect(membersForTrainer.map((m) => m.memberId)).toEqual([memberA.id]);

      const trainersForMember = await listTrainersForMember(adminContext(), memberA.id);
      expect(trainersForMember.map((t) => t.trainerId)).toEqual([trainer.id]);
    });

    it("a member can be linked to multiple trainers, and a trainer to multiple members", async () => {
      const trainer2 = await seedTrainer(owner, { gymId: gymA.id, name: "Coach Lea" });
      const memberB = await seedMember(owner, {
        gymId: gymA.id,
        name: "Sami",
        phone: "20999999",
        phoneNormalized: "20999999",
      });

      await assignTrainerToMember(adminContext(), trainer.id, memberA.id);
      await assignTrainerToMember(adminContext(), trainer2.id, memberA.id);
      await assignTrainerToMember(adminContext(), trainer.id, memberB.id);

      expect((await listTrainersForMember(adminContext(), memberA.id))).toHaveLength(2);
      expect((await listMembersForTrainer(adminContext(), trainer.id))).toHaveLength(2);
    });

    it("rejects a duplicate trainer-member link", async () => {
      await assignTrainerToMember(adminContext(), trainer.id, memberA.id);
      await expect(
        assignTrainerToMember(adminContext(), trainer.id, memberA.id),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects assigning an archived trainer", async () => {
      await archiveTrainer(adminContext(), trainer.id);
      await expect(
        assignTrainerToMember(adminContext(), trainer.id, memberA.id),
      ).rejects.toThrow(ValidationError);
    });

    it("unassigns a trainer from a member", async () => {
      await assignTrainerToMember(adminContext(), trainer.id, memberA.id);
      await unassignTrainerFromMember(adminContext(), trainer.id, memberA.id);

      expect(await listMembersForTrainer(adminContext(), trainer.id)).toHaveLength(0);
    });

    it("rejects unassigning a link that doesn't exist", async () => {
      await expect(
        unassignTrainerFromMember(adminContext(), trainer.id, memberA.id),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects linking a trainer and member from different gyms", async () => {
      const memberB = await seedMember(owner, {
        gymId: gymB.id,
        name: "Cross-gym member",
        phone: "20888888",
        phoneNormalized: "20888888",
      });
      await expect(
        assignTrainerToMember(adminContext(), trainer.id, memberB.id),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects a trainer from another gym, even against a member in the caller's own gym", async () => {
      const trainerB = await seedTrainer(owner, { gymId: gymB.id, name: "Coach B" });
      await expect(
        assignTrainerToMember(adminContext(), trainerB.id, memberA.id),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects unassigning a trainer-member link that belongs to another gym", async () => {
      await assignTrainerToMember(adminContext(), trainer.id, memberA.id);
      const adminB = await seedUser(owner, "admin-b-unassign@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      await expect(
        unassignTrainerFromMember(
          { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" },
          trainer.id,
          memberA.id,
        ),
      ).rejects.toThrow(NotFoundError);

      // The link must still exist in gym A — the cross-gym attempt did nothing.
      expect(await listMembersForTrainer(adminContext(), trainer.id)).toHaveLength(1);
    });
  });

  describe("tenant isolation at the service layer", () => {
    it("a gym cannot list another gym's trainers", async () => {
      await seedTrainer(owner, { gymId: gymA.id, name: "Coach Sam" });
      const adminB = await seedUser(owner, "admin-b@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      const gymBTrainers = await listTrainers({ userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });
      expect(gymBTrainers).toHaveLength(0);
    });
  });
});
