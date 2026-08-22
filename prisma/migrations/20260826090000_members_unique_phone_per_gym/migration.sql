-- Business rule (portfolio-readiness hardening pass): a member's phone
-- number (normalized) must be unique within a gym.
-- lib/server/services/members.ts's createMember()/updateMember() already
-- check for a duplicate via findDuplicateByPhone() before writing —
-- matching against archived members too (product-spec.md §18's "returning
-- member" edge case) — but that check-then-write is not atomic on its own:
-- two concurrent createMember() calls for the same phone number could both
-- pass the check before either commits. This unique index is the actual,
-- final authority: Postgres rejects the second row, and the service layer
-- translates the resulting P2002 error into the same DuplicateMemberError
-- callers already get from the pre-check — same pattern as the attendance
-- one-check-in-per-day migration
-- (prisma/migrations/20260825090000_attendance_one_checkin_per_day).
--
-- No partial WHERE clause (archived members are included): the duplicate
-- check this backs intentionally matches archived members too, so the
-- database invariant must too, or a race could silently create the exact
-- duplicate the returning-member reconciliation exists to prevent.
--
-- Replaces the plain (non-unique) index created in
-- 20260819100000_members_and_plans — a unique index already serves every
-- lookup the old one did, so keeping both would be a redundant duplicate
-- index. Expressible directly in Prisma's schema DSL (@@unique), unlike the
-- attendance expression index or the memberships overlap constraint added
-- in the next migration — schema.prisma has been updated to match.
DROP INDEX "members_gym_id_phone_normalized_idx";

CREATE UNIQUE INDEX "members_gym_id_phone_normalized_key"
  ON "members" ("gym_id", "phone_normalized");
