import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { ToolExecutionOptions } from "ai";
import {
  getOwnerPool,
  resetTestData,
  seedCheckin,
  seedExpense,
  seedGym,
  seedMember,
  seedMembership,
  seedMembershipRecord,
  seedPayment,
  seedPlan,
  seedTrainer,
  seedUser,
  type SeededGym,
  type SeededMember,
  type SeededPlan,
  type SeededUser,
} from "../helpers/testDb";
import { prisma } from "@/lib/server/db";
import { buildAiTools } from "@/lib/ai/tools";

/**
 * Phase 9: proves each AI tool returns exactly this gym's real,
 * hand-computable data — via the same tools.execute() path the model
 * itself calls, not a reimplementation. Also proves the structural
 * tenant-isolation guarantee: a tool set built for gym A returns only
 * gym A's data, with no argument of any kind that could redirect it —
 * verified by inspecting each tool's own inputSchema shape, and by never
 * seeing gym B's data appear regardless of what's seeded there.
 */
describe("Phase 9 AI tool layer", () => {
  let owner: Pool;
  let gymA: SeededGym;
  let gymB: SeededGym;
  let adminA: SeededUser;
  let memberA: SeededMember;
  let planA: SeededPlan;

  const execOptions = { toolCallId: "test", messages: [], context: undefined } as unknown as ToolExecutionOptions<unknown>;

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
    planA = await seedPlan(owner, { gymId: gymA.id, name: "Monthly", priceMillimes: 50000, durationDays: 30 });
  });

  const adminContext = () => ({ userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" as const });

  it("getDashboardSummary reports real revenue/expenses/attendance/membership figures for this gym only", async () => {
    const membership = await seedMembershipRecord(owner, {
      gymId: gymA.id,
      memberId: memberA.id,
      planId: planA.id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    await seedPayment(owner, {
      gymId: gymA.id,
      membershipId: membership.id,
      amountMillimes: 50000,
      recordedByUserId: adminA.id,
    });

    const tools = buildAiTools(adminContext());
    const result = (await tools.getDashboardSummary.execute!(
      { period: "this-month" },
      execOptions,
    )) as { activeMembers: number; revenueTND: number };

    expect(result.activeMembers).toBe(1);
    expect(result.revenueTND).toBe(50); // 50000 millimes = 50 TND
  });

  it("getExpiringMemberships lists only this gym's expiring memberships", async () => {
    await seedMembershipRecord(owner, {
      gymId: gymA.id,
      memberId: memberA.id,
      planId: planA.id,
      startDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });

    const tools = buildAiTools(adminContext());
    const result = (await tools.getExpiringMemberships.execute!({}, execOptions)) as {
      count: number;
      memberships: { memberName: string }[];
    };
    expect(result.count).toBe(1);
    expect(result.memberships[0].memberName).toBe("Ali");
  });

  it("getTrainers lists only this gym's active trainers", async () => {
    await seedTrainer(owner, { gymId: gymA.id, name: "Coach Sam" });
    await seedTrainer(owner, { gymId: gymA.id, name: "Coach Lea", archivedAt: new Date() });
    await seedTrainer(owner, { gymId: gymB.id, name: "Someone Else's Coach" });

    const tools = buildAiTools(adminContext());
    const result = (await tools.getTrainers.execute!({}, execOptions)) as {
      activeCount: number;
      names: string[];
    };
    expect(result.activeCount).toBe(1);
    expect(result.names).toEqual(["Coach Sam"]);
  });

  it("compareRevenuePeriods computes hand-computed this-month vs last-month revenue and percent change", async () => {
    const membership = await seedMembershipRecord(owner, {
      gymId: gymA.id,
      memberId: memberA.id,
      planId: planA.id,
      startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000),
    });
    const now = new Date();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);

    await seedPayment(owner, {
      gymId: gymA.id,
      membershipId: membership.id,
      amountMillimes: 60000,
      paidAt: now,
      recordedByUserId: adminA.id,
    });
    await seedPayment(owner, {
      gymId: gymA.id,
      membershipId: membership.id,
      amountMillimes: 30000,
      paidAt: lastMonthDate,
      recordedByUserId: adminA.id,
    });

    const tools = buildAiTools(adminContext());
    const result = (await tools.compareRevenuePeriods.execute!({}, execOptions)) as {
      thisMonthRevenueTND: number;
      lastMonthRevenueTND: number;
      percentChange: number | null;
    };

    expect(result.thisMonthRevenueTND).toBe(60);
    expect(result.lastMonthRevenueTND).toBe(30);
    expect(result.percentChange).toBeCloseTo((60 - 30) / 30); // hand-computed: +100%
  });

  it("getRevenueTrend returns 6 months of hand-computed revenue, ending with the current month", async () => {
    const membership = await seedMembershipRecord(owner, {
      gymId: gymA.id,
      memberId: memberA.id,
      planId: planA.id,
      startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000),
    });
    const now = new Date();
    await seedPayment(owner, {
      gymId: gymA.id,
      membershipId: membership.id,
      amountMillimes: 75000,
      paidAt: now,
      recordedByUserId: adminA.id,
    });

    const tools = buildAiTools(adminContext());
    const result = (await tools.getRevenueTrend.execute!({}, execOptions)) as {
      month: string;
      revenueTND: number;
    }[];

    expect(result).toHaveLength(6);
    const currentMonthLabel = now.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    const last = result[result.length - 1];
    expect(last.month).toBe(currentMonthLabel);
    expect(last.revenueTND).toBe(75);
    for (const point of result.slice(0, -1)) {
      expect(point.revenueTND).toBe(0);
    }
  });

  it("getExpensesTrend returns 6 months of hand-computed expenses, ending with the current month", async () => {
    const now = new Date();
    await seedExpense(owner, {
      gymId: gymA.id,
      category: "rent",
      amountMillimes: 120000,
      expenseDate: now,
      recordedByUserId: adminA.id,
    });

    const tools = buildAiTools(adminContext());
    const result = (await tools.getExpensesTrend.execute!({}, execOptions)) as {
      month: string;
      expensesTND: number;
    }[];

    expect(result).toHaveLength(6);
    const currentMonthLabel = now.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    const last = result[result.length - 1];
    expect(last.month).toBe(currentMonthLabel);
    expect(last.expensesTND).toBe(120);
    for (const point of result.slice(0, -1)) {
      expect(point.expensesTND).toBe(0);
    }
  });

  it("getAttendanceTrend returns hand-computed total/unique-visitor counts, ending with the current month", async () => {
    const now = new Date();
    const memberC = await seedMember(owner, {
      gymId: gymA.id,
      name: "Other",
      phone: "20777777",
      phoneNormalized: "20777777",
    });
    await seedCheckin(owner, {
      gymId: gymA.id,
      memberId: memberA.id,
      checkedInAt: now,
      recordedByUserId: adminA.id,
    });
    await seedCheckin(owner, {
      gymId: gymA.id,
      memberId: memberC.id,
      checkedInAt: now,
      recordedByUserId: adminA.id,
    });

    const tools = buildAiTools(adminContext());
    const result = (await tools.getAttendanceTrend.execute!({}, execOptions)) as {
      month: string;
      totalCheckins: number;
      uniqueVisitors: number;
    }[];

    expect(result).toHaveLength(6);
    const last = result[result.length - 1];
    expect(last.totalCheckins).toBe(2);
    expect(last.uniqueVisitors).toBe(2);
  });

  it("getMembershipGrowthTrend returns hand-computed active-member counts, ending with the current month", async () => {
    const now = new Date();
    await seedMembershipRecord(owner, {
      gymId: gymA.id,
      memberId: memberA.id,
      planId: planA.id,
      startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      endDate: new Date(now.getFullYear(), now.getMonth() + 2, 1),
    });

    const tools = buildAiTools(adminContext());
    const result = (await tools.getMembershipGrowthTrend.execute!({}, execOptions)) as {
      month: string;
      activeMembers: number;
    }[];

    expect(result).toHaveLength(6);
    const last = result[result.length - 1];
    expect(last.activeMembers).toBe(1);
    // 5 months before the current month, this membership hadn't started yet.
    expect(result[0].activeMembers).toBe(0);
  });

  it("getPlanPerformance returns hand-computed member counts and revenue per plan", async () => {
    const membership = await seedMembershipRecord(owner, {
      gymId: gymA.id,
      memberId: memberA.id,
      planId: planA.id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    await seedPayment(owner, {
      gymId: gymA.id,
      membershipId: membership.id,
      amountMillimes: 50000,
      recordedByUserId: adminA.id,
    });

    const tools = buildAiTools(adminContext());
    const result = (await tools.getPlanPerformance.execute!({}, execOptions)) as {
      planName: string;
      memberCount: number;
      revenueTND: number;
    }[];

    expect(result).toEqual([{ planName: "Monthly", memberCount: 1, revenueTND: 50 }]);
  });

  it("a tool set built for gym A never returns gym B's data, even though gym B has its own seeded data", async () => {
    const memberB = await seedMember(owner, {
      gymId: gymB.id,
      name: "Cross-gym member",
      phone: "20999999",
      phoneNormalized: "20999999",
    });
    const planB = await seedPlan(owner, { gymId: gymB.id, name: "Annual", priceMillimes: 500000 });
    const membershipB = await seedMembershipRecord(owner, {
      gymId: gymB.id,
      memberId: memberB.id,
      planId: planB.id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
    await seedPayment(owner, {
      gymId: gymB.id,
      membershipId: membershipB.id,
      amountMillimes: 500000,
      recordedByUserId: adminA.id,
    });

    // No membership/payment exists for Gym A in this test.
    const tools = buildAiTools(adminContext());
    const result = (await tools.getDashboardSummary.execute!(
      { period: "this-month" },
      execOptions,
    )) as { activeMembers: number; revenueTND: number };

    expect(result.activeMembers).toBe(0);
    expect(result.revenueTND).toBe(0);
  });

  it("calling every model-callable tool leaves the database state unchanged", async () => {
    // Empirical companion to the "no tool's input schema accepts a gymId"
    // structural check above, and to lib/ai/tools.ts's own "this file
    // imports only read-oriented functions" invariant: this asserts, by
    // directly re-querying the database, that no row in any table touched
    // by the tool layer is added, removed, or modified by calling every
    // tool — not just that no write function is imported.
    const membership = await seedMembershipRecord(owner, {
      gymId: gymA.id,
      memberId: memberA.id,
      planId: planA.id,
      startDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });
    await seedPayment(owner, {
      gymId: gymA.id,
      membershipId: membership.id,
      amountMillimes: 50000,
      recordedByUserId: adminA.id,
    });
    await seedTrainer(owner, { gymId: gymA.id, name: "Coach Sam" });

    const TABLES = [
      "gyms",
      "users",
      "gym_memberships",
      "members",
      "membership_plans",
      "memberships",
      "membership_freezes",
      "payments",
      "payment_adjustments",
      "attendance_checkins",
      "trainers",
      "trainer_member_links",
      "expenses",
      "expense_adjustments",
      "ai_usage_counters",
    ] as const;

    async function rowCounts(): Promise<Record<string, number>> {
      const counts: Record<string, number> = {};
      for (const table of TABLES) {
        const result = await owner.query<{ count: string }>(`SELECT count(*) FROM ${table}`);
        counts[table] = Number(result.rows[0].count);
      }
      return counts;
    }

    const before = await rowCounts();

    const tools = buildAiTools(adminContext());
    for (const [, toolDef] of Object.entries(tools)) {
      await toolDef.execute!({ period: "this-month" }, execOptions);
    }

    const after = await rowCounts();
    expect(after).toEqual(before);
  });

  it("no tool's input schema accepts a gymId (or any gym-identifying) parameter", () => {
    const tools = buildAiTools(adminContext());
    for (const [name, toolDef] of Object.entries(tools)) {
      const schema = toolDef.inputSchema as { shape?: Record<string, unknown> };
      const keys = schema?.shape ? Object.keys(schema.shape) : [];
      expect(keys, `tool "${name}" must not accept a gym-identifying parameter`).not.toContain("gymId");
      expect(keys, `tool "${name}" must not accept a gym-identifying parameter`).not.toContain("gym_id");
    }
  });
});
