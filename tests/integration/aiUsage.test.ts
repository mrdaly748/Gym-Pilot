import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  getOwnerPool,
  resetTestData,
  seedAiUsageCounter,
  seedGym,
  seedMembership,
  seedUser,
  type SeededGym,
  type SeededUser,
} from "../helpers/testDb";
import { prisma } from "@/lib/server/db";
import { checkAndIncrementUsage } from "@/lib/server/services/aiUsage";

describe("Phase 9 AI usage limiting", () => {
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

  it("the first call of the day creates a counter row starting at 1", async () => {
    const result = await checkAndIncrementUsage(adminContext(), 20);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19);
  });

  it("increments on each subsequent call within the same day", async () => {
    await checkAndIncrementUsage(adminContext(), 20);
    await checkAndIncrementUsage(adminContext(), 20);
    const third = await checkAndIncrementUsage(adminContext(), 20);
    expect(third.remaining).toBe(17);
  });

  it("blocks once the limit is reached, without inflating the counter further", async () => {
    for (let i = 0; i < 3; i++) {
      await checkAndIncrementUsage(adminContext(), 3);
    }
    const blocked = await checkAndIncrementUsage(adminContext(), 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);

    const row = await owner.query("SELECT count FROM ai_usage_counters WHERE gym_id = $1", [
      gymA.id,
    ]);
    expect(row.rows[0].count).toBe(3); // the blocked attempt did not increment past 3
  });

  it("a new calendar day starts a fresh counter (no reset job needed)", async () => {
    // UTC midnight minus one day — matches checkAndIncrementUsage's own
    // todayDateOnly() construction exactly (Date.UTC(...), not local
    // midnight — see that function's own doc comment for why: Prisma
    // serializes @db.Date fields via UTC components, so a local-midnight
    // Date silently reads/writes the wrong row in any positive-UTC-offset
    // timezone).
    const now = new Date();
    const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    await seedAiUsageCounter(owner, { gymId: gymA.id, date: yesterday, count: 20 });

    // Today's request is unaffected by yesterday's exhausted counter.
    const result = await checkAndIncrementUsage(adminContext(), 20);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19);
  });

  it("a gym's usage is isolated from another gym's usage", async () => {
    await checkAndIncrementUsage(adminContext(), 1);
    const adminB = await seedUser(owner, "admin-b@test.local");
    await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

    const gymBResult = await checkAndIncrementUsage(
      { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" },
      1,
    );
    expect(gymBResult.allowed).toBe(true); // gym A's exhausted limit doesn't affect gym B
  });
});
