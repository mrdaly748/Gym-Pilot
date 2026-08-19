-- Phase 7: Trainers & Expenses — business data, gym-scoped, Gym-Admin-only
-- across the board (product-spec.md §11.6, §11.7; implementation-plan.md
-- Phase 7: "Both entirely Gym Admin-only — no Gym Staff visibility or
-- access at the API/service level, not just the UI").
--
-- Hand-authored (like every RLS-bearing migration since Phase 1): the
-- CREATE TABLE statements below match schema.prisma exactly; grants/RLS
-- live in the same file as the tables, per the Phase 3+ convention.
--
-- Expense/ExpenseAdjustment follow the exact append-only design already
-- established by Payment/PaymentAdjustment (product-spec.md §13 Rule 11
-- explicitly groups "payments and expenses" under the same insert-only,
-- adjustment-based correction regime): app_user gets SELECT + INSERT only
-- on both — no UPDATE, no DELETE grant, and no UPDATE/DELETE RLS policy
-- either.
--
-- Unlike every prior table, NONE of the four tables below grant Gym Staff
-- any access at all — no SELECT policy for GYM_STAFF anywhere in this file.
-- This is the first fully Gym-Admin-only set of tables in the project.
--
-- Trainer/TrainerMemberLink are NOT append-only: Trainer follows the
-- Member/MembershipPlan archive-not-delete pattern (SELECT+INSERT+UPDATE
-- grant, no DELETE); TrainerMemberLink is a pure current-state association
-- with no historical/audit value of its own once removed, so it gets a
-- DELETE grant (Gym-Admin-only, same reasoning as AttendanceCheckin's
-- Gym-Admin-only DELETE grant in Phase 6).

-- ============================================================================
-- CreateTable: trainers
-- ============================================================================

CREATE TABLE "trainers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gym_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "specialty" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trainers_gym_id_idx" ON "trainers"("gym_id");

ALTER TABLE "trainers" ADD CONSTRAINT "trainers_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SELECT + INSERT + UPDATE (archival is an UPDATE) — no DELETE, matching
-- the archive-not-hard-delete convention used by members/membership_plans.
GRANT SELECT, INSERT, UPDATE ON public.trainers TO app_user;

-- ============================================================================
-- CreateTable: trainer_member_links
-- ============================================================================

CREATE TABLE "trainer_member_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gym_id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_member_links_pkey" PRIMARY KEY ("id")
);

-- Prevents a duplicate trainer<->member link at the database layer, not
-- merely an application-level check.
CREATE UNIQUE INDEX "trainer_member_links_trainer_id_member_id_key" ON "trainer_member_links"("trainer_id", "member_id");
CREATE INDEX "trainer_member_links_gym_id_idx" ON "trainer_member_links"("gym_id");
CREATE INDEX "trainer_member_links_trainer_id_idx" ON "trainer_member_links"("trainer_id");
CREATE INDEX "trainer_member_links_member_id_idx" ON "trainer_member_links"("member_id");

ALTER TABLE "trainer_member_links" ADD CONSTRAINT "trainer_member_links_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trainer_member_links" ADD CONSTRAINT "trainer_member_links_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trainer_member_links" ADD CONSTRAINT "trainer_member_links_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SELECT + INSERT + DELETE: unassigning a trainer from a member removes the
-- link row outright — a link carries no historical/audit value of its own
-- once removed (contrast with Trainer itself, whose archival must be
-- reversible and preserve every existing link, per Rule 12).
GRANT SELECT, INSERT, DELETE ON public.trainer_member_links TO app_user;

-- ============================================================================
-- CreateTable: expenses
-- ============================================================================

CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gym_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "amount_millimes" INTEGER NOT NULL,
    "expense_date" DATE NOT NULL,
    "note" TEXT,
    "recorded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expenses_gym_id_idx" ON "expenses"("gym_id");
CREATE INDEX "expenses_gym_id_expense_date_idx" ON "expenses"("gym_id", "expense_date");

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SELECT + INSERT only — no UPDATE, no DELETE (append-only, same as
-- payments — product-spec.md §13 Rule 11).
GRANT SELECT, INSERT ON public.expenses TO app_user;

-- ============================================================================
-- CreateTable: expense_adjustments
-- ============================================================================

CREATE TABLE "expense_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gym_id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "amount_millimes" INTEGER NOT NULL,
    "reason" TEXT,
    "recorded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expense_adjustments_gym_id_idx" ON "expense_adjustments"("gym_id");
CREATE INDEX "expense_adjustments_expense_id_idx" ON "expense_adjustments"("expense_id");

ALTER TABLE "expense_adjustments" ADD CONSTRAINT "expense_adjustments_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_adjustments" ADD CONSTRAINT "expense_adjustments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_adjustments" ADD CONSTRAINT "expense_adjustments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SELECT + INSERT only — no UPDATE, no DELETE.
GRANT SELECT, INSERT ON public.expense_adjustments TO app_user;

-- ============================================================================
-- Row-Level Security: ENABLE + FORCE, same as every other tenant table
-- ============================================================================

ALTER TABLE "trainers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trainers" FORCE ROW LEVEL SECURITY;

ALTER TABLE "trainer_member_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trainer_member_links" FORCE ROW LEVEL SECURITY;

ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" FORCE ROW LEVEL SECURITY;

ALTER TABLE "expense_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expense_adjustments" FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- Policies: trainers — GYM_ADMIN only, every operation. No GYM_STAFF branch
-- at all (unlike members/membership_plans, where Staff at least gets
-- SELECT) — Gym Staff has zero access to trainer data, per
-- implementation-plan.md Phase 7's explicit scope. No
-- app_is_platform_admin() branch either — same no-bypass rule as every
-- business table since Phase 3.
-- ============================================================================

CREATE POLICY "trainers_select" ON "trainers"
  FOR SELECT
  USING (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );

CREATE POLICY "trainers_insert" ON "trainers"
  FOR INSERT
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );

CREATE POLICY "trainers_update" ON "trainers"
  FOR UPDATE
  USING (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  )
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );

-- ============================================================================
-- Policies: trainer_member_links — GYM_ADMIN only.
-- ============================================================================

CREATE POLICY "trainer_member_links_select" ON "trainer_member_links"
  FOR SELECT
  USING (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );

CREATE POLICY "trainer_member_links_insert" ON "trainer_member_links"
  FOR INSERT
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );

CREATE POLICY "trainer_member_links_delete" ON "trainer_member_links"
  FOR DELETE
  USING (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );

-- ============================================================================
-- Policies: expenses — GYM_ADMIN only, SELECT + INSERT. No UPDATE/DELETE
-- policy at all: combined with the insert-only grant above, mutation is
-- impossible for app_user regardless of role — the original Expense record
-- can never be changed once saved (product-spec.md §13 Rule 11), matching
-- Payment's design exactly.
-- ============================================================================

CREATE POLICY "expenses_select" ON "expenses"
  FOR SELECT
  USING (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );

CREATE POLICY "expenses_insert" ON "expenses"
  FOR INSERT
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );

-- ============================================================================
-- Policies: expense_adjustments — GYM_ADMIN only, SELECT + INSERT. Same
-- no-UPDATE/DELETE-policy-at-all design as expenses/payments/
-- payment_adjustments.
-- ============================================================================

CREATE POLICY "expense_adjustments_select" ON "expense_adjustments"
  FOR SELECT
  USING (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );

CREATE POLICY "expense_adjustments_insert" ON "expense_adjustments"
  FOR INSERT
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );
