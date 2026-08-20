# Architecture & Technical Decisions Log — AI Gym Management SaaS

Status: Draft for review
Companion documents: `docs/product-spec.md` (product scope), `docs/architecture.md` (full design)

This is the running record of technical decisions: what was chosen, what alternatives were considered, why, and whether the decision is confirmed with you or still an assumption flagged for review. New entries are appended as the project progresses — this file is not rewritten, only added to (and corrected if a decision is later reversed, with the reversal noted rather than the old entry deleted).

---

## How to read this document

- **Status: Confirmed** — you explicitly chose this (e.g., via a direct question) or it's a direct, unambiguous requirement from `docs/product-spec.md`.
- **Status: Assumed — flagged** — a judgment call made to keep momentum, explicitly surfaced here rather than silently baked in. You should review these; they're reversible but affect later phases if changed late.
- **Status: Open** — genuinely undecided, blocks a specific phase, needs your input before that phase starts.

---

## D1 — Application shape: Next.js monolith

**Decision**: A single Next.js 15 (App Router, TypeScript) application, serving both UI and backend via Server Actions/Route Handlers. No microservices, no monorepo tooling.

**Alternatives considered**: separate frontend (React SPA) + backend (Node/Python API); microservice split by domain (members service, payments service, AI service).

**Why**: One deployable is dramatically easier for a solo developer to build, debug, and deploy. Nothing in the MVP scope has a scale, team-topology, or independent-deployability requirement that would justify the operational overhead of multiple services. Monorepo tooling (Turborepo/Nx) solves a multi-package problem this single-app project doesn't have.

**Status**: Confirmed (per your stack selection: full-stack TypeScript/Next.js + Postgres).

---

## D2 — Database + Auth vendor: Supabase

**Decision**: Supabase for managed Postgres (with Row-Level Security) and for Auth (email/password, session/JWT, password reset).

**Alternatives considered**: Neon (serverless Postgres) + a separate auth solution (Auth.js/NextAuth with a credentials provider, or Clerk); a fully custom auth implementation.

**Why**: You asked for a managed auth provider and a Postgres database on managed PaaS. Bundling both in Supabase means one vendor instead of two, native and well-documented RLS support (directly needed for tenant isolation, `docs/architecture.md` §5), and built-in password reset/session handling — which closes the "Authentication basics" gap the product spec explicitly flagged as missing (§26) without hand-rolling security-critical code. Clerk is a fine alternative but adds a second vendor for a capability Supabase already provides adequately for MVP's needs (email/password only, no social login required).

**Status**: Confirmed (per your "managed auth provider" + Postgres direction). Vendor lock-in risk noted: the data itself is standard Postgres (portable); Auth is more Supabase-specific but the user model is simple enough (email/password) that migration, if ever needed, is not expected to be severe.

---

## D3 — ORM: Prisma

**Decision**: Prisma as the ORM/migration tool.

**Alternatives considered**: Drizzle ORM; raw SQL with a query builder (e.g., Kysely).

**Why**: Prisma's migration workflow (`prisma migrate dev`/`deploy`) is mature and matches the project's "database design before dependent logic, phase-gated" discipline well. It has strong TypeScript ergonomics and a well-documented community pattern for the exact RLS-via-session-variable approach this project needs (`docs/architecture.md` §5.3). Drizzle is a legitimate, lighter-weight alternative — closer to raw SQL, slightly less "magic" — but Prisma's larger support surface and migration tooling reduce risk for a solo developer more than Drizzle's marginal performance/weight advantage matters at this scale.

**Status**: Assumed — flagged. Reasonable to revisit only if Prisma's RLS-transaction pattern proves awkward in Phase 1; low switching cost that early.

---

## D4 — Multi-tenancy model: shared schema + RLS + application-layer filtering

**Decision**: Single shared Postgres database, every tenant table carries a `gym_id` column, enforced by two independent layers (application-layer `WHERE gym_id = ...` on every query, plus Postgres RLS as defense in depth). See `docs/architecture.md` §5 for the full mechanism.

**Alternatives considered**: schema-per-tenant (one Postgres schema per gym); database-per-tenant (one Postgres database/instance per gym).

**Why**: At the target scale (spec §21: dozens to low-thousands of gyms, hundreds to low-thousands of members each), shared-schema-with-RLS is the standard, well-proven pattern — used by the large majority of production multi-tenant SaaS at this scale. Schema-per-tenant multiplies migration complexity by the tenant count (every schema change must run N times) for no isolation benefit beyond what RLS already provides. Database-per-tenant adds real operational cost (connection management, backup/restore per tenant, provisioning automation) that is disproportionate to a solo developer's MVP needs. The product spec's insistence that isolation be enforced "at the database/application layer, not merely UI hiding" is satisfied by RLS + app-layer filtering without needing per-tenant infrastructure.

**Status**: Confirmed as the technical implementation of a hard product requirement (spec §16). This decision is the one most worth re-reading if tenant count or per-tenant data volume ever grows far beyond MVP assumptions.

---

## D5 — Membership/attendance status: computed on read, not stored + cron-updated

**Decision**: Time-dependent status (active/expiring/expired/frozen/cancelled, "new member," etc.) is derived at query time from stored dates and flags — never a mutable status column updated by a scheduled job.

**Alternatives considered**: a `status` column on the membership row, updated nightly by a cron job/scheduled function.

**Why**: Removes an entire category of infrastructure (no scheduler/cron/queue needed anywhere in MVP) and removes a whole class of bugs (a job that didn't run, or ran late, producing stale status). It's also the mechanism that makes the canonical-metrics single-source-of-truth requirement (spec §13.0) mechanically true rather than aspirational: dashboard, analytics, and the AI's tools all call the same derivation function — there's no second implementation to drift out of sync.

**Status**: Confirmed as the technical implementation of spec §13.0. Revisit only if a genuine performance problem appears at a scale far beyond MVP (unlikely — these are simple date comparisons over indexed columns).

---

## D6 — AI provider abstraction: Vercel AI SDK, Anthropic Claude default

**Decision**: The `ai` package (Vercel AI SDK) as the provider-agnostic interface; Anthropic Claude configured as the default model.

**Alternatives considered**: Anthropic's SDK directly (no abstraction); OpenAI's SDK directly (no abstraction); LangChain or a similar heavier framework.

**Why**: You asked for Claude by default but explicitly required the application not be unnecessarily locked to one AI vendor. The Vercel AI SDK provides a single interface with built-in, well-supported tool-calling across multiple providers, which maps directly onto the read-only tool-layer design (`docs/architecture.md` §6). It's a thin, well-maintained abstraction rather than a heavy framework like LangChain, which would add complexity (chains, agents, memory abstractions) this project's narrow, tool-calling-over-a-fixed-metrics-API use case doesn't need.

**Status**: Confirmed (per your Claude preference + the spec's provider-agnostic requirement).

---

## D7 — No vector database, no RAG pipeline

**Decision**: The AI assistant answers questions entirely through tool-calling over the relational Metrics Service — no embeddings, no vector store, no retrieval pipeline.

**Alternatives considered**: a RAG pipeline (embed gym data, retrieve relevant chunks, feed to the model).

**Why**: The product spec's AI questions ("how many memberships expire this week," "compare this month to last") are structured queries with precise, computable answers — not document-retrieval problems. There are no documents in this product to search over. A vector database would be infrastructure solving a problem the actual requirement doesn't have, directly contradicting the spec's "no unnecessary infrastructure" and "no dedicated vector databases unless justified" constraints.

**Status**: Confirmed as a direct application of the spec's explicit infrastructure constraint.

---

## D8 — No background job system / queue in MVP

**Decision**: No cron scheduler, message queue, or event bus anywhere in the MVP architecture.

**Alternatives considered**: a job queue (e.g., for computing nightly status updates — obviated by D5; or for scheduled digest emails — not an MVP feature).

**Why**: Nothing in the current product scope requires asynchronous background processing at this scale. Status computation is synchronous-on-read (D5); there are no scheduled notifications in MVP (email/SMS reminders are explicitly deferred per spec §24). Introducing queue infrastructure now would be speculative.

**Status**: Confirmed. Revisit if/when a genuinely async feature is added to scope (e.g., scheduled digest emails, which are themselves post-MVP per the spec).

---

## D9 — Gym Staff AI assistant access

**Decision**: The AI assistant is Gym Admin-only; Gym Staff does not have AI Assistant access. This matches `docs/product-spec.md` §15.5's stated default.

**Why**: The product spec flagged this as inferred-but-unconfirmed (§15.5, §25 open question #3) — a direct consequence of Gym Staff's exclusion from sensitive financial analytics, but never explicitly decided in the Phase 0 product decisions. Confirmed during Phase 9 planning. This architecture makes it a single role check on the `/api/ai` route and `assistant/` UI route, so reversing it later is a small, low-risk change.

**Status**: **Confirmed.** Implemented in Phase 9: `requireRole("GYM_ADMIN")` on both `app/api/ai/route.ts` and `app/gym/[gymId]/assistant/page.tsx`, and RLS policies on `ai_usage_counters` are Gym Admin-only.

---

## D10 — Minimal Tunisian legal/receipt requirements

**Decision (for now)**: No formal tax/invoicing/receipt-numbering system is built in MVP; payment records are designed so an optional receipt/reference field could be added later without a breaking schema change, but nothing legal-compliance-specific is implemented now.

**Why**: `docs/product-spec.md` §25 explicitly left this unresearched — whether Tunisia requires even a minimal formal receipt for a payment-recording feature is unknown, and the spec instructs not inventing an answer to unresolved product questions.

**Status**: **Open**, not blocking any phase through Phase 9. Should be resolved with real research (not assumed) before Phase 10 (production launch) if it turns out to be a legal requirement rather than a nice-to-have.

---

## D11 — Exact data retention / permanent deletion policy

**Decision (for now)**: The *mechanism* is built in Phase 1 — gym deactivation is a status flag, structurally separate from permanent deletion, and deactivation never triggers automatic data destruction (per spec §13 Rule 16). The *policy* — how long data is retained after deactivation, who can request/approve permanent deletion, and the deletion process itself — is not implemented in MVP.

**Why**: `docs/product-spec.md` §25 explicitly left the specifics open, likely needing legal input. Building the deactivation/deletion-are-separate mechanism now costs nothing extra (it's the natural design anyway) and doesn't require the policy specifics to be settled first.

**Status**: **Open** on the policy specifics; the mechanism is confirmed and will be built in Phase 1 regardless. Should be resolved before Phase 10 if real customer data is expected to accumulate meaningfully before the policy is settled.

---

## Open Items Summary (also tracked per-phase in `docs/implementation-plan.md`)

*Kept up to date as new entries are appended below — this table is a live index, not a one-time snapshot.*

| ID | Item | Blocks | Needs |
|---|---|---|---|
| D9 | Gym Staff AI access | Phase 9 | Your explicit confirmation |
| D10 | Minimal Tunisian legal/receipt requirement | Phase 10 (not earlier) | Legal/product research |
| D11 | Exact data retention/deletion timeline | Phase 10 (not earlier) | Product decision, possibly legal input |
| D12 | ~~Docker/Supabase CLI unavailable for Phase 0~~ | — | Resolved by D20 (hosted Supabase dev project) — no longer open |
| D14 | npm audit: 3 high-severity advisories in Prisma CLI devDependency | None (dev-tool only) | Your call: accept and monitor, or pin Prisma to 6.12.x |
| D19 | Shadow-DB fallback ladder — which rung actually works | Phase 1 migration authoring against real Supabase | Testing against the real Supabase dev project once created |
| D21 | ~~Phase 0 "CI green" claim was inaccurate~~ | — | Resolved — CI now genuinely executes (git initialized, pushed, has caught real failures). Phase 1's changes are not yet pushed/CI-verified — see the Phase 1 report. |
| — | Hosted Supabase dev project (D20) still doesn't exist | Supabase Auth verification (Phase 1's E2E login/logout/reset flow, and D19) | You creating the project — manual step, exact console steps in the Phase 1 preparation report |

Phases 0–8 proceed on the confirmed decisions in this document; the items above are the ones genuinely requiring your input or a real environment to resolve.

---

*End of document. New decisions are appended below this line as the project progresses.*

---

## D12 — Local Postgres for Phase 0 (Docker/Supabase CLI unavailable)

**Decision (for now)**: `docs/architecture.md` §3.9 specifies local development via the Supabase CLI's local stack (Postgres + Auth + RLS via Docker). Neither Docker nor the Supabase CLI is installed in this implementation environment. To still satisfy Phase 0's verification requirement ("`prisma migrate dev` runs successfully against a local Postgres instance"), Prisma's own local dev database (`npx prisma dev`, new in Prisma 7 — runs a local Postgres process without Docker) was used instead, purely to prove the schema/migration toolchain works end-to-end.

**What this does and does not prove**: it confirms Prisma config loading, schema validation, and migration execution against a real Postgres. It does **not** exercise Supabase Auth or RLS-via-Supabase-session-JWT — those remain untested until either (a) Docker + Supabase CLI are installed locally, or (b) development points at a real hosted Supabase project instead. The RLS pattern itself (`SET LOCAL app.current_gym_id` inside a Prisma transaction, §5.3) is Postgres-native and works identically against either a local Prisma-dev Postgres or Supabase Postgres — that part isn't blocked. What's blocked is Supabase Auth specifically.

**Status**: **Open.** Before Phase 1 (which needs Supabase Auth), you need to either install Docker Desktop + the Supabase CLI on this machine, or provide a hosted Supabase project (free tier is sufficient) to develop against instead of a fully local stack. Neither was set up automatically — installing Docker Desktop is a large, disruptive system change (likely requires admin rights/a restart) that wasn't taken without asking first.

The local `prisma dev` Postgres server was left running in the background (`npx prisma dev -d`) for continued convenience; stop it with `npx prisma dev stop` if not needed. `.env`'s `DATABASE_URL` currently points at it.

---

## D13 — Framework/tooling versions at implementation time

**Decision**: Scaffolded with the latest stable versions available at implementation time rather than the exact versions named in `docs/architecture.md` (which said "Next.js 15" as a snapshot of what was current when that document was written): **Next.js 16.3.1**, React 19.2.8, **Prisma 7.9.1** (a new major version with a different client-generator API than Prisma 5/6 — output path must be explicit in `schema.prisma`, uses `prisma.config.ts` for datasource config instead of only `.env`).

**Why**: this is a brand-new project with no legacy code to stay compatible with — there's no reason to deliberately install an older major version. `docs/architecture.md` didn't pin an exact version for a specific compatibility reason; "Next.js 15" was simply what was current at design time.

**Status**: Assumed — flagged. `docs/architecture.md` §3.1 should be read as "Next.js (App Router)" rather than literally pinned to major version 15; no functional impact identified. Confirm if you'd prefer pinning to a specific major for stability reasons instead of tracking latest.

---

## D14 — npm audit: 3 high-severity advisories in a Prisma CLI dev-dependency

**Decision (for now)**: left as-is, not force-downgraded.

**Detail**: `npm audit` reports 3 high-severity advisories for `deepmerge-ts` (a stack-exhaustion/DoS issue), pulled in transitively via `@prisma/config` → `prisma` (the CLI package, a devDependency only — not part of the deployed application runtime). `npm audit fix --force` would downgrade `prisma`/`@prisma/client` to 6.12.0, a breaking change to a package this project actively depends on.

**Why not fixed automatically**: downgrading a core dependency is exactly the kind of change that shouldn't happen silently. The vulnerable code path is in CLI tooling invoked by a developer locally (schema/migration commands), not in code that runs in production — the practical exposure is low, but this is your call to make, not a default to assume.

**Status**: **Open.** Options: (a) accept current versions and monitor for a patched release of `deepmerge-ts`/`@prisma/config`, (b) deliberately pin `prisma`/`@prisma/client` to 6.12.x. No action taken pending your decision.

---

## D15 — RLS session-context mechanism corrected: `set_config()`, not `SET LOCAL ... = ${value}`

**Decision**: The RLS-transaction helper in `docs/architecture.md` §5.3 uses `SELECT set_config('app.current_gym_id', $1, true)` to set transaction-local session context, not the `SET LOCAL app.current_gym_id = ${gymId}` form shown in an earlier draft of that section.

**Why this changed**: Postgres's `SET` statement does not accept bind parameters. Prisma's `$executeRaw` tagged template always parameterizes, so the original form would either fail outright or have to be rewritten with `$executeRawUnsafe` and manual string interpolation — introducing a SQL-injection risk in the single function every tenant-isolation guarantee in the system depends on. `set_config(name, value, is_local)` is an ordinary, parameterizable function call with identical transaction-local semantics (`is_local = true` behaves exactly like `SET LOCAL`) and no unsafe raw SQL.

**Classification**: an implementation correction to how an already-approved mechanism is expressed in SQL, not an architecture redesign. The design (transaction-scoped session settings, checked by RLS policies) is unchanged.

**Status**: Confirmed — approved for Phase 1 implementation.

---

## D16 — Dedicated least-privilege `app_user` runtime role, `FORCE ROW LEVEL SECURITY`

**Decision**: The application's runtime database connection uses a dedicated Postgres role (`app_user`) that (a) is explicitly `NOBYPASSRLS`, (b) does not own any of the tables it queries, and (c) is granted only the DML it actually needs. Every tenant table has both `ENABLE` and `FORCE ROW LEVEL SECURITY` set. Schema migrations run under a separate, more privileged owner role — never `app_user`.

**Alternatives considered**: connecting as Supabase's default `postgres` role for everything (simpler, one role, no bootstrap SQL to maintain).

**Why**: Two independent Postgres behaviors can make correctly-written RLS policies silently do nothing — a role that owns a table bypasses RLS on it unless `FORCE` is also set, and any role with the `BYPASSRLS` attribute ignores RLS regardless of `FORCE`. Supabase's own `postgres` role is privileged enough that assuming it's safe for this purpose without checking would be exactly the kind of unverified assumption this project has been explicit about not making. A dedicated, deliberately unprivileged role removes the question entirely rather than relying on a property of a role we don't control. The cost is a small piece of environment-specific bootstrap SQL (role creation, grants) run once per environment, outside the Prisma migration history (since it differs per environment and contains a password).

**Status**: Confirmed — approved for Phase 1. Verified by an automated meta-test (`rolbypassrls = false`, `relforcerowsecurity = true` on every tenant table) that must pass before any other isolation test is treated as meaningful — see `docs/implementation-plan.md` Phase 1.

---

## D17 — Third session GUC (`app.current_user_id`) and an internal `users` table

**Decision**: Add a third transaction-local session setting, `app.current_user_id`, alongside the two already specified (`app.current_gym_id`, `app.current_role`). Add an internal `public.users` table whose `id` mirrors `auth.users.id`, with no foreign key across the schema boundary.

**Why**: The original two-GUC design has a bootstrap gap — resolving a user's `{gymId, role}` requires querying `gym_memberships`, but that query happens *before* `gymId` is known, so it can't be gated by `app.current_gym_id`. `app.current_user_id`, set immediately after Supabase verification (before any query), closes this: `gym_memberships` gets its own RLS policy keyed on `user_id = current_setting('app.current_user_id', true)`, so even this bootstrap lookup is RLS-protected rather than an unprotected special case. The internal `users` table is what the product spec's "association between an authenticated Supabase user and the application's internal user record" concretely refers to; keeping it free of a cross-schema FK is what keeps the shadow database (local migration drift detection) and CI's plain-Postgres test database viable, since neither has Supabase's `auth` schema.

**Alternatives considered**: skip the bootstrap-lookup RLS policy and treat that one query as inherently safe because it's filtered by a cryptographically verified `userId` in application code. Rejected — it would be the only query in the system without database-layer defense-in-depth, undermining the stated principle that isolation must not depend solely on application code being correct.

**Status**: Confirmed — approved for Phase 1, both are additions to `docs/architecture.md` §3 and §5.3, not redesigns of anything previously decided.

---

## D18 — CI isolation/integration tests run against an ephemeral Postgres, not the hosted Supabase dev project

**Decision**: `tests/integration/` and `tests/isolation/` run against a disposable Postgres instance — a `postgres:16` GitHub Actions service container in CI, Prisma's local dev Postgres (`npx prisma dev`) for a developer running the same suite locally — with migrations (schema + RLS) applied fresh each run. The hosted Supabase dev project (D-below, hosted-dev-project decision) is never a target of automated test runs.

**Alternatives considered**: running these test suites directly against the shared hosted Supabase dev project.

**Why**: Automated tests that seed, mutate, and delete data need to be fast, fully reproducible, and safe to run concurrently (e.g., two CI runs for two open PRs) without corrupting whatever state a human happens to have in the dev project at that moment, or without one CI run's leftover data changing another run's results. An ephemeral, fresh-per-run Postgres instance has none of those problems and needs no new local developer tooling (Docker) — GitHub's hosted runners provide Postgres service containers natively, and Prisma's local dev Postgres already proved itself in Phase 0.

**Status**: Confirmed — approved for Phase 1.

---

## D19 — Shadow database fallback ladder for `prisma migrate dev`

**Decision**: `prisma migrate dev` requires a shadow database for drift detection, and it is not yet known whether the hosted Supabase dev project's connecting role has `CREATEDB` (needed for Prisma to create/drop that shadow database automatically). Phase 1 tries, in order: **(A)** let `prisma migrate dev` manage its own shadow database against the Supabase dev project, if the role permits it; **(B)** if not, point `SHADOW_DATABASE_URL` at a local Postgres instance (Prisma's local dev Postgres) instead; **(C)** if neither is convenient, author and review migrations locally with `migrate dev` against local Postgres, then apply them to the Supabase dev project with `migrate deploy` (which needs no shadow database at all) — this option also matches exactly how CI and production apply migrations, so it's not a lesser fallback so much as the most consistent option.

**Why a ladder instead of a single decision now**: whether option A works depends on a permission on the actual hosted project, which hasn't been created yet as of this entry — asserting an answer without checking would be exactly the kind of unverified claim this project is trying to avoid. All three options use tooling already in place from Phase 0; none require new installation.

**Status**: Confirmed — approved for Phase 1. Which rung of the ladder is actually used will be recorded here once the Supabase dev project exists and this has been tested, not assumed in advance.

---

## D20 — Hosted Supabase dev project confirmed as the Phase 1+ development environment (supersedes D12's open path)

**Decision**: Development happens against a **hosted Supabase project dedicated to development** (e.g. `ai-gym-saas-dev`) — not a local Docker/Supabase-CLI stack, and not Prisma's local dev Postgres (which remains in use, but only as the ephemeral substrate for automated tests per D18, never as "the development database"). This is the resolution to the open question D12 left after Phase 0, where Docker/Supabase CLI were unavailable.

**Why**: real Supabase Auth and real RLS during development, without requiring Docker to be installed on the development machine, and a topology that already matches the eventual production shape (a hosted Supabase project) rather than a local emulation of one. Local Docker/Supabase CLI remains available as a future option but is not introduced speculatively — only if a concrete reason makes the hosted project insufficient.

**Status**: Confirmed. D12 is left unedited as the accurate historical record of what Phase 0 actually did and why; this entry records how that was resolved for Phase 1 onward. The dev project itself has not been created yet — creating it is a manual step for the project owner (see `docs/implementation-plan.md` Phase 1).

---

## D21 — Correction: Phase 0's "CI green" claim was inaccurate

**Decision/correction**: The Phase 0 completion report stated CI was green. That was based on running `lint`/`typecheck`/`test`/`build` locally — **GitHub Actions has never actually executed**, because the repository is not yet a git repository (`git init` was never run) and has no remote. `.github/workflows/ci.yml` exists and is believed correct, but its actual execution is unverified.

**Why recorded here rather than just fixed silently**: this project's own standing rule is not to claim something is verified when only local behavior was checked. The Phase 0 report didn't meet that bar for the CI claim specifically, and the honest fix is a recorded correction, not a quiet edit to old reporting.

**Status**: Resolved/superseded. Git was subsequently initialized and pushed by the project owner, and GitHub Actions has genuinely executed since — it caught two real issues (an out-of-sync lockfile; a missing Next.js typegen step before `tsc`), both fixed in follow-up commits. The original claim was inaccurate at the time it was made; CI now demonstrably runs. Note: the Phase 1 changes recorded in D22/D23 below have **not** been pushed or observed running in CI as of this entry — that verification is still outstanding, and this document does not claim otherwise.

---

## D22 — Local test substrate corrected: `embedded-postgres`, not `prisma dev` (D18 revised)

**Decision**: `tests/helpers/testDb.ts` uses `embedded-postgres` (a genuine native Postgres binary) for local isolation/integration test runs, not Prisma's local dev database (`npx prisma dev`) as D18/D20 assumed. CI is unaffected — it already used, and continues to use, a real `postgres:16` service container.

**Why**: during Phase 1 implementation, `npx prisma dev` was empirically found to **not enforce real Postgres role-based authentication** — every connection was silently authenticated as the `postgres` superuser regardless of the username/password supplied in the connection string (verified directly: `SELECT current_user` returned `postgres` even when connecting as `app_user` with a deliberately wrong-looking role). This makes it structurally incapable of validating the one thing Phase 1 exists to prove — that `app_user`'s restricted privileges and RLS policies actually constrain a non-owner role. A raw `@electric-sql/pglite`/`pglite-socket` connection (the engine `prisma dev` is itself built on) was tested directly and has the identical limitation, ruling out a lighter fix. `embedded-postgres` (a real, native `pg_ctl`-managed Postgres 18 binary, downloaded once per platform) was verified to correctly enforce role separation and privilege checks before being adopted — this was not assumed, it was tested the same way the `prisma dev` limitation itself was discovered.

**Alternatives considered**: Docker (unavailable in this environment, per D12); a hosted Supabase dev project (no credentials available, per D20); accepting `prisma dev`'s behavior and only trusting owner-connection checks (rejected — this would mean the isolation suite could pass with RLS silently non-functional for the actual runtime role, which is exactly the failure mode the meta-test exists to catch).

**Status**: Confirmed, implemented, and verified — `tests/helpers/testDb.ts`'s meta-test (`tests/isolation/00-meta.test.ts`) includes an explicit `SELECT current_user` assertion specifically so this exact failure mode can never regress silently again. `embedded-postgres` has no stable (non-beta) release line as of this entry — acceptable for a local-only test-infrastructure dependency (never used in CI or production), flagged for awareness rather than treated as blocking.

---

## D23 — Minor Phase 1 corrections verified against actual installed-version/runtime behavior

**Decision**: Several small implementation details were corrected during Phase 1 after being checked against reality rather than assumed from documentation, each also fixed directly in `docs/architecture.md` at the point of discovery:

- **Prisma config has no `directUrl` field in the installed version.** `@prisma/config`'s actual `Datasource` type (`node_modules/@prisma/config/dist/index.d.ts`) supports only `url` and `shadowDatabaseUrl` — some Prisma 7 documentation describes a `directUrl` field that doesn't exist in the version actually installed (7.9.1). Resolved by having `prisma.config.ts`'s `url` point at `DIRECT_URL` (the CLI always acts as the migration-owner role) while the application's runtime Prisma client reads `DATABASE_URL` directly and independently in `lib/server/db.ts`, entirely bypassing `prisma.config.ts` (which only ever affects CLI commands). See architecture §5.6.
- **Next.js 16 renamed `middleware.ts` to `proxy.ts`.** Confirmed against the installed Next.js version's own bundled docs (`node_modules/next/dist/docs/.../proxy.md`) after the dev server logged a deprecation warning. Same API (`NextRequest`/`NextResponse`/`config.matcher` unchanged) — a mechanical rename, applied immediately since this is new code, not a legacy file needing gradual migration.
- **`(platform)`/`(gym)` route groups don't produce the URLs the design assumed.** Route group folders (parentheses) add no URL segment — `app/(platform)/page.tsx` would have resolved to `/`, colliding with the existing root page, and `app/(gym)/[gymId]/page.tsx` would have resolved to `/[gymId]` at the top level, not `/gym/:gymId` as the redirect logic in `app/(auth)/actions.ts` assumes. Caught by actually running `next build` and inspecting the emitted route list, not by inspection alone. Fixed by using real folders (`app/platform/`, `app/gym/[gymId]/`) instead of route groups for these two areas; `(auth)/` remains a route group since its routes (`/login`, `/forgot-password`, `/reset-password`) were never meant to have a URL prefix and don't collide with anything.

**Why recorded together rather than as separate entries**: each is a small, self-contained, verified-not-assumed correction in the same spirit as D15/D19, grouped here to avoid one decision entry per minor fix. None represent a design change — each is a case of the initial assumption being checked against the actually-installed software and corrected.

**Status**: Confirmed, implemented, and verified (typecheck, build, and manual route-by-route HTTP checks all pass with the corrected structure).

---

## D24 — Phase 2 provisioning: staff-disable mechanism, credential delivery, and a real RLS gap found and fixed

**Decisions** (all confirmed with you before implementation):
- **Staff disable**: `gym_memberships.disabled_at` (nullable timestamp), not Supabase Auth banning. Checked in the single choke point `lib/server/auth.ts`'s `getSessionContext()` (via `lib/server/services/identity.ts`'s `resolveIdentity()`), alongside a new `gyms.status = SUSPENDED` check — both block a session identically, whether at login or on an already-open session hitting a gym/account that becomes blocked mid-session. No RLS policy change was needed for this column: the existing Phase 1 `gym_memberships_update` policy already scopes `UPDATE` to a Gym Admin's own gym.
- **Initial credentials**: `supabaseAdmin.auth.admin.inviteUserByEmail()` (`lib/server/supabaseAdmin.ts`, a new service-role-only module, Auth Admin API calls only, never business data). Neither Platform Admin nor Gym Admin ever sees or sets another user's password; the invite reuses Phase 1's existing `/auth/callback` → `/reset-password` flow.
- **Non-atomic provisioning**: Supabase Auth user creation and the PostgreSQL `users`/`gyms`/`gym_memberships` writes are explicitly two separate steps, not one transaction (they can't be — Auth is an external system). Order: invite the Auth user first; if the subsequent PostgreSQL transaction fails, best-effort delete the just-created Auth user and rethrow the original error (`lib/server/services/platformAdmin.ts#createGym`, `lib/server/services/gymStaff.ts#createGymStaff`).

**A genuine RLS gap was found and fixed during implementation, not assumed away:**
1. `tx.user.create()` under a Gym Admin session failed with a real RLS-policy-violation error (`new row violates row-level security policy for table "users"`), even though `users_insert`'s `WITH CHECK` explicitly allows `app_current_role() = 'GYM_ADMIN'`. Root cause, confirmed by reproducing it with both raw SQL and Prisma directly: Prisma's `create()` always issues `INSERT ... RETURNING`, and Postgres evaluates the table's `SELECT` policy on the returned row in addition to the `INSERT` policy's `WITH CHECK`. Phase 1's `users_select` policy only allowed seeing your own row (or, for Platform Admin, any row) — a Gym Admin inviting someone new was never reading their own row. Fixed with no RLS change: `tx.user.createMany()` instead of `tx.user.create()` (Postgres `createMany` has no `RETURNING`, so only the `INSERT` policy applies — which is the only thing that actually needed to be authorized).
2. `listGymStaff()` has a genuine, non-avoidable need to `SELECT` other users' `email` values (a Gym Admin viewing their own gym's staff list) — not a query-shape artifact like #1, a real read Phase 1's `users_select` policy structurally denied (would have silently returned zero/blank rows, not an error). Presented three options to you (extend `users_select`'s RLS policy; denormalize `email` onto `gym_memberships`; fetch emails from the Supabase Admin API per row) — you chose extending the RLS policy. `prisma/migrations/20260818130000_gym_admin_can_read_own_gym_staff_users/migration.sql` adds a third `USING` branch: visible if the caller is a `GYM_ADMIN` and the target user has a `gym_memberships` row in the caller's own gym (`EXISTS` subquery keyed on `app_current_gym_id()`). This does not break the acyclic-policy rule from `docs/architecture.md` §5.3b — `gym_memberships`'s own policies still never reference `users`, so the dependency is one-directional. `docs/architecture.md` §5.3b's wording was corrected to state the rule precisely ("no cycle," not "no reference at all") rather than leaving the now-inaccurate stricter phrasing in place.

**Why recorded together**: all three are Phase 2 provisioning decisions from the same implementation pass; the RLS gap specifically is recorded with the same rigor as D15/D22 (found by reproducing the actual error, not assumed, and fixed at the smallest correct layer — query shape for #1, a real policy extension only where a query-shape fix was structurally impossible for #2).

**Status**: Confirmed, implemented, and verified — `tests/isolation/staff-disable.test.ts` (raw SQL, no application code) and `tests/integration/provisioning.test.ts` (Prisma service layer, Supabase Auth Admin API mocked) both pass, including the create-then-compensate failure path.

