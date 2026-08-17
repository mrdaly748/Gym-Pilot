# AI Gym Management SaaS

B2B SaaS for gym owners: members, memberships, payments, attendance,
trainers, expenses, dashboard/analytics, and a read-only AI assistant
grounded in the gym's own data. See `docs/product-spec.md` for the full
product spec.

## Documentation (source of truth)

Read in this order before touching anything:

1. `docs/product-spec.md` — product scope and business rules.
2. `docs/architecture.md` — technical design.
3. `docs/implementation-plan.md` — phased build order (this repo is on **Phase 0**).
4. `docs/decisions.md` — decision log, including open items pending your input.

## Project layout

```
app/                    Next.js App Router routes (UI + Server Actions)
lib/
  server/
    db.ts                Prisma client + tenant-context transaction helper (Phase 1)
    auth.ts               Session/role resolution (Phase 1)
    services/              ALL business logic. The ONLY place allowed to import Prisma.
  ai/                     Provider-agnostic AI client + read-only tools (Phase 9)
components/              UI components, organized by feature
prisma/
  schema.prisma
  migrations/
tests/
  unit/                   Business-rule/service-layer logic, no DB
  integration/            Service layer against a real local Postgres
  isolation/              Required cross-tenant-leakage gate (see docs/architecture.md §5.4)
  e2e/                    Playwright, critical user flows
```

**Hard rule, enforced by ESLint (`eslint.config.mjs`):** nothing outside
`lib/server/services/**` (and `lib/server/db.ts` itself) may import
`@prisma/client` or the generated Prisma client under
`lib/server/generated/**`. Every route, Server Action, and AI tool reaches
the database only through a service function. This keeps tenant scoping
(`gym_id` filtering) and the canonical metric definitions in one place
instead of re-implemented — and potentially re-broken — per screen. See
`docs/architecture.md` §2 and §5.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck
npm run test          # unit + integration (Vitest)
npm run test:e2e       # Playwright
```

### Database

Prisma needs a `DATABASE_URL` in `.env` (copy `.env.example`). The intended
local setup is the Supabase CLI's local stack (Postgres + Auth + RLS) — see
`docs/architecture.md` §9. If that isn't set up yet on your machine, Prisma's
own local dev database is a working fallback for schema/migration work only
(it does not provide Supabase Auth or emulate RLS the same way):

```bash
npx prisma dev -d     # starts a local Postgres, prints a connection string
# put that connection string in .env as DATABASE_URL, then:
npx prisma migrate dev
```

See `docs/decisions.md` for why this fallback exists and what it doesn't cover.

## Status

Phase 0 (project foundation) — scaffolding only, no business logic yet.
