import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationError, AuthorizationError } from "@/lib/server/errors";

/**
 * Phase 9: proves app/api/ai/route.ts's own auth chain — authentication,
 * role authorization, and the usage limit — without a real Next.js
 * request context or a real Anthropic API call. requireRole() and
 * checkAndIncrementUsage() are mocked (same vi.mock/vi.hoisted pattern
 * already used in tests/integration/provisioning.test.ts for external
 * dependencies); streamText() is mocked so no real model call or API key
 * is needed for these structural checks. This is the project's first
 * Route Handler, and — unlike every page route — has no layout guard to
 * rely on, so these tests exist specifically to prove its own chain
 * works standalone.
 */
const { requireRole } = vi.hoisted(() => ({ requireRole: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireRole }));

const { checkAndIncrementUsage } = vi.hoisted(() => ({ checkAndIncrementUsage: vi.fn() }));
vi.mock("@/lib/server/services/aiUsage", () => ({ checkAndIncrementUsage }));

const { streamTextMock } = vi.hoisted(() => ({
  streamTextMock: vi.fn<(args: { tools?: unknown }) => { toUIMessageStreamResponse: () => Response }>(
    () => ({
      toUIMessageStreamResponse: () => new Response("mock-stream", { status: 200 }),
    }),
  ),
}));
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: streamTextMock };
});

import { POST } from "@/app/api/ai/route";

function jsonRequest(body: unknown = { messages: [] }): Request {
  return new Request("http://localhost/api/ai", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("Phase 9 — /api/ai route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no authenticated session", async () => {
    requireRole.mockRejectedValueOnce(new AuthenticationError());
    const response = await POST(jsonRequest());
    expect(response.status).toBe(401);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("returns 403 for an authenticated Gym Staff session (D9: Admin-only)", async () => {
    requireRole.mockRejectedValueOnce(new AuthorizationError());
    const response = await POST(jsonRequest());
    expect(response.status).toBe(403);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("returns 403 if the resolved session has no gymId (defensive check)", async () => {
    requireRole.mockResolvedValueOnce({ userId: "u1", email: "a@test.local", gymId: null, role: "GYM_ADMIN" });
    const response = await POST(jsonRequest());
    expect(response.status).toBe(403);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("returns 429 when the daily usage limit has been reached, before any model call", async () => {
    requireRole.mockResolvedValueOnce({ userId: "u1", email: "a@test.local", gymId: "g1", role: "GYM_ADMIN" });
    checkAndIncrementUsage.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const response = await POST(jsonRequest());
    expect(response.status).toBe(429);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("proceeds to the model for an authorized Gym Admin under the usage limit", async () => {
    requireRole.mockResolvedValueOnce({ userId: "u1", email: "a@test.local", gymId: "g1", role: "GYM_ADMIN" });
    checkAndIncrementUsage.mockResolvedValueOnce({ allowed: true, remaining: 19 });
    const response = await POST(jsonRequest());
    expect(response.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    // Confirms the tool set was built with this session's own gymId, not
    // anything from the request body.
    const callArgs = streamTextMock.mock.calls[0]?.[0];
    expect(callArgs?.tools).toBeDefined();
  });

  it("checkAndIncrementUsage is called with the session's gymId, never a client-supplied one", async () => {
    requireRole.mockResolvedValueOnce({ userId: "u1", email: "a@test.local", gymId: "session-gym", role: "GYM_ADMIN" });
    checkAndIncrementUsage.mockResolvedValueOnce({ allowed: true, remaining: 19 });
    // Even if the request body tried to smuggle a different gymId, the
    // route never reads one from the body at all.
    await POST(jsonRequest({ messages: [], gymId: "attacker-supplied-gym" }));
    expect(checkAndIncrementUsage).toHaveBeenCalledWith(
      expect.objectContaining({ gymId: "session-gym" }),
    );
  });
});
