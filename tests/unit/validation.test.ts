import { describe, expect, it } from "vitest";
import { isNonEmpty, isValidEmail } from "@/lib/server/validation";

describe("isValidEmail", () => {
  it.each([
    "admin@example.com",
    "gym.admin+tag@sub.example.co",
    "a@b.co",
  ])("accepts %s", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(["", "not-an-email", "missing-domain@", "@missing-local.com", "no spaces@example.com"])(
    "rejects %s",
    (email) => {
      expect(isValidEmail(email)).toBe(false);
    },
  );
});

describe("isNonEmpty", () => {
  it("rejects an empty string", () => {
    expect(isNonEmpty("")).toBe(false);
  });

  it("rejects a whitespace-only string", () => {
    expect(isNonEmpty("   ")).toBe(false);
  });

  it("accepts a string with visible content", () => {
    expect(isNonEmpty("Gym Name")).toBe(true);
  });
});
