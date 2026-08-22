import "server-only";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { requireRole } from "@/lib/server/auth";
import { AuthenticationError, AuthorizationError } from "@/lib/server/errors";
import { checkAndIncrementUsage } from "@/lib/server/services/aiUsage";
import { buildAiTools } from "@/lib/ai/tools";
import { getModel } from "@/lib/ai/provider";
import { SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";

/**
 * The project's first Route Handler (docs/architecture.md §6). No
 * page/layout guard applies to API routes — app/gym/[gymId]/layout.tsx's
 * try/catch+redirect only wraps page navigation, and proxy.ts only
 * refreshes the Supabase session cookie (confirmed by reading it
 * directly; it performs no authorization check). This handler therefore
 * performs its own complete, explicit auth chain rather than assuming
 * anything upstream already checked it.
 *
 * Gym-Admin-only (D9, confirmed decision): Gym Staff has no AI access in
 * MVP. requireRole() both authenticates (via getSessionContext()
 * internally) and authorizes in one call — there is no separate
 * requireGym() step here because, unlike a page route, this handler never
 * accepts a client-supplied gymId at all; `context.gymId` comes solely
 * from the verified session.
 */
export const runtime = "nodejs";

/**
 * Cost/DoS control (security audit finding M1): the daily usage counter
 * below bounds how many requests a gym can make per day, not how large any
 * single request is. Without a per-request cap, one authenticated request
 * could carry an arbitrarily long conversation while still only costing the
 * gym one of its 20 daily slots. These limits are generous for a genuine
 * grounded Q&A turn (the UI only ever grows a conversation one turn at a
 * time) but bound the worst case.
 */
const MAX_AI_MESSAGE_COUNT = 50;
const MAX_AI_INPUT_CHARS = 20_000;

export async function POST(req: Request): Promise<Response> {
  let session;
  try {
    session = await requireRole("GYM_ADMIN");
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }
    throw error;
  }

  // Every GYM_ADMIN row is DB-guaranteed (a hand-authored CHECK
  // constraint, docs/architecture.md §3) to carry a non-null gymId — only
  // PLATFORM_ADMIN rows have gymId = null, and requireRole("GYM_ADMIN")
  // above already excludes that. Checked explicitly anyway rather than
  // force-unwrapped, so a violated invariant fails loudly instead of
  // silently.
  if (!session.gymId) {
    return Response.json({ error: "No gym associated with this account." }, { status: 403 });
  }

  const context = { userId: session.userId, gymId: session.gymId, role: session.role };

  const { messages }: { messages: UIMessage[] } = await req.json();

  if (messages.length > MAX_AI_MESSAGE_COUNT) {
    return Response.json(
      { error: "This conversation has too many messages. Start a new chat." },
      { status: 400 },
    );
  }
  const inputSize = messages.reduce((total, m) => total + JSON.stringify(m).length, 0);
  if (inputSize > MAX_AI_INPUT_CHARS) {
    return Response.json({ error: "This message is too long." }, { status: 400 });
  }

  const usage = await checkAndIncrementUsage(context);
  if (!usage.allowed) {
    return Response.json(
      { error: "This gym has reached its daily AI usage limit. Try again tomorrow." },
      { status: 429 },
    );
  }

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: getModel(),
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools: buildAiTools(context),
    // Allows the model to call a tool and then produce a final narrated
    // answer in the same turn (tool call + result + text are separate
    // steps) — bounded, not open-ended, consistent with the fixed,
    // closed tool set this route exposes.
    stopWhen: stepCountIs(5),
    // Server-side visibility only — logs just the error's own message
    // (e.g. "401 Unauthorized", "rate limit exceeded"), never the
    // conversation/prompt or the API key, which this callback is never
    // given access to in the first place (see lib/ai/provider.ts).
    // Purely a logging hook: the client-facing stream error text is
    // unchanged, still the AI SDK's own default.
    onError: ({ error }) => {
      console.error("[api/ai] streamText error", error instanceof Error ? error.message : error);
    },
  });

  return result.toUIMessageStreamResponse();
}
