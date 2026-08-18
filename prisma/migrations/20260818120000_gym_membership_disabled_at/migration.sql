-- Phase 2: staff-disable mechanism (docs/decisions.md — Phase 2 entry).
-- Purely additive (nullable column, no default). No RLS policy change is
-- needed: the existing gym_memberships_update policy (prisma/migrations/
-- 20260818090322_rls_core/migration.sql) already scopes UPDATE to a Gym
-- Admin's own gym, which is exactly what's required to let a Gym Admin set
-- this on their own gym's staff rows. No bootstrap-app-role.sql change is
-- needed either: app_user's UPDATE grant on gym_memberships is table-level,
-- not column-level.

-- AlterTable
ALTER TABLE "gym_memberships" ADD COLUMN "disabled_at" TIMESTAMP(3);
