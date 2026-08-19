-- Phase 5: Payments & Financial Integrity — business data, gym-scoped.
--
-- Hand-authored (like the Phase 1/3/4 migrations): RLS policies aren't
-- expressible in Prisma's schema DSL. app_user's table grants live here too
-- (Phase 3's lesson): bootstrap-app-role.sql runs once, before this table
-- exists, and can never grant on it directly.
--
-- Append-only, enforced at the database layer, not merely the service
-- layer (product-spec.md §13 Rule 11, architecture.md §5.7): app_user gets
-- SELECT + INSERT only on both tables below — no UPDATE, no DELETE grant,
-- and correspondingly no UPDATE/DELETE RLS policy either. This is the
-- first insert-only pair of tables in this project (every prior tenant
-- table also granted UPDATE) — a deliberate departure, not an oversight.

-- ============================================================================
-- CreateTable: payments
-- ============================================================================

CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gym_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "amount_millimes" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "recorded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payments_gym_id_idx" ON "payments"("gym_id");
CREATE INDEX "payments_membership_id_idx" ON "payments"("membership_id");

ALTER TABLE "payments" ADD CONSTRAINT "payments_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SELECT + INSERT only — no UPDATE, no DELETE.
GRANT SELECT, INSERT ON public.payments TO app_user;

-- ============================================================================
-- CreateTable: payment_adjustments
-- ============================================================================

CREATE TABLE "payment_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gym_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount_millimes" INTEGER NOT NULL,
    "reason" TEXT,
    "recorded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_adjustments_gym_id_idx" ON "payment_adjustments"("gym_id");
CREATE INDEX "payment_adjustments_payment_id_idx" ON "payment_adjustments"("payment_id");

ALTER TABLE "payment_adjustments" ADD CONSTRAINT "payment_adjustments_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_adjustments" ADD CONSTRAINT "payment_adjustments_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_adjustments" ADD CONSTRAINT "payment_adjustments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SELECT + INSERT only — no UPDATE, no DELETE.
GRANT SELECT, INSERT ON public.payment_adjustments TO app_user;

-- ============================================================================
-- Row-Level Security: ENABLE + FORCE, same as every other tenant table
-- ============================================================================

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;

ALTER TABLE "payment_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_adjustments" FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- Policies: payments
-- Both GYM_ADMIN and GYM_STAFF may read (Staff needs to see a specific
-- member's outstanding balance to collect it — product-spec.md's own core
-- flow #5; the gym-wide revenue/outstanding-payment *totals* restriction
-- for Staff is a Phase 8 dashboard-display concern, not a raw-table
-- restriction) and insert (record a new payment — spec §11.4). No UPDATE
-- or DELETE policy at all: combined with the grants above, mutation is
-- impossible for app_user regardless of role, not merely unreachable
-- through the service layer.
-- ============================================================================

CREATE POLICY "payments_select" ON "payments"
  FOR SELECT
  USING ("gym_id" = app_current_gym_id());

CREATE POLICY "payments_insert" ON "payments"
  FOR INSERT
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() IN ('GYM_ADMIN', 'GYM_STAFF')
  );

-- ============================================================================
-- Policies: payment_adjustments
-- Both roles may read (an adjustment is part of a payment's visible
-- history) — only GYM_ADMIN may insert (void/adjust — spec §11.4, §13 Rule
-- 11). Same no-UPDATE/DELETE-policy-at-all design as payments.
-- ============================================================================

CREATE POLICY "payment_adjustments_select" ON "payment_adjustments"
  FOR SELECT
  USING ("gym_id" = app_current_gym_id());

CREATE POLICY "payment_adjustments_insert" ON "payment_adjustments"
  FOR INSERT
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );
