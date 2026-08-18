import { describe, expect, it } from "vitest";
import { checkGym, checkRole, type SessionContext } from "@/lib/server/authorization";
import { AuthorizationError } from "@/lib/server/errors";

function session(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    userId: "user-1",
    email: "user@test.local",
    gymId: "gym-a",
    role: "GYM_ADMIN",
    ...overrides,
  };
}

describe("checkRole", () => {
  it("allows a role that is in the allowed list", () => {
    expect(() => checkRole(session({ role: "GYM_ADMIN" }), ["GYM_ADMIN"])).not.toThrow();
  });

  it("allows when the role matches any of several allowed roles", () => {
    expect(() =>
      checkRole(session({ role: "GYM_STAFF" }), ["GYM_ADMIN", "GYM_STAFF"]),
    ).not.toThrow();
  });

  it.each([
    ["GYM_STAFF", ["GYM_ADMIN"]],
    ["GYM_ADMIN", ["PLATFORM_ADMIN"]],
    ["PLATFORM_ADMIN", ["GYM_ADMIN", "GYM_STAFF"]],
  ] as const)(
    "rejects role %s when only %s is allowed",
    (role, allowed) => {
      expect(() => checkRole(session({ role }), [...allowed])).toThrow(
        AuthorizationError,
      );
    },
  );

  it("rejects with an empty allowed-roles list regardless of role", () => {
    expect(() => checkRole(session({ role: "PLATFORM_ADMIN" }), [])).toThrow(
      AuthorizationError,
    );
  });
});

describe("checkGym", () => {
  it("allows when the session's gymId matches", () => {
    expect(() => checkGym(session({ gymId: "gym-a" }), "gym-a")).not.toThrow();
  });

  it("rejects when the session's gymId does not match", () => {
    expect(() => checkGym(session({ gymId: "gym-a" }), "gym-b")).toThrow(
      AuthorizationError,
    );
  });

  it("rejects a Platform Admin session (gymId null) against any specific gym", () => {
    expect(() => checkGym(session({ gymId: null }), "gym-a")).toThrow(
      AuthorizationError,
    );
  });
});
