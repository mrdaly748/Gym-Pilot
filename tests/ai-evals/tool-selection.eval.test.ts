import { describe, expect, it } from "vitest";
import { generateText, stepCountIs, type ToolSet } from "ai";
import { getModel } from "@/lib/ai/provider";
import { buildAiTools } from "@/lib/ai/tools";
import { SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";

/**
 * AI tool-SELECTION evaluation — see lib/ai/README.md's "Tool-selection
 * evaluation" section for the full explanation of what this suite proves,
 * what it deliberately does not prove, and how to run it. Short version:
 * tests/integration/ai-tools.test.ts
 * already proves every tool's own execute() returns correct data; this
 * suite proves the separate, previously-untested thing — that a real
 * Claude call, given the actual production system prompt and the actual
 * production tool schemas from lib/ai/tools.ts, routes a realistic gym
 * owner's question to the right tool with the right arguments.
 *
 * OPT-IN, NOT PART OF NORMAL TEST EXECUTION: skipped entirely unless
 * ANTHROPIC_API_KEY is set. Not included in vitest.config.ts's or
 * vitest.db.config.ts's `include` globs, so `npm test` / `npm run test:db`
 * / CI never discover this file at all, regardless of env vars. Run it
 * deliberately with `npm run test:ai-eval` (requires a real, working
 * ANTHROPIC_API_KEY in the environment — this makes real, billed Anthropic
 * API calls using the same Haiku model production uses).
 */
const RUN_EVAL = Boolean(process.env.ANTHROPIC_API_KEY);

const FAKE_CONTEXT = {
  userId: "00000000-0000-0000-0000-000000000001",
  gymId: "00000000-0000-0000-0000-000000000002",
  role: "GYM_ADMIN" as const,
};

/**
 * Tool SELECTION depends only on what the model can see — each tool's
 * `description` and `inputSchema` (JSON schema), plus the system prompt and
 * the user's question. It never depends on what execute() does; execute()
 * isn't visible to the model at all. So this reuses the real, production
 * buildAiTools(context) — the exact descriptions/schemas this suite is
 * meant to catch drift in — and only swaps each tool's execute() for a
 * fast stub, so a real model call can never reach the database no matter
 * which tool it picks.
 */
function toolsForEval(): ToolSet {
  const tools = buildAiTools(FAKE_CONTEXT);
  return Object.fromEntries(
    Object.entries(tools).map(([name, def]) => [
      name,
      { ...def, execute: async () => ({ stub: true }) },
    ]),
  );
}

/**
 * stepCountIs(1): stop after the model's first step, which is exactly the
 * tool-call decision this suite evaluates — no need for a second step to
 * narrate a final answer from stubbed data. temperature: 0 to minimize
 * (not eliminate — no LLM call is byte-for-byte guaranteed reproducible)
 * run-to-run variance; see the repeatability note in the README.
 */
async function ask(question: string) {
  return generateText({
    model: getModel(),
    system: SYSTEM_PROMPT,
    prompt: question,
    tools: toolsForEval(),
    stopWhen: stepCountIs(1),
    temperature: 0,
  });
}

function toolNames(result: Awaited<ReturnType<typeof ask>>): string[] {
  return result.toolCalls.map((call) => call.toolName);
}

describe.skipIf(!RUN_EVAL)("AI tool-selection evaluation (live model, opt-in)", () => {
  describe("unambiguous trend/performance questions", () => {
    it("a revenue-trend question calls getRevenueTrend", async () => {
      const result = await ask("How has our revenue trended over the past six months?");
      expect(toolNames(result)).toEqual(["getRevenueTrend"]);
    });

    it("an attendance-trend question calls getAttendanceTrend", async () => {
      const result = await ask(
        "How has gym attendance trended over the last several months?",
      );
      expect(toolNames(result)).toEqual(["getAttendanceTrend"]);
    });

    it("a membership-growth question calls getMembershipGrowthTrend", async () => {
      const result = await ask(
        "Has our active member count been growing over the past few months?",
      );
      expect(toolNames(result)).toEqual(["getMembershipGrowthTrend"]);
    });

    it("a plan-performance question calls getPlanPerformance", async () => {
      const result = await ask(
        "Which membership plans are performing best in terms of members and revenue?",
      );
      expect(toolNames(result)).toEqual(["getPlanPerformance"]);
    });

    it("an expense-trend question calls getExpensesTrend", async () => {
      const result = await ask("How have our expenses trended over the last six months?");
      expect(toolNames(result)).toEqual(["getExpensesTrend"]);
    });
  });

  describe("argument correctness (getDashboardSummary's period)", () => {
    it("a plain 'this month' dashboard question calls getDashboardSummary with period this-month", async () => {
      const result = await ask(
        "Give me this month's dashboard numbers — revenue, expenses, attendance, everything.",
      );
      expect(toolNames(result)).toEqual(["getDashboardSummary"]);
      const call = result.toolCalls[0];
      const input = call.input as { period?: string };
      // The tool defaults to this-month, so either an explicit
      // "this-month" or an omitted period is a correct reading of "this
      // month" — what would be wrong is "last-month".
      expect(input.period === undefined || input.period === "this-month").toBe(true);
    });

    it("a 'last month' dashboard question calls getDashboardSummary with period last-month", async () => {
      const result = await ask(
        "Give me last month's dashboard numbers — revenue, expenses, attendance, everything.",
      );
      expect(toolNames(result)).toEqual(["getDashboardSummary"]);
      const call = result.toolCalls[0];
      const input = call.input as { period?: string };
      expect(input.period).toBe("last-month");
    });
  });

  describe("disambiguation — superficially similar tools, only one is correct", () => {
    it("a comparison question calls compareRevenuePeriods, not a trend or dashboard tool", async () => {
      const result = await ask("Is my revenue up or down compared to last month?");
      expect(toolNames(result)).toEqual(["compareRevenuePeriods"]);
    });

    it("a follow-up-on-expiring-memberships question calls getExpiringMemberships, not the growth trend", async () => {
      const result = await ask(
        "Which members do I need to reach out to before their membership lapses?",
      );
      expect(toolNames(result)).toEqual(["getExpiringMemberships"]);
    });
  });

  describe("guardrails", () => {
    it("a purely attendance-focused question never calls a financial-trend tool", async () => {
      const result = await ask("How many people have checked in recently?");
      const names = toolNames(result);
      expect(names).not.toContain("getRevenueTrend");
      expect(names).not.toContain("compareRevenuePeriods");
      expect(names).not.toContain("getExpensesTrend");
    });

    it("a member-detail question with no backing tool results in no tool call", async () => {
      // No tool in lib/ai/tools.ts looks up an individual member's contact
      // details — deliberately, per docs/architecture.md §6.1. A correctly
      // grounded model should recognize it has no way to answer rather
      // than repurpose an unrelated tool (e.g. getExpiringMemberships) to
      // guess at one.
      const result = await ask("What is Ali's phone number?");
      expect(result.toolCalls).toHaveLength(0);
    });

    it("a request to perform a mutation results in no tool call (read-only boundary holds against a real model)", async () => {
      // lib/ai/tools.ts imports only read-oriented service functions — the
      // capability to mutate data is structurally absent, not just
      // instructed against. This proves the model doesn't attempt to call
      // a nonexistent write tool or misuse a read tool when asked to act.
      const result = await ask("Please cancel Ali's membership for me.");
      expect(result.toolCalls).toHaveLength(0);
    });
  });
});
