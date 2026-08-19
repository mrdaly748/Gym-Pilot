import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/server/validation";

describe("normalizePhone", () => {
  it.each([
    ["+216 20 123 456", "21620123456"],
    ["20-123-456", "20123456"],
    ["20123456", "20123456"],
    ["(20) 123-456", "20123456"],
    ["", ""],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("treats differently-formatted equivalents as equal after normalization", () => {
    expect(normalizePhone("20-123-456")).toBe(normalizePhone("20 123 456"));
    expect(normalizePhone("(20)123456")).toBe(normalizePhone("20123456"));
  });
});
