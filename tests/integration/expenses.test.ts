import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  getOwnerPool,
  resetTestData,
  seedGym,
  seedMembership,
  seedUser,
  type SeededGym,
  type SeededUser,
} from "../helpers/testDb";
import { prisma } from "@/lib/server/db";
import {
  adjustExpense,
  gymExpensesForPeriod,
  gymExpensesTrend,
  listExpenses,
  recordExpense,
  voidExpense,
} from "@/lib/server/services/expenses";
import { NotFoundError, ValidationError } from "@/lib/server/errors";

describe("Phase 7 expenses service", () => {
  let owner: Pool;
  let gymA: SeededGym;
  let gymB: SeededGym;
  let adminA: SeededUser;

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
  });

  const adminContext = () => ({ userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" as const });

  describe("recordExpense", () => {
    it("Gym Admin can record an expense, recording who did it", async () => {
      const { id } = await recordExpense(adminContext(), {
        category: "rent",
        amountMillimes: 500000,
        expenseDate: new Date("2026-03-01"),
      });
      const [row] = await listExpenses(adminContext());
      expect(row.id).toBe(id);
      expect(row.recordedByEmail).toBe("admin-a@test.local");
      expect(row.effectiveAmountMillimes).toBe(500000);
    });

    it("rejects an invalid category", async () => {
      await expect(
        recordExpense(adminContext(), {
          category: "not-a-real-category",
          amountMillimes: 1000,
          expenseDate: new Date(),
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects a non-positive amount", async () => {
      await expect(
        recordExpense(adminContext(), {
          category: "rent",
          amountMillimes: 0,
          expenseDate: new Date(),
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("adjustExpense — append-only, Gym Admin only", () => {
    it("creates a new row referencing the original, never mutates it", async () => {
      const { id: expenseId } = await recordExpense(adminContext(), {
        category: "equipment",
        amountMillimes: 100000,
        expenseDate: new Date(),
      });
      await adjustExpense(adminContext(), expenseId, {
        amountMillimes: -20000,
        reason: "partial refund from supplier",
      });

      const [row] = await listExpenses(adminContext());
      expect(row.amountMillimes).toBe(100000); // original untouched
      expect(row.effectiveAmountMillimes).toBe(80000);
      expect(row.adjustments).toHaveLength(1);
      expect(row.adjustments[0].reason).toBe("partial refund from supplier");
      expect(row.adjustments[0].recordedByEmail).toBe("admin-a@test.local");
    });

    it("a full void is a negative adjustment equal to the effective amount — no separate void operation exists", async () => {
      const { id: expenseId } = await recordExpense(adminContext(), {
        category: "marketing",
        amountMillimes: 50000,
        expenseDate: new Date(),
      });
      await adjustExpense(adminContext(), expenseId, { amountMillimes: -50000, reason: "void" });

      const [row] = await listExpenses(adminContext());
      expect(row.effectiveAmountMillimes).toBe(0);
      expect(row.amountMillimes).toBe(50000); // the original expense row itself is never altered
    });

    it("rejects a zero-amount adjustment", async () => {
      const { id: expenseId } = await recordExpense(adminContext(), {
        category: "other",
        amountMillimes: 10000,
        expenseDate: new Date(),
      });
      await expect(
        adjustExpense(adminContext(), expenseId, { amountMillimes: 0 }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects adjusting an expense that doesn't exist in this gym", async () => {
      await expect(
        adjustExpense(adminContext(), "00000000-0000-0000-0000-000000000000", {
          amountMillimes: -100,
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // MVP audit finding: voidExpenseAction previously trusted a client-supplied
  // effectiveAmountMillimes, so a stale page (or a concurrent adjustment
  // applied after the page rendered but before Void was clicked) could make
  // a "void" over- or under-correct instead of exactly zeroing the balance.
  // voidExpense() now recomputes the effective amount from the database
  // inside its own transaction — mirrors payments.test.ts's voidPayment
  // coverage exactly.
  describe("voidExpense — recomputes the effective amount server-side, never trusts a client amount", () => {
    it("zeroes the effective amount exactly, even after a prior adjustment changed it from what a stale page would have shown", async () => {
      const { id: expenseId } = await recordExpense(adminContext(), {
        category: "equipment",
        amountMillimes: 100000,
        expenseDate: new Date(),
      });
      await adjustExpense(adminContext(), expenseId, {
        amountMillimes: -20000,
        reason: "partial refund from supplier",
      });

      await voidExpense(adminContext(), expenseId);

      const [row] = await listExpenses(adminContext());
      expect(row.effectiveAmountMillimes).toBe(0);
      expect(row.amountMillimes).toBe(100000); // the original expense row itself is never altered
      expect(row.adjustments).toHaveLength(2); // the earlier adjustment, plus the void
    });

    it("zeroes an expense with no prior adjustments", async () => {
      const { id: expenseId } = await recordExpense(adminContext(), {
        category: "rent",
        amountMillimes: 30000,
        expenseDate: new Date(),
      });

      await voidExpense(adminContext(), expenseId);

      const [row] = await listExpenses(adminContext());
      expect(row.effectiveAmountMillimes).toBe(0);
    });

    it("rejects voiding an expense that is already fully voided", async () => {
      const { id: expenseId } = await recordExpense(adminContext(), {
        category: "other",
        amountMillimes: 50000,
        expenseDate: new Date(),
      });
      await voidExpense(adminContext(), expenseId);

      await expect(voidExpense(adminContext(), expenseId)).rejects.toThrow(ValidationError);
    });

    it("rejects voiding an expense that doesn't exist in this gym", async () => {
      await expect(
        voidExpense(adminContext(), "00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundError);
    });

    it("a gym cannot void another gym's expense", async () => {
      const { id: expenseId } = await recordExpense(adminContext(), {
        category: "rent",
        amountMillimes: 50000,
        expenseDate: new Date(),
      });
      const adminB = await seedUser(owner, "admin-b-void@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      await expect(
        voidExpense({ userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" }, expenseId),
      ).rejects.toThrow(NotFoundError);

      const [row] = await listExpenses(adminContext());
      expect(row.effectiveAmountMillimes).toBe(50000);
    });
  });

  describe("listExpenses — period filtering", () => {
    it("filters by expenseDate range", async () => {
      await recordExpense(adminContext(), {
        category: "rent",
        amountMillimes: 10000,
        expenseDate: new Date("2026-03-15"),
      });
      await recordExpense(adminContext(), {
        category: "rent",
        amountMillimes: 10000,
        expenseDate: new Date("2026-04-15"),
      });

      const march = await listExpenses(adminContext(), {
        periodStart: new Date("2026-03-01"),
        periodEnd: new Date("2026-03-31"),
      });
      expect(march).toHaveLength(1);
    });
  });

  describe("tenant isolation at the service layer", () => {
    it("a gym cannot list another gym's expenses", async () => {
      await recordExpense(adminContext(), {
        category: "rent",
        amountMillimes: 10000,
        expenseDate: new Date(),
      });
      const adminB = await seedUser(owner, "admin-b@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      const gymBExpenses = await listExpenses({ userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });
      expect(gymBExpenses).toHaveLength(0);
    });
  });

  describe("Phase 8 — gymExpensesForPeriod, recorded-period attribution", () => {
    it("an expense counts toward the period of its expenseDate", async () => {
      await recordExpense(adminContext(), {
        category: "rent",
        amountMillimes: 10000,
        expenseDate: new Date("2026-03-15"),
      });
      const march = await gymExpensesForPeriod(
        adminContext(),
        new Date("2026-03-01"),
        new Date("2026-03-31"),
      );
      const april = await gymExpensesForPeriod(
        adminContext(),
        new Date("2026-04-01"),
        new Date("2026-04-30"),
      );
      expect(march).toBe(10000);
      expect(april).toBe(0);
    });

    it("a later adjustment counts toward its own period, and does not rewrite the original expense's period", async () => {
      const { id: expenseId } = await recordExpense(adminContext(), {
        category: "equipment",
        amountMillimes: 10000,
        expenseDate: new Date("2026-03-15"),
      });
      await withOwnerCreatedAt(owner, expenseId);

      const march = await gymExpensesForPeriod(
        adminContext(),
        new Date("2026-03-01"),
        new Date("2026-03-31"),
      );
      const april = await gymExpensesForPeriod(
        adminContext(),
        new Date("2026-04-01"),
        new Date("2026-04-30"),
      );
      expect(march).toBe(10000);
      expect(april).toBe(-2000);
    });

    it("a gym cannot see another gym's expenses in its period total", async () => {
      await recordExpense(adminContext(), {
        category: "rent",
        amountMillimes: 10000,
        expenseDate: new Date("2026-03-15"),
      });
      const adminB = await seedUser(owner, "admin-b@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      const gymBTotal = await gymExpensesForPeriod(
        { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" },
        new Date("2026-03-01"),
        new Date("2026-03-31"),
      );
      expect(gymBTotal).toBe(0);
    });
  });

  describe("Phase 8 — gymExpensesTrend", () => {
    it("returns one point per period with exact hand-computed totals, including a later cross-period adjustment", async () => {
      const { id: expenseId } = await recordExpense(adminContext(), {
        category: "rent",
        amountMillimes: 10000,
        expenseDate: new Date("2026-03-15"),
      });
      await recordExpense(adminContext(), {
        category: "equipment",
        amountMillimes: 5000,
        expenseDate: new Date("2026-04-10"),
      });
      await withOwnerCreatedAt(owner, expenseId); // -2000 in April, per the helper below

      const periods = [
        { start: new Date("2026-03-01"), end: new Date("2026-03-31T23:59:59.999") },
        { start: new Date("2026-04-01"), end: new Date("2026-04-30T23:59:59.999") },
        { start: new Date("2026-05-01"), end: new Date("2026-05-31T23:59:59.999") },
      ];
      const trend = await gymExpensesTrend(adminContext(), periods);
      expect(trend).toHaveLength(3);
      expect(trend[0].expensesMillimes).toBe(10000);
      expect(trend[1].expensesMillimes).toBe(3000);
      expect(trend[2].expensesMillimes).toBe(0);
    });

    it("a gym cannot see another gym's expenses trend", async () => {
      await recordExpense(adminContext(), {
        category: "rent",
        amountMillimes: 10000,
        expenseDate: new Date("2026-03-15"),
      });
      const adminB = await seedUser(owner, "admin-b@test.local");
      await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

      const trend = await gymExpensesTrend(
        { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" },
        [{ start: new Date("2026-03-01"), end: new Date("2026-03-31T23:59:59.999") }],
      );
      expect(trend[0].expensesMillimes).toBe(0);
    });
  });
});

/**
 * Records an April adjustment (-2000) against the given expense directly
 * via the owner pool, since adjustExpense() always stamps createdAt as
 * "now" and this test needs a specific historical date to prove
 * recorded-period attribution — same pattern as
 * tests/integration/payments.test.ts's own withOwnerCreatedAt helper.
 */
async function withOwnerCreatedAt(owner: Pool, expenseId: string): Promise<void> {
  const gymRow = await owner.query("SELECT gym_id FROM expenses WHERE id = $1", [expenseId]);
  const gymId = gymRow.rows[0].gym_id;
  const adminRow = await owner.query(
    "SELECT recorded_by_user_id FROM expenses WHERE id = $1",
    [expenseId],
  );
  const userId = adminRow.rows[0].recorded_by_user_id;
  await owner.query(
    "INSERT INTO expense_adjustments (gym_id, expense_id, amount_millimes, recorded_by_user_id, created_at) VALUES ($1, $2, -2000, $3, $4)",
    [gymId, expenseId, userId, new Date("2026-04-05")],
  );
}
