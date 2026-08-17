# Integration tests

Service-layer tests run against a real local Postgres instance (with RLS
enabled), using Vitest. First populated in Phase 1 alongside the tenant
schema and auth. See `docs/architecture.md` §5 and `docs/implementation-plan.md`.
