import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getAppUserPool,
  getOwnerPool,
  resetTestData,
  seedExpense,
  seedExpenseAdjustment,
  seedGym,
  seedMembership,
  seedUser,
  withRawContext,
  type SeededGym,
  type SeededUser,
} from "../helpers/testDb";
import type { Pool } from "pg";

/**
 * Phase 7: expenses and expense_adjustments — raw SQL, no application code
 * (docs/architecture.md §5.4). Same append-only shape as Phase 5's
 * payments isolation tests (app_user has literally no UPDATE/DELETE
 * privilege — a privilege-denied error, not merely an RLS rejection), plus
 * the Phase 7-specific fully-closed-to-Staff shape already verified for
 * trainers: Gym Staff gets zero rows on SELECT and is rejected by RLS on
 * INSERT, even within their own gym.
 */
describe("expenses and expense_adjustments isolation", () => {
  let owner: Pool;
  let app: Pool;
  let gymA: SeededGym;
  let gymB: SeededGym;
  let adminA: SeededUser;
  let staffA: SeededUser;
  let platformAdmin: SeededUser;
  let expenseId: string;

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
    const expense = await seedExpense(owner, {
      gymId: gymA.id,
      amountMillimes: 50000,
      recordedByUserId: adminA.id,
    });
    expenseId = expense.id;
  });

  describe("expenses", () => {
    it("Gym Admin can read own-gym expenses", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) => client.query("SELECT id FROM expenses"),
      );
      expect(result.rows.map((r) => r.id)).toEqual([expenseId]);
    });

    it("Gym Staff gets ZERO rows from expenses, even within their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) => client.query("SELECT id FROM expenses"),
      );
      expect(result.rows).toHaveLength(0);
    });

    it("cannot read another gym's expenses", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymB.id, role: "GYM_ADMIN" },
        (client) => client.query("SELECT id FROM expenses WHERE id = $1", [expenseId]),
      );
      expect(result.rows).toHaveLength(0);
    });

    it("Gym Admin CAN record an expense in their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) =>
          client.query(
            "INSERT INTO expenses (gym_id, category, amount_millimes, expense_date, recorded_by_user_id) VALUES ($1, 'rent', 10000, now(), $2)",
            [gymA.id, adminA.id],
          ),
      );
      expect(result.rowCount).toBe(1);
    });

    it("Gym Staff CANNOT record an expense (blocked by RLS)", async () => {
      await expect(
        withRawContext(app, { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" }, (client) =>
          client.query(
            "INSERT INTO expenses (gym_id, category, amount_millimes, expense_date, recorded_by_user_id) VALUES ($1, 'rent', 10000, now(), $2)",
            [gymA.id, staffA.id],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("cannot record an expense into another gym", async () => {
      await expect(
        withRawContext(app, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" }, (client) =>
          client.query(
            "INSERT INTO expenses (gym_id, category, amount_millimes, expense_date, recorded_by_user_id) VALUES ($1, 'rent', 10000, now(), $2)",
            [gymB.id, adminA.id],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("app_user has NO UPDATE privilege on expenses at all (privilege-denied, not RLS)", async () => {
      await expect(
        withRawContext(app, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" }, (client) =>
          client.query("UPDATE expenses SET amount_millimes = 1 WHERE id = $1", [expenseId]),
        ),
      ).rejects.toThrow(/permission denied for table expenses/i);
    });

    it("app_user has NO DELETE privilege on expenses at all", async () => {
      await expect(
        withRawContext(app, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" }, (client) =>
          client.query("DELETE FROM expenses WHERE id = $1", [expenseId]),
        ),
      ).rejects.toThrow(/permission denied for table expenses/i);
    });

    it("Platform Admin gets zero rows from expenses (no RLS bypass)", async () => {
      const result = await withRawContext(
        app,
        { userId: platformAdmin.id, role: "PLATFORM_ADMIN" },
        (client) => client.query("SELECT id FROM expenses"),
      );
      expect(result.rows).toHaveLength(0);
    });
  });

  describe("expense_adjustments", () => {
    it("Gym Admin CAN insert an adjustment in their own gym", async () => {
      const result = await withRawContext(
        app,
        { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
        (client) =>
          client.query(
            "INSERT INTO expense_adjustments (gym_id, expense_id, amount_millimes, recorded_by_user_id) VALUES ($1, $2, -50000, $3)",
            [gymA.id, expenseId, adminA.id],
          ),
      );
      expect(result.rowCount).toBe(1);
    });

    it("Gym Staff gets ZERO rows and CANNOT insert an adjustment", async () => {
      const readResult = await withRawContext(
        app,
        { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
        (client) => client.query("SELECT id FROM expense_adjustments"),
      );
      expect(readResult.rows).toHaveLength(0);

      await expect(
        withRawContext(app, { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" }, (client) =>
          client.query(
            "INSERT INTO expense_adjustments (gym_id, expense_id, amount_millimes, recorded_by_user_id) VALUES ($1, $2, -50000, $3)",
            [gymA.id, expenseId, staffA.id],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("app_user has NO UPDATE privilege on expense_adjustments at all", async () => {
      const adjustment = await seedExpenseAdjustment(owner, {
        gymId: gymA.id,
        expenseId,
        amountMillimes: -1000,
        recordedByUserId: adminA.id,
      });
      await expect(
        withRawContext(app, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" }, (client) =>
          client.query("UPDATE expense_adjustments SET amount_millimes = 1 WHERE id = $1", [
            adjustment.id,
          ]),
        ),
      ).rejects.toThrow(/permission denied for table expense_adjustments/i);
    });

    it("app_user has NO DELETE privilege on expense_adjustments at all", async () => {
      const adjustment = await seedExpenseAdjustment(owner, {
        gymId: gymA.id,
        expenseId,
        amountMillimes: -1000,
        recordedByUserId: adminA.id,
      });
      await expect(
        withRawContext(app, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" }, (client) =>
          client.query("DELETE FROM expense_adjustments WHERE id = $1", [adjustment.id]),
        ),
      ).rejects.toThrow(/permission denied for table expense_adjustments/i);
    });

    it("Platform Admin gets zero rows from expense_adjustments (no RLS bypass)", async () => {
      await seedExpenseAdjustment(owner, {
        gymId: gymA.id,
        expenseId,
        amountMillimes: -1000,
        recordedByUserId: adminA.id,
      });
      const result = await withRawContext(
        app,
        { userId: platformAdmin.id, role: "PLATFORM_ADMIN" },
        (client) => client.query("SELECT id FROM expense_adjustments"),
      );
      expect(result.rows).toHaveLength(0);
    });
  });
});
