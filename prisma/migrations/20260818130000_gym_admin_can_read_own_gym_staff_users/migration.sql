-- Phase 2 correction to a Phase 1 simplification.
--
-- prisma/migrations/20260818090322_rls_core/migration.sql's "users" policies
-- comment said Gym-scoped visibility into teammates' user records was "not
-- implemented in Phase 1" — a deliberate simplification at the time, not a
-- security decision. Phase 2's staff list (lib/server/services/gymStaff.ts's
-- listGymStaff()) genuinely needs a Gym Admin to read the email of users who
-- belong to their own gym, which the original users_select policy (own row,
-- or any row if Platform Admin) structurally does not allow — discovered via
-- a real RLS-policy-violation error during Phase 2 testing, not assumed.
--
-- This does not violate the acyclic-policy rule described in
-- docs/architecture.md §5.3b: gym_memberships' own policies still never
-- reference "users" (they only read app.* settings), so the dependency is
-- one-directional (users -> gym_memberships), not a cycle.

ALTER POLICY "users_select" ON "users"
  USING (
    "id" = app_current_user_id()
    OR app_is_platform_admin()
    OR (
      app_current_role() = 'GYM_ADMIN'
      AND EXISTS (
        SELECT 1 FROM "gym_memberships" gm
        WHERE gm."user_id" = "users"."id"
          AND gm."gym_id" = app_current_gym_id()
      )
    )
  );
