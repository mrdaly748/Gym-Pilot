# AI layer

Provider-agnostic AI client (`provider.ts`), the fixed read-only tool set
(`tools.ts`), and the grounding system prompt (`systemPrompt.ts`) — built in
Phase 9, on top of the already-complete and already-tested Metrics Service.
No SQL tool, no write tool: see `docs/architecture.md` §6.

## Tool-selection evaluation

`tests/integration/ai-tools.test.ts` proves each tool's own `execute()`
returns correct, gym-scoped data — that's ordinary service-layer testing.
It does **not** prove that a real model, given the production system prompt
and the production tool schemas below, actually picks the right tool for a
realistic question. `tests/ai-evals/tool-selection.eval.test.ts` proves
that instead: it sends real gym-owner-style questions through
`generateText` using the real `getModel()`/`SYSTEM_PROMPT`/`buildAiTools()`,
and asserts on which tool got called and with which arguments — including a
few "superficially plausible but only one tool is actually correct" cases
(e.g. "is my revenue up or down" → `compareRevenuePeriods`, not
`getRevenueTrend`), and a few guardrail cases (a mutation request, and a
question with no backing tool, both of which should call nothing).

**What it does not prove**: the quality of the model's final narrated
answer (only which tool(s) it called), or anything about the hosted
Anthropic model's behavior beyond this specific prompt/schema/question set
— it is a regression check against prompt/tool-definition drift, not a
general model-quality benchmark.

**Never part of normal test execution.** It lives outside
`vitest.config.ts`'s and `vitest.db.config.ts`'s `include` globs, so
`npm test` / `npm run test:db` / CI never discover it, and it skips itself
entirely unless `ANTHROPIC_API_KEY` is set in the environment. Run it
deliberately, with a real key, via:

```bash
npm run test:ai-eval
```

This makes real, billed Anthropic API calls (the same Haiku model
production uses) — every tool's `execute()` is stubbed first, so no call
ever reaches the database regardless of which tool the model picks.
`temperature: 0` minimizes run-to-run variance, but a live model call is
never byte-for-byte guaranteed reproducible the way the rest of this
project's tests are — that's precisely why this suite is opt-in rather than
part of the deterministic CI-guaranteed suite.
