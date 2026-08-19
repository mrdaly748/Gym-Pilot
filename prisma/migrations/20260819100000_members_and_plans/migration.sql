-- Phase 3: Members & Membership Plans — business data, gym-scoped.
--
-- Hand-authored (like prisma/migrations/*_rls_core): RLS policies aren't
-- expressible in Prisma's schema DSL, so the CREATE TABLE statements below
-- (Prisma-DSL-derived, matching schema.prisma exactly) and the RLS section
-- live in one migration file together, same convention as Phase 1.
--
-- Deliberate deviation from the gyms/users/gym_memberships policy pattern:
-- NO app_is_platform_admin() branch anywhere below. Platform Admin has no
-- default access to gym operational/business data (docs/architecture.md
-- §7) — members and membership plans are exactly that, unlike gyms/users
-- which are identity/metadata Platform Admin legitimately manages.

-- ============================================================================
-- CreateTable: members
-- ============================================================================

CREATE TABLE "members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gym_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_normalized" TEXT NOT NULL,
    "join_date" DATE NOT NULL,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "members_gym_id_idx" ON "members"("gym_id");
CREATE INDEX "members_gym_id_phone_normalized_idx" ON "members"("gym_id", "phone_normalized");

ALTER TABLE "members" ADD CONSTRAINT "members_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- app_user's DML grant lives here, with the table's own migration, rather
-- than in prisma/sql/bootstrap-app-role.sql: that script runs once, before
-- this table exists (it must run before rls_core, which this migration
-- depends on for its policy functions — see that script's own comment).
GRANT SELECT, INSERT, UPDATE ON public.members TO app_user;

-- ============================================================================
-- CreateTable: membership_plans
-- ============================================================================

CREATE TABLE "membership_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gym_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_millimes" INTEGER NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "membership_plans_gym_id_idx" ON "membership_plans"("gym_id");

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE ON public.membership_plans TO app_user;

-- ============================================================================
-- Row-Level Security: ENABLE + FORCE, same as every other tenant table
-- ============================================================================

ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "members" FORCE ROW LEVEL SECURITY;

ALTER TABLE "membership_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership_plans" FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- Policies: members
-- Both GYM_ADMIN and GYM_STAFF may read/insert/update (create, edit,
-- archive, reactivate) — product-spec.md §11.1. No DELETE policy: no
-- DELETE grant exists either (bootstrap-app-role.sql), matching the
-- project-wide append-only/soft-delete convention.
-- ============================================================================

CREATE POLICY "members_select" ON "members"
  FOR SELECT
  USING ("gym_id" = app_current_gym_id());

CREATE POLICY "members_insert" ON "members"
  FOR INSERT
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() IN ('GYM_ADMIN', 'GYM_STAFF')
  );

CREATE POLICY "members_update" ON "members"
  FOR UPDATE
  USING (
    "gym_id" = app_current_gym_id()
    AND app_current_role() IN ('GYM_ADMIN', 'GYM_STAFF')
  )
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() IN ('GYM_ADMIN', 'GYM_STAFF')
  );

-- ============================================================================
-- Policies: membership_plans
-- Both roles may SELECT (Gym Staff will need to see plans to eventually
-- sell/assign them, Phase 4) — only GYM_ADMIN may INSERT/UPDATE (create,
-- edit, archive) — product-spec.md §11.2.
-- ============================================================================

CREATE POLICY "membership_plans_select" ON "membership_plans"
  FOR SELECT
  USING ("gym_id" = app_current_gym_id());

CREATE POLICY "membership_plans_insert" ON "membership_plans"
  FOR INSERT
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );

CREATE POLICY "membership_plans_update" ON "membership_plans"
  FOR UPDATE
  USING (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  )
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );
