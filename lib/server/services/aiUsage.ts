import "server-only";
import { withTenant, type TenantContext } from "@/lib/server/db";

/**
 * Phase 9 (product-spec.md §15, docs/architecture.md §6.7): a simple
 * per-gym daily usage cap to bound runaway AI spend — 20 AI requests per
 * gym per day (confirmed decision, Phase 9 planning).
 *
 * "Reset" needs no scheduler/cron/queue (docs/decisions.md D8): the
 * counter is keyed on (gymId, date), so a new calendar day simply has no
 * row yet — the very next request for that day starts a fresh count via
 * upsert.
 *
 * checkAndIncrementUsage() reads the current count first and only
 * increments if under the limit, so a blocked attempt never itself counts
 * toward usage. This has a small, accepted race window under concurrent
 * requests (two simultaneous calls could both read a count just under the
 * limit and both proceed, momentarily exceeding it by one) — acceptable
 * because this is a cost-control soft cap ("caps runaway spend," per
 * architecture §6.7), not a security boundary; the security boundaries
 * (auth, gym scoping, tenant isolation) are enforced elsewhere and do not
 * depend on this function's exactness.
 */

const DEFAULT_DAILY_LIMIT = 20;

export type UsageCheckResult = {
  allowed: boolean;
  remaining: number;
};

/**
 * Today's calendar date as a UTC midnight instant — not local midnight.
 * Prisma serializes a `@db.Date` field's value using the Date object's UTC
 * components; a *local*-midnight Date (e.g. `new Date(y, m, d)`) is only
 * equal to that same UTC-based reading in timezones at UTC+0 — anywhere
 * east of UTC (positive offset), local midnight's UTC representation is
 * still the *previous* UTC day for most of the day, which silently wrote
 * to/read from the wrong row (found and fixed via a failing integration
 * test: tests/integration/aiUsage.test.ts's "new calendar day" case).
 * Constructing via Date.UTC(...) instead is unambiguous regardless of the
 * server or database's local timezone.
 */
function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export async function checkAndIncrementUsage(
  context: TenantContext,
  limit: number = DEFAULT_DAILY_LIMIT,
): Promise<UsageCheckResult> {
  const date = todayDateOnly();

  return withTenant(context, async (tx) => {
    const existing = await tx.aiUsageCounter.findUnique({
      where: { gymId_date: { gymId: context.gymId, date } },
      select: { count: true },
    });
    const currentCount = existing?.count ?? 0;

    if (currentCount >= limit) {
      return { allowed: false, remaining: 0 };
    }

    const updated = await tx.aiUsageCounter.upsert({
      where: { gymId_date: { gymId: context.gymId, date } },
      create: { gymId: context.gymId, date, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });

    return { allowed: true, remaining: Math.max(0, limit - updated.count) };
  });
}
