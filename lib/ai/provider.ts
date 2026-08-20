import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

/**
 * Provider abstraction (docs/architecture.md §6.3): a single seam every
 * caller (app/api/ai/route.ts) goes through, so switching providers later
 * (e.g. to OpenAI — already available, not installed until actually
 * needed) is a change confined to this file. The tool layer
 * (lib/ai/tools.ts), system prompt (lib/ai/systemPrompt.ts), and route
 * handler never reference a specific provider or model id.
 *
 * Anthropic Claude Haiku is the default (confirmed decision, Phase 9
 * planning) — the fastest/cheapest tier, well suited to short,
 * tool-grounded, narrate-the-numbers answers rather than open-ended
 * reasoning. Using the untimestamped "claude-haiku-4-5" alias (not a
 * dated snapshot id) so it tracks Anthropic's current Haiku release.
 *
 * ANTHROPIC_API_KEY is read only by @ai-sdk/anthropic's default export,
 * imported only in this file, which is "server-only" — never reachable
 * from a "use client" file, never included in any response body.
 */

const DEFAULT_MODEL_ID = "claude-haiku-4-5";

export function getModel(): LanguageModel {
  return anthropic(DEFAULT_MODEL_ID);
}
