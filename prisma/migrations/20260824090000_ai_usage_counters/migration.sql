-- Phase 9: AI usage limiting (docs/architecture.md §6.7) — one row per
-- gym per calendar day, incremented on every AI request before the model
-- is invoked. GYM_ADMIN-only, matching the AI assistant's own access
-- scope (D9: Gym Staff has no AI access in MVP) — no GYM_STAFF branch, no
-- Platform Admin bypass, same as every business table since Phase 3.
--
-- Deliberately no reset job/cron/queue: a new (gym_id, date) pair simply
-- has no row yet, so "reset" happens for free via
-- INSERT ... ON CONFLICT (gym_id, date) DO UPDATE SET count = count + 1 —
-- no scheduler needed (docs/decisions.md D8's no-scheduler convention).

-- ============================================================================
-- CreateTable: ai_usage_counters
-- ============================================================================

CREATE TABLE "ai_usage_counters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gym_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_usage_counters_gym_id_date_key" ON "ai_usage_counters"("gym_id", "date");
CREATE INDEX "ai_usage_counters_gym_id_idx" ON "ai_usage_counters"("gym_id");

ALTER TABLE "ai_usage_counters" ADD CONSTRAINT "ai_usage_counters_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SELECT + INSERT + UPDATE (the increment is an upsert) — no DELETE,
-- matching the archivable-table convention (never the append-only one:
-- this row is legitimately mutated in place by every increment).
GRANT SELECT, INSERT, UPDATE ON public.ai_usage_counters TO app_user;

-- ============================================================================
-- Row-Level Security: ENABLE + FORCE, same as every other tenant table
-- ============================================================================

ALTER TABLE "ai_usage_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_usage_counters" FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- Policies: ai_usage_counters — GYM_ADMIN only, every operation. No
-- GYM_STAFF branch at all (D9: Staff has no AI access) — mirrors
-- trainers/expenses' fully-closed-to-Staff shape exactly. No
-- app_is_platform_admin() branch either.
-- ============================================================================

CREATE POLICY "ai_usage_counters_select" ON "ai_usage_counters"
  FOR SELECT
  USING (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );

CREATE POLICY "ai_usage_counters_insert" ON "ai_usage_counters"
  FOR INSERT
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );

CREATE POLICY "ai_usage_counters_update" ON "ai_usage_counters"
  FOR UPDATE
  USING (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  )
  WITH CHECK (
    "gym_id" = app_current_gym_id()
    AND app_current_role() = 'GYM_ADMIN'
  );
