-- Phase 4: Memberships & Canonical Status Engine — business data, gym-scoped.
--
-- Hand-authored (like the Phase 1/3 migrations): RLS policies aren't
-- expressible in Prisma's schema DSL. app_user's table grants live here too
-- (Phase 3's lesson, docs/decisions.md): bootstrap-app-role.sql runs once,
-- before this table exists, and can never grant on it directly.
--
-- No stored status column anywhere below (docs/architecture.md §5.5) —
-- active/expiring soon/expired/frozen/cancelled is derived at query time by
-- lib/server/services/metrics.ts, never a column here.

-- ============================================================================
-- CreateTable: memberships
-- ============================================================================

CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gym_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "plan_name_snapshot" TEXT NOT NULL,
    "price_millimes_snapshot" INTEGER NOT NULL,
    "duration_days_snapshot" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "memberships_gym_id_idx" ON "memberships"("gym_id");
CREATE INDEX "memberships_member_id_idx" ON "memberships"("member_id");

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE ON public.memberships TO app_user;

-- ============================================================================
-- CreateTable: membership_freezes
-- ============================================================================

CREATE TABLE "membership_freezes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gym_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "frozen_at" TIMESTAMP(3) NOT NULL,
    "resumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_freezes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "membership_freezes_gym_id_idx" ON "membership_freezes"("gym_id");
CREATE INDEX "membership_freezes_membership_id_idx" ON "membership_freezes"("membership_id");

ALTER TABLE "membership_freezes" ADD CONSTRAINT "membership_freezes_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_freezes" ADD CONSTRAINT "membership_freezes_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE ON public.membership_freezes TO app_user;

-- ============================================================================
-- Row-Level Security: ENABLE + FORCE, same as every other tenant table
-- ============================================================================

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;

ALTER TABLE "membership_freezes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership_freezes" FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- Policies: memberships
-- Both GYM_ADMIN and GYM_STAFF may read/insert (assign, renew) and update
-- (freeze/resume shifts end_date) — product-spec.md §11.3, architecture.md's
-- role table. Cancellation is Gym Admin-only: rather than a second UPDATE
-- policy (Postgres RLS can't easily express "this role may change column A
-- but not column B" any other way without triggers, which would be a new
-- pattern this project doesn't otherwise use), the WITH CHECK below directly
-- blocks a GYM_STAFF-context update from ever resulting in a non-null
-- cancelled_at — enforced at the database layer, not just app-layer
-- requireRole(), and it also means Staff cannot touch an already-cancelled
-- membership at all (its cancelled_at is already non-null).
-- ============================================================================

CREATE POLICY "memberships_select" ON "memberships"
  FOR SELECT
  USING ("gym_id" = app_current_gym_id());

CREATE POLICY "memberships_insert" ON "memberships"
  FOR INSERT
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() IN ('GYM_ADMIN', 'GYM_STAFF')
  );

CREATE POLICY "memberships_update" ON "memberships"
  FOR UPDATE
  USING (
    "gym_id" = app_current_gym_id()
    AND app_current_role() IN ('GYM_ADMIN', 'GYM_STAFF')
  )
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() IN ('GYM_ADMIN', 'GYM_STAFF')
    AND (app_current_role() = 'GYM_ADMIN' OR "cancelled_at" IS NULL)
  );

-- ============================================================================
-- Policies: membership_freezes
-- Both roles may freeze/resume — no cancellation-style restriction needed
-- here, freezing/resuming is explicitly a shared-role action.
-- ============================================================================

CREATE POLICY "membership_freezes_select" ON "membership_freezes"
  FOR SELECT
  USING ("gym_id" = app_current_gym_id());

CREATE POLICY "membership_freezes_insert" ON "membership_freezes"
  FOR INSERT
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() IN ('GYM_ADMIN', 'GYM_STAFF')
  );

CREATE POLICY "membership_freezes_update" ON "membership_freezes"
  FOR UPDATE
  USING (
    "gym_id" = app_current_gym_id()
    AND app_current_role() IN ('GYM_ADMIN', 'GYM_STAFF')
  )
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() IN ('GYM_ADMIN', 'GYM_STAFF')
  );
