# Service layer

The only directory (along with `lib/server/db.ts`) allowed to import the
Prisma client — enforced by the ESLint boundary rule in `eslint.config.mjs`.
All business logic, tenant scoping (`gym_id` filtering), and the canonical
metrics definitions live here. See `docs/architecture.md` §2 and §5.

First populated in Phase 1 (`db.ts`'s tenant-context helper, `auth.ts`) and
grown through Phases 2–9 as each entity is built.
