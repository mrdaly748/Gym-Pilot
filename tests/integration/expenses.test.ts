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
import { adjustExpense, listExpenses, recordExpense } from "@/lib/server/services/expenses";
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
});
