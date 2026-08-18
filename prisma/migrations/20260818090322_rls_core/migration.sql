-- Hand-authored migration: hand-written on purpose (docs/architecture.md §5.3,
-- §5.3a, §5.3b) — RLS policies, FORCE ROW LEVEL SECURITY, the role/gym_id
-- CHECK constraint, and the platform-admin partial unique index are not
-- expressible in Prisma's schema DSL.
--
-- Session context: three transaction-local settings, set via
-- `SELECT set_config('app.current_*', $1, true)` by lib/server/db.ts's
-- withUser()/withTenant()/withPlatform() helpers — never `SET LOCAL ... = ${value}`
-- (that form is not valid parameterized SQL; see docs/decisions.md D15).
-- There is no app.current_platform setting — a Platform Admin session is
-- app.current_role = 'PLATFORM_ADMIN' with no gym_id set.

-- ============================================================================
-- Hand-authored integrity constraints (not expressible in Prisma's schema DSL)
-- ============================================================================

-- A PLATFORM_ADMIN row has no gym_id; every other role must have one.
ALTER TABLE "gym_memberships"
  ADD CONSTRAINT "gym_memberships_role_gym_id_pairing_check"
  CHECK (
    ("role" = 'PLATFORM_ADMIN' AND "gym_id" IS NULL)
    OR ("role" <> 'PLATFORM_ADMIN' AND "gym_id" IS NOT NULL)
  );

-- At most one PLATFORM_ADMIN row per user. A plain composite UNIQUE
-- constraint would not catch this, since SQL treats every NULL gym_id as
-- distinct from every other NULL.
CREATE UNIQUE INDEX "gym_memberships_one_platform_admin_per_user"
  ON "gym_memberships" ("user_id")
  WHERE "gym_id" IS NULL;

-- ============================================================================
-- Session-context helper functions
-- Each is STABLE and touches no table — this is what keeps the policy
-- dependency graph acyclic (docs/architecture.md §5.3b). They are owned by
-- the migration role; app_user only ever receives EXECUTE.
-- ============================================================================

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app_current_gym_id() RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT NULLIF(current_setting('app.current_gym_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app_current_role() RETURNS text
LANGUAGE sql STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT NULLIF(current_setting('app.current_role', true), '');
$$;

CREATE OR REPLACE FUNCTION app_is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT app_current_role() = 'PLATFORM_ADMIN';
$$;

GRANT EXECUTE ON FUNCTION app_current_user_id() TO app_user;
GRANT EXECUTE ON FUNCTION app_current_gym_id() TO app_user;
GRANT EXECUTE ON FUNCTION app_current_role() TO app_user;
GRANT EXECUTE ON FUNCTION app_is_platform_admin() TO app_user;

-- ============================================================================
-- Row-Level Security: ENABLE + FORCE on every table in this migration
-- (docs/architecture.md §5.3a — FORCE also binds the table owner, not just
-- other roles; app_user is never the owner, but FORCE is defense-in-depth
-- against a future mistake, e.g. someone running app queries as the owner).
-- ============================================================================

ALTER TABLE "gyms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gyms" FORCE ROW LEVEL SECURITY;

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

ALTER TABLE "gym_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gym_memberships" FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- Policies: gyms
-- gyms has no gym_id column (it IS the tenant), so it's gated on its own id
-- matching app.current_gym_id, or a platform-admin session.
-- No DELETE policy on any table in this migration. In practice app_user's
-- lack of a DELETE GRANT (bootstrap-app-role.sql) is what blocks it first —
-- Postgres denies at the privilege level before RLS is even evaluated. The
-- missing policy is still deliberate defense-in-depth: if DELETE were ever
-- mistakenly granted later, RLS would still deny it for every row, since an
-- enabled/forced RLS table with no policy for a command denies that command
-- entirely. Verified empirically in tests/isolation/cross-tenant-write.test.ts.
-- ============================================================================

CREATE POLICY "gyms_select" ON "gyms"
  FOR SELECT
  USING ("id" = app_current_gym_id() OR app_is_platform_admin());

CREATE POLICY "gyms_insert" ON "gyms"
  FOR INSERT
  WITH CHECK (app_is_platform_admin());

CREATE POLICY "gyms_update" ON "gyms"
  FOR UPDATE
  USING (app_is_platform_admin())
  WITH CHECK (app_is_platform_admin());

-- ============================================================================
-- Policies: users
-- Deliberately does NOT reference gym_memberships (see the acyclic-policy
-- rule, docs/architecture.md §5.3b) — a session can see its own row, or
-- every row if platform admin. Gym-scoped visibility into teammates' user
-- records is not implemented in Phase 1; see the Phase 1 report for the
-- concrete tradeoff this simplification makes.
-- ============================================================================

CREATE POLICY "users_select" ON "users"
  FOR SELECT
  USING ("id" = app_current_user_id() OR app_is_platform_admin());

CREATE POLICY "users_insert" ON "users"
  FOR INSERT
  WITH CHECK (app_is_platform_admin() OR app_current_role() = 'GYM_ADMIN');

CREATE POLICY "users_update" ON "users"
  FOR UPDATE
  USING ("id" = app_current_user_id() OR app_is_platform_admin())
  WITH CHECK ("id" = app_current_user_id() OR app_is_platform_admin());

-- ============================================================================
-- Policies: gym_memberships
-- This is the bootstrap table (docs/architecture.md §5.3b): the SELECT
-- policy's first branch (user_id = app_current_user_id()) is what makes it
-- possible to look up "which gym does this user belong to" before gym_id is
-- known, without an unprotected special-case query.
-- ============================================================================

CREATE POLICY "gym_memberships_select" ON "gym_memberships"
  FOR SELECT
  USING (
    "user_id" = app_current_user_id()
    OR "gym_id" = app_current_gym_id()
    OR app_is_platform_admin()
  );

-- A Gym Admin may only create GYM_STAFF rows in their own gym. This is the
-- policy the "Gym-Staff-context INSERT is rejected" and "cross-gym INSERT is
-- rejected" isolation tests exercise directly.
CREATE POLICY "gym_memberships_insert" ON "gym_memberships"
  FOR INSERT
  WITH CHECK (
    app_is_platform_admin()
    OR (
      app_current_role() = 'GYM_ADMIN'
      AND "gym_id" = app_current_gym_id()
      AND "role" = 'GYM_STAFF'
    )
  );

-- USING and WITH CHECK both pin gym_id to the caller's own gym — this is
-- what specifically blocks re-parenting a row into another tenant via
-- UPDATE ... SET gym_id = <other gym>, not just editing within one's own gym.
CREATE POLICY "gym_memberships_update" ON "gym_memberships"
  FOR UPDATE
  USING (
    app_is_platform_admin()
    OR (app_current_role() = 'GYM_ADMIN' AND "gym_id" = app_current_gym_id())
  )
  WITH CHECK (
    app_is_platform_admin()
    OR (app_current_role() = 'GYM_ADMIN' AND "gym_id" = app_current_gym_id())
  );
