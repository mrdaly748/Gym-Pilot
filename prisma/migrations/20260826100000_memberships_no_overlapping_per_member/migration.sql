-- Business rule (portfolio-readiness hardening pass, product-spec.md §13
-- Rule 8 / §18): a member may not have two overlapping non-cancelled
-- memberships ("normally a member has exactly one active membership at a
-- time — concurrent/overlapping active memberships are not supported in
-- MVP"). lib/server/services/memberships.ts's assignMembership() already
-- rejects a second assignment while the member has a current
-- (active/expiring-soon/frozen) membership — but that check-then-write is
-- not atomic: two concurrent assignMembership() calls for the same member
-- could both pass the check before either commits. This exclusion
-- constraint is the actual, final authority — same "app pre-check + DB
-- constraint + P-code translation" pattern as the attendance
-- one-check-in-per-day migration and the members unique-phone migration
-- just before this one.
--
-- Modeled as date-range overlap, not the app's own status-based "current"
-- check, because status depends on the passage of time (now > end_date =>
-- EXPIRED) and on a second table (membership_freezes) — neither of which a
-- static database constraint can evaluate; a constraint only ever sees
-- committed column values, never "now". Date-range overlap is the closest
-- fully-static invariant that is provably consistent with the app's own
-- guarantees:
--   - renewMembership() always starts the new row the day after the prior
--     membership's end_date (no gap, no overlap by construction).
--   - assignMembership()'s existing hasCurrent check already blocks a
--     second assignment while a prior one is active/expiring/frozen.
-- So under normal application use, no two non-cancelled memberships for the
-- same member ever have overlapping date ranges — this constraint only
-- ever fires on the race this migration exists to close, or on a
-- deliberately-backdated assignment that would otherwise silently violate
-- Rule 8 (the app's status check alone would miss this, since an
-- already-expired-but-not-cancelled membership doesn't count as "current" —
-- the database constraint is strictly stronger there, not merely a race
-- backstop).
--
-- Cancelled memberships are excluded (WHERE cancelled_at IS NULL):
-- cancellation frees the member for a new membership even if the
-- (now-irrelevant) dates would otherwise overlap — matching
-- assignMembership()'s own status-based check, which never counts
-- CANCELLED as "current".
--
-- Inclusive on both ends ('[]'): start_date/end_date are themselves
-- inclusive (renewMembership starts the day *after* the prior end_date, not
-- on it), so two back-to-back, non-overlapping memberships are correctly
-- accepted.
--
-- Requires btree_gist — a standard PostgreSQL contrib extension (not a
-- third-party dependency), needed so a GiST index can combine an equality
-- comparison (member_id) with a range-overlap comparison (daterange) in one
-- exclusion constraint. This is the standard Postgres idiom for "no two
-- overlapping ranges per group" (the same technique used for room-booking
-- systems). Available on every Postgres this project targets: bundled with
-- the official contrib package (the local embedded-postgres test
-- substrate, CI's postgres:16 service container), and supported as a
-- standard extension on Supabase.
--
-- Not expressible in Prisma's schema DSL (EXCLUDE constraints have no
-- Prisma equivalent, unlike the plain @@unique used for the members
-- migration just before this one) — hand-authored here, same discipline as
-- RLS policies and the attendance expression index. schema.prisma carries
-- an explanatory comment on the Membership model pointing back to this
-- file, but no attribute (there is nothing to declare).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_no_overlapping_per_member"
  EXCLUDE USING gist (
    "member_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  )
  WHERE ("cancelled_at" IS NULL);
