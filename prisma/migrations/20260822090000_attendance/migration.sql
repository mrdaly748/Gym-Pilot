-- Phase 6: Attendance — business data, gym-scoped, targets Member directly
-- (not Membership), so attendance is structurally independent of membership
-- status (product-spec.md §18, §13 Rule 10).
--
-- Hand-authored (like every RLS-bearing migration since Phase 1): the
-- CREATE TABLE below matches schema.prisma exactly; grants/RLS live in the
-- same file as the table, per the Phase 3+ convention (bootstrap-app-role.sql
-- runs once, before this table exists, and can never grant on it directly).
--
-- NOT append-only, unlike payments/payment_adjustments: product-spec.md
-- Rule 11's insert-only regime is scoped to payments/expenses only, not
-- attendance. A Gym-Admin-only correction path is provided instead:
--   - GYM_ADMIN: SELECT, INSERT, UPDATE, DELETE
--   - GYM_STAFF: SELECT, INSERT only (cannot correct/delete)
--   - PLATFORM_ADMIN: no access (no bypass), same as every other business
--     table since Phase 3.
-- Enforced at both the grant level (app_user's table privileges) and the
-- RLS-policy level (USING/WITH CHECK per role) — two independent layers,
-- same defense-in-depth discipline as every prior phase.

-- ============================================================================
-- CreateTable: attendance_checkins
-- ============================================================================

CREATE TABLE "attendance_checkins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gym_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_user_id" UUID NOT NULL,

    CONSTRAINT "attendance_checkins_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attendance_checkins_gym_id_idx" ON "attendance_checkins"("gym_id");
CREATE INDEX "attendance_checkins_member_id_idx" ON "attendance_checkins"("member_id");
CREATE INDEX "attendance_checkins_gym_id_checked_in_at_idx" ON "attendance_checkins"("gym_id", "checked_in_at");

ALTER TABLE "attendance_checkins" ADD CONSTRAINT "attendance_checkins_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_checkins" ADD CONSTRAINT "attendance_checkins_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_checkins" ADD CONSTRAINT "attendance_checkins_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Full DML grant (unlike payments/payment_adjustments) — the RLS policies
-- below are what actually restrict UPDATE/DELETE to GYM_ADMIN; the grant
-- only establishes app_user is allowed to attempt the operation at all.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_checkins TO app_user;

-- ============================================================================
-- Row-Level Security: ENABLE + FORCE, same as every other tenant table
-- ============================================================================

ALTER TABLE "attendance_checkins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_checkins" FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- Policies: attendance_checkins
-- No app_is_platform_admin() branch anywhere below — Platform Admin has no
-- default access to gym operational/business data (docs/architecture.md
-- §7), same as members/membership_plans/memberships/payments.
-- ============================================================================

-- Both roles may read (attendance history + metrics, product-spec.md §11.5,
-- §11.8 — attendance is not in the Gym-Staff-restricted figure list).
CREATE POLICY "attendance_checkins_select" ON "attendance_checkins"
  FOR SELECT
  USING ("gym_id" = app_current_gym_id());

-- Both roles may check a member in (product-spec.md §11.5, §5.3).
CREATE POLICY "attendance_checkins_insert" ON "attendance_checkins"
  FOR INSERT
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() IN ('GYM_ADMIN', 'GYM_STAFF')
  );

-- GYM_ADMIN only may correct/delete a mis-recorded check-in.
CREATE POLICY "attendance_checkins_update" ON "attendance_checkins"
  FOR UPDATE
  USING (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  )
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );

CREATE POLICY "attendance_checkins_delete" ON "attendance_checkins"
  FOR DELETE
  USING (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );
