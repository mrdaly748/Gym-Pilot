# Tenant isolation tests

The required, named gate described in `docs/architecture.md` §5.4: seeds
multiple gyms with overlapping data and asserts zero cross-tenant access
across every entity and access path (service functions, Server
Actions/Route Handlers, and — from Phase 9 — AI tool calls).

First populated in Phase 1. Must pass before Phase 1 is considered done,
and is re-run before every later phase that adds a new entity, and again
against staging before production launch (Phase 10). See
`docs/implementation-plan.md`.
