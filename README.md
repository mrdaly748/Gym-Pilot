# GymPilot

A multi-tenant SaaS platform for gym owners to run day-to-day operations —
members, memberships, payments, attendance, trainers, and expenses — with
an analytics dashboard and an AI assistant that answers plain-language
questions grounded in the gym's own data.

**Live deployment:** [gym-pilot-alpha.vercel.app](https://gym-pilot-alpha.vercel.app/)
The landing page and login are public; the app itself requires an account,
since GymPilot is a B2B admin tool with no self-serve sign-up — gyms are
provisioned by a platform administrator.

## What it does

A small gym is typically run out of spreadsheets and paper. GymPilot gives
an owner one place to:

- Track members and their membership history, including a "returning
  member" reconciliation for someone who lapses and comes back.
- Sell, renew, freeze/resume, and cancel memberships against configurable
  plans, with pricing/duration snapshotted at the time of sale so a later
  plan edit never rewrites history.
- Record payments and expenses as an append-only, auditable ledger —
  corrections happen via a visible adjustment, never a silent edit or
  delete.
- Run fast front-desk attendance check-in, independent of membership
  status, with same-day duplicate check-ins prevented.
- Manage a trainer directory and trainer↔member assignments.
- See a role-appropriate dashboard and analytics: revenue/expense/
  attendance/membership trends, period comparisons, and plan performance.
- Ask an AI assistant questions like "how does this month's revenue
  compare to last month?" and get an answer grounded in that gym's real
  data — never invented.

## Multi-tenant architecture & security

Every gym's data is isolated by two independent layers, not one:

- **Application layer**: every service function scopes its query by the
  authenticated session's `gymId` — never a client-supplied one.
- **Database layer**: PostgreSQL Row-Level Security (`ENABLE` + `FORCE`) on
  every tenant-owned table, evaluated by Postgres itself regardless of
  what the application code does. The runtime database role
  (`app_user`) is a dedicated, least-privilege role — not the schema
  owner, and not a Postgres superuser.

Role-based access control has three fixed roles (Platform Admin, Gym
Admin, Gym Staff), enforced at the Server Action layer, at the RLS policy
layer, and in several cases at the database *grant* layer — e.g. no
`UPDATE`/`DELETE` grant exists at all on the payments/expenses tables,
making the append-only ledger structurally impossible to mutate, not just
disallowed by application code.

Two DB-level constraints (unique member phone per gym, no overlapping
membership date ranges per member) back up their equivalent application
checks so a race between two concurrent requests can't slip past the
app-layer validation alone.

## AI Assistant

Built on the Vercel AI SDK with Anthropic Claude (Haiku), the assistant
has access to a fixed set of read-only tools — no tool can write, and no
tool's schema accepts a `gymId` or any gym-identifying parameter, so the
tenant boundary is structural, not just instructed. Usage is rate-limited
per gym per day. A separate, opt-in evaluation suite
(`tests/ai-evals/`, `npm run test:ai-eval`) sends realistic gym-owner
questions through the real model and asserts it selects the correct tool
and arguments — distinct from the tool-correctness tests below, which
prove each tool's own output is right.

## Testing

- **353 integration/isolation tests** against a real PostgreSQL instance
  (`npm run test:db`) — service-layer correctness, cross-tenant isolation
  proven independently via raw SQL through the RLS-enforced role, and
  concurrency tests that fire simultaneous requests and assert the race
  resolves to exactly one row.
- **91 unit tests** (`npm test`) — pure business-rule logic (membership
  status derivation, revenue/attendance calculations, validation), no
  database.
- An opt-in **AI tool-selection evaluation suite** (`npm run test:ai-eval`)
  — skipped by default, requires a real `ANTHROPIC_API_KEY`, never runs in
  CI or the default test commands.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, the unit suite,
  and a build on every push, plus a second job that runs the full
  integration/isolation suite against a real `postgres:16` service
  container.

## Tech stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript ·
Tailwind CSS 4 · Prisma 7 with a raw `pg` driver adapter · PostgreSQL via
Supabase (Auth + database) · Vercel AI SDK + Anthropic Claude · Vitest
(unit/integration/isolation) · Playwright (E2E) · deployed on Vercel.

## Architecture, in brief

Every route reaches the database through exactly one path: **Server
Action → service function → Prisma**. An ESLint boundary rule enforces
that only `lib/server/services/**` may import the Prisma client at all, so
tenant scoping and business-rule logic can never be reimplemented — or
re-broken — per screen. Canonical calculations (membership status,
revenue, outstanding balance, attendance metrics) live in one pure,
dependency-free module (`lib/server/services/metrics.ts`) that every
consumer — dashboard, analytics, AI tools — calls, so there is exactly one
definition of each figure in the product.

Membership status (active / expiring soon / expired / frozen / cancelled)
is derived at query time from stored dates, never a mutable column kept
in sync by a background job.

For the full design rationale — including why RLS instead of app-layer
isolation alone, why status is computed rather than stored, and the
history of decisions made along the way — see [`docs/architecture.md`](docs/architecture.md)
and [`docs/decisions.md`](docs/decisions.md).

## Local development

```bash
npm install
cp .env.example .env   # fill in real values — see the comments in that file
```

The app expects a Postgres database with the project's schema and RLS
policies applied, plus a dedicated `app_user` database role — the
Supabase CLI's local stack is the intended setup (Postgres + Auth + RLS
together). The exact bootstrap order (base schema → `app_user` role →
RLS policies → remaining migrations) is documented in
[`docs/architecture.md` §9](docs/architecture.md).

```bash
npm run dev          # http://localhost:3000
```

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Next.js route types + `tsc --noEmit` |
| `npm test` | Unit tests (no database) |
| `npm run test:db` | Integration + isolation tests (real Postgres) |
| `npm run test:ai-eval` | Opt-in live AI tool-selection eval (needs `ANTHROPIC_API_KEY`) |
| `npm run test:e2e` | Playwright end-to-end tests |
