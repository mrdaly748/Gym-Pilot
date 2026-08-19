import { describe, expect, it } from "vitest";
import {
  addDays,
  deriveMembershipStatus,
  frozenDays,
  isActiveMember,
  isCurrentlyFrozen,
  isNewMember,
  type MembershipForStatus,
} from "@/lib/server/services/metrics";

const NOW = new Date("2026-06-15T12:00:00Z");

function membership(overrides: Partial<MembershipForStatus> = {}): MembershipForStatus {
  return {
    startDate: new Date("2026-06-01"),
    endDate: new Date("2026-07-01"),
    cancelledAt: null,
    freezes: [],
    ...overrides,
  };
}

describe("deriveMembershipStatus", () => {
  it("is ACTIVE when well within the date range, not frozen, not cancelled", () => {
    expect(deriveMembershipStatus(membership(), NOW)).toBe("ACTIVE");
  });

  it("is EXPIRING_SOON within the default 7-day window", () => {
    const m = membership({ endDate: new Date("2026-06-20") }); // 5 days out
    expect(deriveMembershipStatus(m, NOW)).toBe("EXPIRING_SOON");
  });

  it("is ACTIVE (not expiring) just outside the window", () => {
    const m = membership({ endDate: new Date("2026-06-23") }); // 8 days out
    expect(deriveMembershipStatus(m, NOW)).toBe("ACTIVE");
  });

  it("respects a custom expiring-soon window", () => {
    const m = membership({ endDate: new Date("2026-06-20") }); // 5 days out
    expect(deriveMembershipStatus(m, NOW, 3)).toBe("ACTIVE");
    expect(deriveMembershipStatus(m, NOW, 10)).toBe("EXPIRING_SOON");
  });

  it("is EXPIRED once the end date has passed", () => {
    const m = membership({ endDate: new Date("2026-06-01") });
    expect(deriveMembershipStatus(m, NOW)).toBe("EXPIRED");
  });

  it("is EXPIRED independent of attendance (status derivation has no attendance input at all)", () => {
    // Phase 6 (attendance) doesn't exist yet — this test documents that the
    // status function's signature has no way to be influenced by it,
    // satisfying spec §18's "expired but still checks in" edge case at the
    // status-derivation layer specifically.
    const m = membership({ endDate: new Date("2026-06-01") });
    expect(deriveMembershipStatus(m, NOW)).toBe("EXPIRED");
  });

  it("is CANCELLED regardless of dates, even if dates would say active", () => {
    const m = membership({ cancelledAt: new Date("2026-06-10") });
    expect(deriveMembershipStatus(m, NOW)).toBe("CANCELLED");
  });

  it("is CANCELLED even if dates would say expired", () => {
    const m = membership({ endDate: new Date("2026-06-01"), cancelledAt: new Date("2026-06-02") });
    expect(deriveMembershipStatus(m, NOW)).toBe("CANCELLED");
  });

  it("is FROZEN when an unresolved freeze exists, even within the active date range", () => {
    const m = membership({ freezes: [{ frozenAt: new Date("2026-06-10"), resumedAt: null }] });
    expect(deriveMembershipStatus(m, NOW)).toBe("FROZEN");
  });

  it("is FROZEN even if the (unadjusted) end date has technically passed", () => {
    const m = membership({
      endDate: new Date("2026-06-01"),
      freezes: [{ frozenAt: new Date("2026-05-20"), resumedAt: null }],
    });
    expect(deriveMembershipStatus(m, NOW)).toBe("FROZEN");
  });

  it("is not FROZEN once the only freeze has resumed", () => {
    const m = membership({
      freezes: [{ frozenAt: new Date("2026-06-05"), resumedAt: new Date("2026-06-10") }],
    });
    expect(deriveMembershipStatus(m, NOW)).toBe("ACTIVE");
  });

  it("repeated freeze -> resume -> freeze cycles: only the latest, unresolved one matters", () => {
    const m = membership({
      freezes: [
        { frozenAt: new Date("2026-06-02"), resumedAt: new Date("2026-06-05") },
        { frozenAt: new Date("2026-06-08"), resumedAt: new Date("2026-06-09") },
        { frozenAt: new Date("2026-06-12"), resumedAt: null },
      ],
    });
    expect(deriveMembershipStatus(m, NOW)).toBe("FROZEN");
  });

  it("cancellation takes precedence over an active freeze", () => {
    const m = membership({
      cancelledAt: new Date("2026-06-14"),
      freezes: [{ frozenAt: new Date("2026-06-10"), resumedAt: null }],
    });
    expect(deriveMembershipStatus(m, NOW)).toBe("CANCELLED");
  });
});

describe("isCurrentlyFrozen", () => {
  it("false for no freezes", () => {
    expect(isCurrentlyFrozen([])).toBe(false);
  });
  it("false when every freeze has resumed", () => {
    expect(
      isCurrentlyFrozen([{ frozenAt: new Date(), resumedAt: new Date() }]),
    ).toBe(false);
  });
  it("true when any freeze is unresolved", () => {
    expect(
      isCurrentlyFrozen([
        { frozenAt: new Date(), resumedAt: new Date() },
        { frozenAt: new Date(), resumedAt: null },
      ]),
    ).toBe(true);
  });
});

describe("isActiveMember", () => {
  it("counts ACTIVE and EXPIRING_SOON, nothing else", () => {
    expect(isActiveMember("ACTIVE")).toBe(true);
    expect(isActiveMember("EXPIRING_SOON")).toBe(true);
    expect(isActiveMember("EXPIRED")).toBe(false);
    expect(isActiveMember("FROZEN")).toBe(false);
    expect(isActiveMember("CANCELLED")).toBe(false);
  });
});

describe("isNewMember", () => {
  it("true when join date falls within the period, inclusive of both ends", () => {
    expect(isNewMember(new Date("2026-06-01"), new Date("2026-06-01"), new Date("2026-06-30"))).toBe(true);
    expect(isNewMember(new Date("2026-06-30"), new Date("2026-06-01"), new Date("2026-06-30"))).toBe(true);
  });
  it("false when join date is outside the period", () => {
    expect(isNewMember(new Date("2026-05-31"), new Date("2026-06-01"), new Date("2026-06-30"))).toBe(false);
    expect(isNewMember(new Date("2026-07-01"), new Date("2026-06-01"), new Date("2026-06-30"))).toBe(false);
  });
});

describe("frozenDays / addDays (the freeze-resume date-shift math)", () => {
  it("computes whole frozen days, rounding up a partial day", () => {
    expect(frozenDays(new Date("2026-06-01T00:00:00Z"), new Date("2026-06-05T00:00:00Z"))).toBe(4);
    expect(frozenDays(new Date("2026-06-01T00:00:00Z"), new Date("2026-06-05T12:00:00Z"))).toBe(5);
  });

  it("addDays shifts a date forward without mutating the input", () => {
    const original = new Date("2026-06-01");
    const shifted = addDays(original, 5);
    expect(shifted.toISOString().slice(0, 10)).toBe("2026-06-06");
    expect(original.toISOString().slice(0, 10)).toBe("2026-06-01");
  });

  it("a freeze/resume cycle shifts the end date by exactly the frozen duration, not corrupting it", () => {
    const endDate = new Date("2026-07-01");
    const frozenAt = new Date("2026-06-10T00:00:00Z");
    const resumedAt = new Date("2026-06-15T00:00:00Z");
    const days = frozenDays(frozenAt, resumedAt);
    const newEndDate = addDays(endDate, days);
    expect(days).toBe(5);
    expect(newEndDate.toISOString().slice(0, 10)).toBe("2026-07-06");
  });

  it("two sequential freeze/resume cycles accumulate correctly", () => {
    let endDate = new Date("2026-07-01");
    endDate = addDays(endDate, frozenDays(new Date("2026-06-05"), new Date("2026-06-08"))); // +3
    endDate = addDays(endDate, frozenDays(new Date("2026-06-20"), new Date("2026-06-22"))); // +2
    expect(endDate.toISOString().slice(0, 10)).toBe("2026-07-06");
  });
});
