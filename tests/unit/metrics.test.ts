import { describe, expect, it } from "vitest";
import {
  addDays,
  deriveMembershipStatus,
  effectivePaymentAmount,
  frozenDays,
  isActiveMember,
  isCurrentlyFrozen,
  isNewMember,
  effectiveExpenseAmount,
  outstandingBalance,
  revenueForPeriod,
  totalCheckins,
  uniqueVisitors,
  type CheckinForCalc,
  type ExpenseForCalc,
  type MembershipForStatus,
  type PaymentForCalc,
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

function payment(overrides: Partial<PaymentForCalc> = {}): PaymentForCalc {
  return {
    amountMillimes: 50000,
    paidAt: new Date("2026-06-10"),
    adjustments: [],
    ...overrides,
  };
}

describe("effectivePaymentAmount", () => {
  it("is just the amount with no adjustments", () => {
    expect(effectivePaymentAmount(payment())).toBe(50000);
  });

  it("adds every adjustment's signed delta", () => {
    const p = payment({
      adjustments: [
        { amountMillimes: -10000, createdAt: new Date("2026-06-15") },
        { amountMillimes: 2000, createdAt: new Date("2026-06-20") },
      ],
    });
    expect(effectivePaymentAmount(p)).toBe(42000);
  });

  it("a full void reduces the effective amount to exactly zero", () => {
    const p = payment({
      amountMillimes: 50000,
      adjustments: [{ amountMillimes: -50000, createdAt: new Date("2026-06-15") }],
    });
    expect(effectivePaymentAmount(p)).toBe(0);
  });
});

describe("outstandingBalance", () => {
  it("plan price minus a single full payment is zero", () => {
    expect(outstandingBalance(50000, [payment({ amountMillimes: 50000 })])).toBe(0);
  });

  it("partial/installment payments sum toward the balance", () => {
    const payments = [
      payment({ amountMillimes: 20000 }),
      payment({ amountMillimes: 15000 }),
    ];
    expect(outstandingBalance(50000, payments)).toBe(15000);
  });

  it("a voided payment leaves the full plan price outstanding again", () => {
    const voided = payment({
      amountMillimes: 50000,
      adjustments: [{ amountMillimes: -50000, createdAt: new Date("2026-06-15") }],
    });
    expect(outstandingBalance(50000, [voided])).toBe(50000);
  });

  it("uses the passed-in (snapshotted) plan price, never a live plan price — the caller is responsible for passing the snapshot", () => {
    // This test documents the contract: outstandingBalance has no way to
    // read a "current" plan price at all, by construction — it only ever
    // sees whatever number the caller supplies, which must be
    // membership.priceMillimesSnapshot (product-spec.md §18).
    expect(outstandingBalance(99999, [payment({ amountMillimes: 50000 })])).toBe(49999);
  });
});

describe("revenueForPeriod", () => {
  const march = { start: new Date("2026-03-01"), end: new Date("2026-03-31") };
  const april = { start: new Date("2026-04-01"), end: new Date("2026-04-30") };

  it("a March payment counts toward March revenue", () => {
    const payments = [payment({ amountMillimes: 100, paidAt: new Date("2026-03-15") })];
    expect(revenueForPeriod(payments, march.start, march.end)).toBe(100);
    expect(revenueForPeriod(payments, april.start, april.end)).toBe(0);
  });

  it("an April adjustment on a March payment counts toward April revenue, not March (recorded-period attribution)", () => {
    const payments = [
      payment({
        amountMillimes: 100,
        paidAt: new Date("2026-03-15"),
        adjustments: [{ amountMillimes: -20, createdAt: new Date("2026-04-05") }],
      }),
    ];
    expect(revenueForPeriod(payments, march.start, march.end)).toBe(100);
    expect(revenueForPeriod(payments, april.start, april.end)).toBe(-20);
  });

  it("does not retroactively rewrite the original payment's period when queried again later", () => {
    const payments = [
      payment({
        amountMillimes: 100,
        paidAt: new Date("2026-03-15"),
        adjustments: [{ amountMillimes: -20, createdAt: new Date("2026-04-05") }],
      }),
    ];
    // Querying March revenue after the April adjustment exists still
    // returns the original 100 — the adjustment never touches March.
    expect(revenueForPeriod(payments, march.start, march.end)).toBe(100);
  });

  it("sums multiple payments and adjustments within the same period", () => {
    const payments = [
      payment({ amountMillimes: 100, paidAt: new Date("2026-03-05") }),
      payment({
        amountMillimes: 200,
        paidAt: new Date("2026-03-10"),
        adjustments: [{ amountMillimes: -50, createdAt: new Date("2026-03-20") }],
      }),
    ];
    expect(revenueForPeriod(payments, march.start, march.end)).toBe(250);
  });
});

describe("totalCheckins / uniqueVisitors", () => {
  const march = { start: new Date("2026-03-01"), end: new Date("2026-03-31") };

  function checkin(overrides: Partial<CheckinForCalc>): CheckinForCalc {
    return {
      memberId: "member-1",
      checkedInAt: new Date("2026-03-15"),
      ...overrides,
    };
  }

  it("zero check-ins yields zero for both metrics", () => {
    expect(totalCheckins([], march.start, march.end)).toBe(0);
    expect(uniqueVisitors([], march.start, march.end)).toBe(0);
  });

  it("one check-in counts as 1 total and 1 unique visitor", () => {
    const checkins = [checkin({ memberId: "member-1" })];
    expect(totalCheckins(checkins, march.start, march.end)).toBe(1);
    expect(uniqueVisitors(checkins, march.start, march.end)).toBe(1);
  });

  it("multiple check-ins by the same member: N total, 1 unique visitor", () => {
    const checkins = [
      checkin({ memberId: "member-1", checkedInAt: new Date("2026-03-05") }),
      checkin({ memberId: "member-1", checkedInAt: new Date("2026-03-10") }),
      checkin({ memberId: "member-1", checkedInAt: new Date("2026-03-20") }),
    ];
    expect(totalCheckins(checkins, march.start, march.end)).toBe(3);
    expect(uniqueVisitors(checkins, march.start, march.end)).toBe(1);
  });

  it("distinct members each count once for unique visitors, but sum for total", () => {
    const checkins = [
      checkin({ memberId: "member-1" }),
      checkin({ memberId: "member-2" }),
      checkin({ memberId: "member-1" }),
    ];
    expect(totalCheckins(checkins, march.start, march.end)).toBe(3);
    expect(uniqueVisitors(checkins, march.start, march.end)).toBe(2);
  });

  it("excludes check-ins outside the period", () => {
    const checkins = [
      checkin({ memberId: "member-1", checkedInAt: new Date("2026-02-28") }),
      checkin({ memberId: "member-2", checkedInAt: new Date("2026-04-01") }),
    ];
    expect(totalCheckins(checkins, march.start, march.end)).toBe(0);
    expect(uniqueVisitors(checkins, march.start, march.end)).toBe(0);
  });

  it("includes check-ins exactly on the period boundaries", () => {
    const checkins = [
      checkin({ memberId: "member-1", checkedInAt: march.start }),
      checkin({ memberId: "member-2", checkedInAt: march.end }),
    ];
    expect(totalCheckins(checkins, march.start, march.end)).toBe(2);
    expect(uniqueVisitors(checkins, march.start, march.end)).toBe(2);
  });
});

describe("effectiveExpenseAmount", () => {
  function expense(overrides: Partial<ExpenseForCalc> = {}): ExpenseForCalc {
    return {
      amountMillimes: 50000,
      adjustments: [],
      ...overrides,
    };
  }

  it("is just the amount with no adjustments", () => {
    expect(effectiveExpenseAmount(expense())).toBe(50000);
  });

  it("adds every adjustment's signed delta", () => {
    const e = expense({
      adjustments: [{ amountMillimes: -10000 }, { amountMillimes: 2000 }],
    });
    expect(effectiveExpenseAmount(e)).toBe(42000);
  });

  it("a full void reduces the effective amount to exactly zero", () => {
    const e = expense({
      amountMillimes: 50000,
      adjustments: [{ amountMillimes: -50000 }],
    });
    expect(effectiveExpenseAmount(e)).toBe(0);
  });
});
