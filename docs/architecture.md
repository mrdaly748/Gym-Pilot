# Technical Architecture — AI Gym Management SaaS

Status: Draft for review
Source of truth for product scope: `docs/product-spec.md` (this document does not redefine product scope — it explains how that scope is built)
Companion documents: `docs/implementation-plan.md` (phased build order), `docs/decisions.md` (decision log with alternatives considered)

---

## 0. Purpose and scope of this document

This document describes the technical architecture for the MVP: application structure, authentication/authorization, tenant isolation, database design, AI architecture, security boundaries, external services, and deployment. It intentionally does **not** contain database table/column-level DDL, API route signatures, or UI component design — those are implementation details that follow from this document during the phases in `docs/implementation-plan.md`, not decisions to make here.

Every design choice below is justified against a concrete requirement in `docs/product-spec.md`. Where a choice is a judgment call rather than a direct requirement, it's marked and cross-referenced in `docs/decisions.md`.

---

## 1. Overall Application Architecture

**A single Next.js (App Router, TypeScript) monolith** — implemented on **Next.js 16.x** (the latest stable major at implementation time; this document intentionally does not pin an older major just to match its own original draft — see `docs/decisions.md` D13). One codebase, one deployable, serving both the UI and the backend (Server Actions for mutations/queries, a small number of Route Handlers where a true streaming HTTP endpoint is needed — chiefly the AI assistant).

No microservices, no monorepo tooling (Turborepo/Nx), no event bus, no message queue. The product spec explicitly warns against infrastructure the MVP doesn't need, and a solo developer is best served by one language, one deploy target, and one place to look when something breaks. Nothing in the MVP scope (spec §8–§11) has an availability, scale, or team-topology requirement that would justify splitting services.

This is revisited only if a genuinely separate deployable ever appears (e.g., a distinct mobile app in a later phase of the product) — not speculatively now.

---

## 2. Frontend / Backend Structure

```
middleware.ts                  Supabase session/token refresh (runs on every request)
app/
  (auth)/                      Login, password reset — Supabase Auth-backed flows
  (platform)/                  Platform Admin area: gym list, create gym, suspend/reactivate
  (gym)/[gymId]/                Gym Admin + Gym Staff area — every route here is tenant-scoped
    dashboard/
    members/
    memberships/
    payments/
    attendance/
    trainers/                   Gym Admin only (route-guarded)
    expenses/                   Gym Admin only (route-guarded)
    analytics/                  Gym Admin only (route-guarded)
    assistant/                  AI assistant UI — Gym Admin only in MVP (see §6.5)
    staff/                      Gym Staff login management — Gym Admin only
  api/
    ai/route.ts                  AI assistant streaming endpoint (Route Handler — Server Actions don't stream)

lib/
  server/
    db.ts                        Prisma client (driver adapter) + withUser()/withTenant()/withPlatform() (see §5.3)
    supabase.ts                   Server-side Supabase client (@supabase/ssr); getUser()-based verification only
    auth.ts                       Session/role resolution; requireRole()/requireGym() guards
    errors.ts                     AuthorizationError, NotFoundError
    services/                     ALL business logic. The only layer allowed to import Prisma.
      identity.ts                  gym_memberships bootstrap lookup; the only module lib/server/auth.ts calls into
      members.ts
      plans.ts
      memberships.ts               includes status-derivation (canonical, see §5.5)
      payments.ts
      attendance.ts
      trainers.ts
      expenses.ts
      metrics.ts                   canonical dashboard/analytics/AI metric definitions (spec §13.0)
      platformAdmin.ts
  ai/
    provider.ts                   Provider-agnostic AI client (Vercel AI SDK), default Anthropic Claude
    tools.ts                      Fixed, read-only tool definitions — each wraps one metrics.ts function
    systemPrompt.ts               Grounding/boundary instructions (spec §15)

components/                     UI, organized by feature area, mirrors app/ routes
prisma/
  schema.prisma
  migrations/
tests/
  unit/                          Business-rule/service-layer logic, no DB
  integration/                   Service layer against a real local Postgres (RLS enabled)
  isolation/                     Dedicated cross-tenant leakage suite (see §5.4) — required gate
  e2e/                           Playwright, critical user flows
```

**Architectural rule, enforced by code review and (from Phase 0 onward) an ESLint boundary rule**: nothing outside `lib/server/services/*` may import the Prisma client. Every route, Server Action, and AI tool reaches the database only through a service function. This is what keeps tenant scoping and canonical metric definitions in one place instead of being re-implemented — and potentially re-broken — per screen.

---

## 3. Authentication

**Supabase Auth**, email + password for MVP (magic-link/social sign-in are not needed by the spec and are not built).

Rationale: it is a managed provider (per confirmed direction), bundled with the same Postgres project we're already using for the database (one vendor, less operational surface for a solo developer), and it provides session/JWT handling and password reset out of the box — directly closing the "Authentication basics" gap the product spec explicitly flagged as missing (§26).

**Identity model:**
- Every human user (Platform Admin, Gym Admin, Gym Staff) is a Supabase Auth user (`auth.users`, managed entirely by Supabase).
- The application maintains its own `users` table (`public.users`) whose `id` mirrors the corresponding `auth.users.id` — this is the "application's internal user record" the identity model is built on. It is **not** linked via a foreign key into the `auth` schema: a cross-schema FK would break both the Prisma shadow database (used for local migration-drift detection) and CI's plain-Postgres test database, neither of which has Supabase's `auth` schema available. The tradeoff (an auth user deleted directly in the Supabase dashboard can leave an orphaned `public.users` row) is accepted for Phase 1 — user provisioning/deprovisioning becomes a single, deliberate service-layer operation from Phase 2 onward, which is where both sides of that relationship are meant to be kept in sync anyway.
- A `gym_memberships` table (`user_id`, `gym_id`, `role`) is the single source of truth for authorization. Platform Admins have a role but no `gym_id` (they are not scoped to any gym). Gym Admin and Gym Staff rows always have a `gym_id`. A `CHECK` constraint enforces this pairing at the database level (nullable `gym_id` is otherwise an easy place for ambiguous ownership to creep in), and a partial unique index prevents more than one platform-admin row per user (a plain composite unique constraint doesn't catch this, since SQL treats `NULL` `gym_id` values as all distinct from one another).
- A user could theoretically hold memberships at more than one gym in the data model (e.g., a Gym Admin who owns two entirely separate gym accounts) — this is not a feature we build UI for in MVP (spec assumes one gym per Gym Admin account, §8.1), but the schema doesn't have to forbid it structurally; the application simply never presents a multi-gym switcher in MVP.
- Session resolution happens once per request, server-side, in `lib/server/auth.ts`. It resolves the Supabase session → verified `{ userId, gymId, role }` — every service-layer function receives this pre-verified context as an argument. A service function that doesn't have it cannot run; there is no code path where a service function trusts a client-supplied `gymId` or role.
- **Verification must always call `supabase.auth.getUser()`, never `getSession()`, on the server.** `getSession()` only reads the session out of the local cookie and does not verify it against Supabase's Auth server — it is not safe to use for an authorization decision. `getUser()` revalidates the token remotely. This is enforced by code review and is the only approved way to resolve "who is making this request" anywhere in the codebase.

---

## 4. Authorization Model (Roles)

Three fixed roles, matching spec §5, enforced at the service layer (not just hidden UI, per spec §5.3 and the explicit edge case in §18):

| Role | Scope | Can | Cannot |
|---|---|---|---|
| **Platform Admin** | Global (no `gymId`) | Create/list/suspend/reactivate gyms | Read/write any gym's members, payments, attendance, trainers, expenses, analytics, AI by default |
| **Gym Admin** | One gym | Everything within their gym: members, plans, memberships (incl. freeze/cancel), payments (incl. void/adjust), attendance, trainers, expenses, dashboard/analytics, AI assistant, manage Gym Staff logins | Access another gym's data |
| **Gym Staff** | One gym | Look up/register/edit members, membership assign/renew/freeze, record payments, check-in | Gym settings, plan/trainer management, expenses, analytics, AI assistant, void/adjust payments, cancel/archive anything, staff management |

Every Server Action and Route Handler declares the roles allowed to call it; `requireRole()` throws a hard authorization error (not a silent no-op, not a UI-only hide) if the caller's role doesn't match. This is directly testable and is a required test in every phase that introduces a restricted action (see `docs/implementation-plan.md`).

---

## 5. Database Architecture & Tenant Isolation

This is the section the product spec treats as non-negotiable (§16), so it's covered in depth.

### 5.1 Multi-tenancy model
**Postgres** (via Supabase), a single shared database, **shared-schema multi-tenancy**: every tenant-owned table carries a `gym_id` column. This is the standard, well-understood pattern at the scale this product targets (dozens to low-thousands of gyms — spec §21). Schema-per-tenant or database-per-tenant would multiply migration and connection-management complexity for no benefit a solo developer needs at this scale — see `docs/decisions.md` #4 for the full comparison.

### 5.2 Two independent, overlapping enforcement layers
The spec is explicit that isolation must be enforced "at the appropriate database/application authorization layers, not merely by hiding records in the UI." This architecture implements **defense in depth**, two layers that don't depend on each other:

1. **Application layer (primary, always on).** Every `lib/server/services/*` function receives the verified `gymId` from session context and includes it in every query's `WHERE` clause — for both reads and writes. This is the layer that runs on every single request.
2. **Database layer (defense in depth).** Postgres **Row-Level Security (RLS)** is enabled — and, critically, **forced** (§5.3a) — on every tenant table. Policies check transaction-local session settings against the row's `gym_id`. Every Prisma call that touches a tenant table runs inside a `$transaction` that first sets those settings, then runs the real query, in the same transaction (§5.3). Because the settings are transaction-scoped, there is no risk of one request's tenant context leaking into another request on a pooled connection.

If the application-layer filter were ever omitted by a future code change (a bug, a rushed feature), RLS still blocks the cross-tenant rows at the database — the two layers fail independently. This guarantee only holds if the layer described in §5.3a (dedicated role, `FORCE ROW LEVEL SECURITY`) is actually in place — see that section for why table ownership and role privileges can otherwise make RLS silently inert.

**Platform Admin queries** are the one exception: they target tables with no `gym_id` (`gyms` itself, plus the global slice of `gym_memberships`) and are gated purely by `role = PLATFORM_ADMIN`, not by gym-scoped RLS, because platform-level operations are inherently cross-gym by nature (listing all gyms).

### 5.3 The RLS-transaction helper (concrete pattern)

**Three** transaction-local session settings carry trust from the verified request context into Postgres — not two. The third one exists to close a bootstrap gap the original design didn't account for: resolving "which gym does this user belong to, and with what role?" requires querying `gym_memberships` *before* a `gymId` is known, so that lookup can't be gated by `app.current_gym_id`. It's gated by `app.current_user_id` instead — the one fact already available at that point (the Supabase-verified user id) — with its own RLS policy on `gym_memberships` (§5.3b).

```
app.current_user_id   — set immediately after Supabase verification, before any query
app.current_gym_id    — set once { gymId, role } are resolved from gym_memberships
app.current_role      — set alongside app.current_gym_id
```

These are set via `SELECT set_config('app.current_gym_id', $1, true)` — **not** `SET LOCAL app.current_gym_id = ${gymId}` as an earlier draft of this document showed. `SET` does not accept bind parameters in Postgres, so that form is either a syntax error or, if made to "work" via string interpolation (`$executeRawUnsafe`), a SQL-injection risk in the single most security-sensitive function in the codebase. `set_config(name, value, is_local)` *is* a normal parameterizable function call — same transaction-local semantics (the third argument, `true`, is what makes it local to the current transaction, exactly like `SET LOCAL`), correct syntax, no unsafe raw SQL anywhere in this path.

`lib/server/db.ts` exposes the helpers every service function must go through, conceptually:

```
withUser(userId, fn):
  Prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`
    return fn(tx)
  })
  // used only for the gym_memberships bootstrap lookup in lib/server/auth.ts

withTenant(userId, gymId, role, fn):
  Prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`
    await tx.$executeRaw`SELECT set_config('app.current_gym_id', ${gymId}, true)`
    await tx.$executeRaw`SELECT set_config('app.current_role', ${role}, true)`
    return fn(tx)
  })
  // used by every tenant-scoped service function

withPlatform(fn):
  Prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_role', 'PLATFORM_ADMIN', true)`
    return fn(tx)
  })
  // Platform Admin only; never sets a gymId; only touches non-tenant tables/columns
```

`fn` is where the actual business query runs, still filtered explicitly by `gymId` (or `userId`, for the bootstrap case) in application code (belt) — RLS policies re-check the same boundary at the database (suspenders).

**RLS policies are not expressible in Prisma's schema DSL** (there is no `CREATE POLICY` equivalent). They are authored as raw SQL in a dedicated migration, generated schema-only via `prisma migrate dev --create-only` and then hand-written before being applied — a manual step, not something the ORM generates for you. Policies reference only these `app.*` settings, never Supabase's `auth.uid()` — that mechanism is populated by Supabase's own PostgREST layer per-request and is not available to a direct Postgres connection from Prisma, which is how this application talks to the database.

### 5.3a Making RLS actually binding: dedicated runtime role + `FORCE`

Two independent Postgres behaviors can make RLS policies silently do nothing, even when written correctly:

1. **Table owners bypass RLS by default.** `ENABLE ROW LEVEL SECURITY` alone does not apply to the role that owns the table, unless `ALTER TABLE ... FORCE ROW LEVEL SECURITY` is also set.
2. **A role with the `BYPASSRLS` attribute ignores RLS entirely, `FORCE` or not.** Some managed-Postgres default roles carry this attribute.

Both are addressed structurally, not by hoping the connecting role happens to be safe:

- Every tenant table gets `ENABLE` **and** `FORCE ROW LEVEL SECURITY`.
- The application connects at runtime as a **dedicated, least-privilege `app_user` role**: `NOBYPASSRLS`, granted only the DML it needs (`SELECT`/`INSERT`/`UPDATE`, no `DELETE` where the product forbids it, no `DDL`), and explicitly **not** the owner of the tables it queries. Migrations run as a separate, more privileged owner role — never the runtime role.
- This split is verified by an automated meta-test (not just asserted in prose): `rolbypassrls = false` for `app_user`, and `relforcerowsecurity = true` on every tenant table. This must pass before any other isolation test is treated as meaningful, since every other test's result depends on this precondition actually holding — see `docs/implementation-plan.md` Phase 1 for the exact test.

### 5.3b `gym_memberships`'s own RLS policy (the bootstrap case)

`gym_memberships` doesn't fit the "gated by `app.current_gym_id`" pattern used elsewhere, because it's the table that *produces* `gymId` in the first place. Its policy is instead: a row is visible if `user_id = current_setting('app.current_user_id', true)` **or** `gym_id = current_setting('app.current_gym_id', true)` **or** the caller is a platform admin. The first branch is what makes the bootstrap lookup in `lib/server/auth.ts` safe without needing a `gymId` yet. Policy-writing rule to keep this from becoming circular: policies on `gym_memberships` and `users` never reference each other's tables — both read only the `app.*` settings, keeping the dependency graph acyclic.

### 5.4 Testability
A dedicated `tests/isolation/` suite is a **required, named gate**, not incidental coverage. It seeds two or more gyms with deliberately overlapping/similar data (same member names, adjacent primary keys) and asserts, for every entity type and every access path — service functions, Server Actions/Route Handlers, and AI tool calls — that a session scoped to Gym A can never read or write Gym B's rows, including by guessing another gym's row IDs directly. The suite's first, mandatory test is the meta-test from §5.3a (`app_user` is not RLS-bypassing, every tenant table has `FORCE ROW LEVEL SECURITY` set) — every other isolation test's meaning depends on that precondition holding, so it's checked first, not assumed. At least one test per entity runs as **raw SQL against a non-owner connection with no application code involved at all**, to prove the database layer works independently of the app layer, not merely that our own helper functions agree with themselves. This suite must pass before Phase 1 is considered done (see `docs/implementation-plan.md`) and is re-run against the staging environment before production launch (Phase 10).

### 5.5 Status is computed, not stored-and-cron-updated
Membership status (active / expiring soon / expired / frozen / cancelled), "new member," and similar time-dependent facts are **derived at query time** from stored dates and flags (e.g., `endDate < today` ⇒ expired) — never a mutable status column flipped by a background job. This has two benefits:
- It removes an entire category of infrastructure (no cron/queue needed to keep status columns fresh) — directly satisfying the "no unnecessary infrastructure" principle.
- It removes a whole class of bugs (stale status because a job didn't run) and is the mechanism that makes the canonical-metrics requirement (spec §13.0) actually true: the dashboard, analytics, and the AI's tools all call the *same* derivation function in `metrics.ts` — there is no second implementation of "what counts as active" to drift out of sync.

### 5.6 ORM
**Prisma** (major version 7). Mature migration workflow (`prisma migrate dev` / `deploy`), strong TypeScript ergonomics, and a well-documented community pattern for exactly the RLS-transaction approach in §5.3. See `docs/decisions.md` #3 for the comparison against Drizzle.

**Prisma 7 specifics that affect this project concretely** (not true of earlier Prisma majors, worth stating so it isn't re-discovered later):
- There is no bundled query-engine binary. Postgres access requires an explicit **driver adapter** — `@prisma/adapter-pg`, wrapping the standard `pg` Node driver — constructed with a connection string and passed to `new PrismaClient({ adapter })`. This doesn't change the RLS-transaction design in §5.3: `$transaction()` still checks out one connection for the whole transaction regardless of adapter, which is what the `set_config(..., true)` pattern depends on.
- `directUrl` and `shadowDatabaseUrl` (needed for migrations and drift detection, respectively) are configured in `prisma.config.ts`'s `datasource` block via the `env()` helper — not in `schema.prisma`'s `datasource` block, which is where they lived in Prisma 5/6.
- Environment variables are not auto-loaded by the CLI; `prisma.config.ts` explicitly imports `dotenv/config` (already the case in this repo since Phase 0).

**Two connection strings, two purposes, both pointed at the same Supabase project:**
- `DATABASE_URL` — the **pooled** connection (Supabase's Supavisor pooler, transaction mode, port 6543). Used by the `pg` adapter at application runtime. Safe under transaction-mode pooling specifically *because* our RLS pattern always keeps the `set_config` calls and the real query inside one `$transaction` — exactly the one-transaction-per-connection-checkout model transaction-mode pooling is built for.
- `DIRECT_URL` — the **direct**, non-pooled connection (port 5432). Used only by `prisma migrate dev`/`deploy`, since the migration engine's advisory locks and (for `migrate dev`) shadow-database creation don't reliably work through a transaction pooler.

### 5.7 Financial data integrity
Payments and expenses are **append-only**. There is no `UPDATE`/`DELETE` path exposed anywhere in the service layer for a saved payment or expense row — corrections are new "adjustment" rows referencing the original, per spec Business Rule 11. Voiding/adjusting is Gym Admin-only, enforced by the same role-guard mechanism as every other restricted action (§4), and is covered by the financial-integrity test suite (Phase 5).

---

## 6. AI Architecture

The spec's central AI requirement, restated as an architecture rule: **the LLM never computes a business number — it only narrates numbers the deterministic service layer already computed.**

### 6.1 Separation of concerns
- **Metrics Service** (`lib/server/services/metrics.ts`): pure, unit-tested TypeScript functions implementing every canonical definition from spec §13.0 — active members, revenue, outstanding payments, expirations, new members, attendance (total + unique visitors). This is the exact same code the dashboard and analytics screens call — not a parallel reimplementation for the AI.
- **AI Tool Layer** (`lib/ai/tools.ts`): a small, fixed set of read-only tools the model can call — e.g. `getDashboardSummary(period)`, `getExpiringMemberships(withinDays)`, `compareRevenuePeriods(a, b)`, `getPlanPerformance(period)`, `getAttendanceTrend(period)`. Each tool is a thin wrapper around one Metrics Service function. There is no "run SQL" tool and no write-capable tool of any kind — this is a structural fact about the codebase, not a prompt instruction the model could be talked out of.

### 6.2 Tenant isolation for AI
`gymId` is resolved from the verified server-side session exactly once, before the model is ever invoked, and is injected into every tool call by the server — it is never a parameter the model supplies, sees a schema for, or can influence via its input text. A prompt like "show me gym #47's data" has no path to succeed: the tool implementation only ever queries the one `gymId` the server already knows, regardless of what the prompt says. This is the same isolation guarantee as every other feature (§5), applied to the one new attack surface the AI introduces (prompt injection) — and it holds because the capability to query another tenant simply isn't present in the tool's code, not because the model was asked nicely not to.

### 6.3 Provider abstraction
**Vercel AI SDK** (`ai` package) as the single interface over model providers, with built-in tool-calling that maps directly onto §6.1's tool layer. Default provider: **Anthropic Claude** (per confirmed direction). Swapping to another supported provider later is a configuration change in `lib/ai/provider.ts`, not a rewrite of the tool layer, the metrics layer, or the prompt logic — satisfying the spec's requirement to not lock the application unnecessarily to one AI vendor.

### 6.4 Grounding and anti-hallucination
`lib/ai/systemPrompt.ts` instructs the model to:
- State only facts returned by tool calls in the current conversation turn.
- Say "I don't have enough data to answer that" when a tool indicates insufficient history, rather than speculate.
- When asked "why" something changed, cite only causes that are themselves tool-returned figures (fewer renewals, more expirations, plan-mix shift, attendance drop) — never external causes (economy, competitors, weather) it has no data on.

This is backed by the fact that the model has *no other source of information* — no web access, no general knowledge injected about the gym, no ability to query anything outside the fixed tool set — so grounding is a structural property, not solely a prompting discipline. The AI-grounding test suite (Phase 9) asserts every numeric claim in test transcripts traces to an actual tool-call result.

### 6.5 Access scope
Available to **Gym Admin only** in MVP, per the spec's stated default (§15.5) — not available to Gym Staff, consistent with Staff's exclusion from sensitive financial analytics. This is implemented as a single role check on the `/api/ai` Route Handler and the `assistant/` UI route, trivially reversible if you confirm otherwise before Phase 9 (see open item in `docs/decisions.md`).

### 6.6 Why no RAG / vector database
This is a structured-data Q&A problem — "how many memberships expire this week," "compare this month to last" — answerable entirely by parameterized queries over relational data. It is not a document-retrieval problem (there are no documents to search over in this product). Introducing a vector database would be infrastructure the actual requirement doesn't call for; see `docs/decisions.md` #7.

### 6.7 Cost control
A simple per-gym daily usage counter (one Postgres row, incremented per AI call, reset daily) caps runaway spend from a single tenant. No Redis, no queue — a counter row and a check are sufficient at this scale.

---

## 7. Security Boundaries (Summary)

- Every tenant table: `gym_id NOT NULL`, RLS enabled, indexed on `gym_id`.
- Every service function requires a verified `{ userId, gymId, role }` context; none accepts a client-supplied `gymId`.
- Role checks are enforced server-side on every restricted action — a Gym Staff request to an Admin-only Server Action fails with a hard authorization error, not a UI-only hide (spec §18 edge case), and this is asserted by tests, not assumed.
- AI tools are read-only and tenant-scoped by construction (§6.2), not by convention.
- Financial mutation (void/adjust/cancel/archive) is Gym Admin-only and append-only (§5.7).
- Platform Admin has no default UI path into any gym's operational data. A future audited "break-glass" support-access path is explicitly **not** built in MVP — it's out of scope unless separately requested, per spec §16.3.

---

## 8. External Services

| Service | Purpose | When needed |
|---|---|---|
| **Vercel** | Hosts the Next.js app (UI, Server Actions, Route Handlers) | Phase 0 |
| **Supabase** | Postgres (with RLS) + Auth. Storage available but unused in MVP. | Phase 0 |
| **Anthropic API** | Default AI provider | Phase 9 |
| **Email/SMTP provider** (e.g. Resend) | Production-grade delivery for password-reset/auth emails — Supabase's built-in sender is fine for dev but rate-limited for production | Phase 10 |
| **GitHub** | Repository + Actions CI | Phase 0 |

None of these are provisioned by this document — this is a planning artifact. Accounts/keys are created when the relevant implementation phase begins, per the user's explicit "no accounts/keys yet" instruction for this planning pass.

---

## 9. Deployment Architecture & Development vs. Production Environments

- **Local/dev application**: a **hosted Supabase project dedicated to development** (e.g. `ai-gym-saas-dev`), not a local Docker/Supabase-CLI stack. This gives real Supabase Auth and real RLS during development without requiring Docker to be installed, and matches the actual production topology (a hosted Supabase project) more closely than a local emulation would. A local Docker/Supabase-CLI stack is not part of this architecture unless a concrete future need makes one necessary (e.g., needing to develop fully offline) — it is not the default, and should not be introduced speculatively.
- **Automated tests (integration + isolation)**: run against an **ephemeral Postgres instance** — a `postgres:16` service container in CI, and Prisma's own local dev Postgres (`npx prisma dev`, no Docker required) for a developer running the same suite locally — with the project's migrations (including RLS policies) applied fresh before each run. This is deliberately **not** the hosted dev project: automated tests should be fast, fully reproducible, and free to seed/mutate/drop data without any risk to whatever a human is doing in the shared dev project at the same time. The hosted dev project is for interactive human use (manual testing, exploring the schema, Supabase Studio); it is never a target of automated test runs.
- **Preview/staging**: Vercel Preview deployments per branch/PR, pointed at a separate Supabase project (never the production project, never shares data with it, and never the dev project either once one is warranted).
- **Production**: a distinct Supabase project and a distinct Vercel production deployment, with entirely separate environment variables/secrets from every other environment, including dev. Production credentials are never used in, or copied into, the development environment.
- **Migrations** are applied via an explicit, reviewed `prisma migrate deploy` step per environment — never auto-run on application boot, so a bad migration can't silently roll out with a deploy. Migrations run under a separate, more privileged database role than the application's own runtime role (§5.3a) in every environment, including CI.

---

## 10. Failure / Recovery Considerations

- **Data durability**: Supabase's automated Postgres backups (point-in-time recovery on a paid tier) satisfy the spec's data-durability requirement (§12). A restore is actually rehearsed once as part of Phase 10's definition of done — not assumed to work because a vendor says it does.
- **Financial corrections**: because payments/expenses are append-only (§5.7), most "I made a mistake" scenarios are fixed by an adjustment entry, not by restoring from backup.
- **AI provider outage or rate-limiting**: the rest of the product must keep working — nothing outside the AI assistant screen depends on the AI provider being reachable, which is exactly what the spec requires ("the product must work without AI").
- **Auth provider outage**: using a managed auth provider means Supabase Auth is a single point of failure for login — an accepted, explicit tradeoff for MVP velocity given a solo developer's constraints (recorded in `docs/decisions.md`, not silently assumed).
- **Concurrent writes** (e.g., two staff members recording a payment for the same member near-simultaneously): Postgres transactions plus the append-only payment model mean the worst case is two valid payment rows, not corrupted data — reconciliation is a visible list, not a silent overwrite.

---

## 11. What This Architecture Deliberately Does Not Include

Matching `docs/product-spec.md` §24 (Deferred Features) — none of the following are part of this architecture, and none should be reintroduced during implementation without a corresponding product-spec change:

- Microservices, an internal API gateway, or service-to-service auth.
- A message queue, event bus, or background job scheduler.
- A dedicated vector database or RAG pipeline.
- Payment gateway integration, SMS/WhatsApp integration, biometric hardware integration.
- Multi-location/franchise data model (every gym is a single, independent tenant).
- Any AI capability beyond read-only tool-calling over the Metrics Service (no autonomous actions, no arbitrary SQL execution, no write tools).
- Self-serve billing infrastructure for the SaaS subscription itself (Platform Admin manages gym accounts manually, per spec §5.1).

---

*End of document.*
