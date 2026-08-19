import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getAppUserPool,
  getOwnerPool,
  resetTestData,
  seedGym,
  seedMember,
  seedMembership,
  seedTrainer,
  seedTrainerMemberLink,
  seedUser,
  withRawContext,
  type SeededGym,
  type SeededMember,
  type SeededTrainer,
  type SeededUser,
} from "../helpers/testDb";
import type { Pool } from "pg";

/**
 * Phase 7: trainers and trainer_member_links — raw SQL, no application code
 * (docs/architecture.md §5.4). Unlike every prior table, Gym Staff has NO
 * SELECT policy at all here, not just a restricted write policy — verified
 * directly: a Staff session gets zero rows on SELECT even within their own
 * gym, and is rejected by RLS on INSERT, exactly like Platform Admin is
 * rejected everywhere else in this project.
 */
describe("trainers and trainer_member_links isolation", () => {
  let owner: Pool;
  let app: Pool;
  let gymA: SeededGym;
  let gymB: SeededGym;
  let adminA: SeededUser;
  let staffA: SeededUser;
  let platformAdmin: SeededUser;
  let memberA: SeededMember;
  let trainer: SeededTrainer;

  beforeAll(() => {
    owner = getOwnerPool();
    app = getAppUserPool();
  });

  afterAll(async () => {
    await owner.end();
    await app.end();
  });

  beforeEach(async () => {
    await resetTestData(owner);
    gymA = await seedGym(owner, "Gym A");
    gymB = await seedGym(owner, "Gym B");
    adminA = await seedUser(owner, "admin-a@test.local");
    staffA = await seedUser(owner, "staff-a@test.local");
    platformAdmin = await seedUser(owner, "platform-admin@test.local");
    await seedMembership(owner, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" });
    await seedMembership(owner, { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" });
    await seedMembership(owner, { userId: platformAdmin.id, gymId: null, role: "PLATFORM_ADMIN" });
    memberA = await seedMember(owner, {
      gymId: gymA.id,
      name: "Member A",
      phone: "20123456",
      phoneNormalized: "20123456",
    });
    trainer = await seedTrainer(owner, { gymId: gymA.id, name: "Coach Sam" });
  });

  describe("trainers", () => {
    it("Gym Admin can read own-gym trainers", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) => client.query("SELECT id FROM trainers"),
      );
      expect(result.rows.map((r) => r.id)).toEqual([trainer.id]);
    });

    it("Gym Staff gets ZERO rows from trainers, even within their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) => client.query("SELECT id FROM trainers"),
      );
      expect(result.rows).toHaveLength(0);
    });

    it("cannot read another gym's trainers", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymB.id, role: "GYM_ADMIN" },
        (client) => client.query("SELECT id FROM trainers WHERE id = $1", [trainer.id]),
      );
      expect(result.rows).toHaveLength(0);
    });

    it("Gym Admin CAN insert a trainer in their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) =>
          client.query("INSERT INTO trainers (gym_id, name) VALUES ($1, 'New Coach')", [gymA.id]),
      );
      expect(result.rowCount).toBe(1);
    });

    it("Gym Staff CANNOT insert a trainer (blocked by RLS)", async () => {
      await expect(
        withRawContext(app, { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" }, (client) =>
          client.query("INSERT INTO trainers (gym_id, name) VALUES ($1, 'New Coach')", [gymA.id]),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("cannot insert a trainer into another gym", async () => {
      await expect(
        withRawContext(app, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" }, (client) =>
          client.query("INSERT INTO trainers (gym_id, name) VALUES ($1, 'New Coach')", [gymB.id]),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("Gym Admin CAN update (archive) a trainer in their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) => client.query("UPDATE trainers SET archived_at = now() WHERE id = $1", [trainer.id]),
      );
      expect(result.rowCount).toBe(1);
    });

    it("Gym Staff CANNOT update a trainer", async () => {
      const result = await withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) => client.query("UPDATE trainers SET archived_at = now() WHERE id = $1", [trainer.id]),
      );
      expect(result.rowCount).toBe(0);
    });

    it("app_user has NO DELETE privilege on trainers at all", async () => {
      await expect(
        withRawContext(app, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" }, (client) =>
          client.query("DELETE FROM trainers WHERE id = $1", [trainer.id]),
        ),
      ).rejects.toThrow(/permission denied for table trainers/i);
    });

    it("Platform Admin gets zero rows from trainers (no RLS bypass)", async () => {
      const result = await withRawContext(
        app,
        { userId: platformAdmin.id, role: "PLATFORM_ADMIN" },
        (client) => client.query("SELECT id FROM trainers"),
      );
      expect(result.rows).toHaveLength(0);
    });
  });

  describe("trainer_member_links", () => {
    it("Gym Admin CAN insert a link in their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) =>
          client.query(
            "INSERT INTO trainer_member_links (gym_id, trainer_id, member_id) VALUES ($1, $2, $3)",
            [gymA.id, trainer.id, memberA.id],
          ),
      );
      expect(result.rowCount).toBe(1);
    });

    it("Gym Staff gets ZERO rows and CANNOT insert a link", async () => {
      const readResult = await withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) => client.query("SELECT id FROM trainer_member_links"),
      );
      expect(readResult.rows).toHaveLength(0);

      await expect(
        withRawContext(app, { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" }, (client) =>
          client.query(
            "INSERT INTO trainer_member_links (gym_id, trainer_id, member_id) VALUES ($1, $2, $3)",
            [gymA.id, trainer.id, memberA.id],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("the database rejects a duplicate trainer-member link via its own unique constraint", async () => {
      await seedTrainerMemberLink(owner, { gymId: gymA.id, trainerId: trainer.id, memberId: memberA.id });
      await expect(
        owner.query(
          "INSERT INTO trainer_member_links (gym_id, trainer_id, member_id) VALUES ($1, $2, $3)",
          [gymA.id, trainer.id, memberA.id],
        ),
      ).rejects.toThrow(/duplicate key value/i);
    });

    it("Gym Admin CAN delete (unassign) a link in their own gym", async () => {
      const link = await seedTrainerMemberLink(owner, {
        gymId: gymA.id,
        trainerId: trainer.id,
        memberId: memberA.id,
      });
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) => client.query("DELETE FROM trainer_member_links WHERE id = $1", [link.id]),
      );
      expect(result.rowCount).toBe(1);
    });

    it("Gym Staff CANNOT delete a link", async () => {
      const link = await seedTrainerMemberLink(owner, {
        gymId: gymA.id,
        trainerId: trainer.id,
        memberId: memberA.id,
      });
      const result = await withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) => client.query("DELETE FROM trainer_member_links WHERE id = $1", [link.id]),
      );
      expect(result.rowCount).toBe(0);
    });

    it("cross-gym DELETE cannot affect another gym's link", async () => {
      const link = await seedTrainerMemberLink(owner, {
        gymId: gymA.id,
        trainerId: trainer.id,
        memberId: memberA.id,
      });
      const adminB = await seedUser(owner, "admin-b@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      const result = await withRawContext(
        app,
        { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" },
        (client) => client.query("DELETE FROM trainer_member_links WHERE id = $1", [link.id]),
      );
      expect(result.rowCount).toBe(0);
    });

    it("Platform Admin gets zero rows from trainer_member_links (no RLS bypass)", async () => {
      await seedTrainerMemberLink(owner, { gymId: gymA.id, trainerId: trainer.id, memberId: memberA.id });
      const result = await withRawContext(
        app,
        { userId: platformAdmin.id, role: "PLATFORM_ADMIN" },
        (client) => client.query("SELECT id FROM trainer_member_links"),
      );
      expect(result.rows).toHaveLength(0);
    });
  });
});
