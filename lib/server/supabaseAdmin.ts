import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — Auth Admin API only (create/invite/delete
 * users). Never used for business data (that stays on Prisma + RLS, see
 * lib/server/db.ts) and never imported into anything client-facing.
 *
 * SUPABASE_SERVICE_ROLE_KEY bypasses Auth restrictions entirely; it must
 * never reach a browser bundle, a Client Component, or a log line. This
 * module exists specifically so that capability is confined to one file
 * instead of being reachable from anywhere `@supabase/supabase-js` is
 * imported (see docs/decisions.md — Phase 2 entry).
 */
function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to provision users.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Creates a Supabase Auth user and emails them an invite link (Supabase's
 * built-in flow) to set their own password via the existing
 * /auth/callback -> /reset-password path from Phase 1. Neither the
 * Platform Admin nor the Gym Admin who triggers this ever sees or sets the
 * new user's password.
 *
 * Throws on failure (e.g. duplicate email) — callers must not attempt any
 * database write until this resolves successfully, since there is no cross-
 * system transaction: see lib/server/services/platformAdmin.ts and
 * gymStaff.ts for the explicit create-then-compensate pattern this enables.
 */
export async function inviteAuthUser(
  email: string,
  redirectTo: string,
): Promise<{ id: string }> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });
  if (error || !data.user) {
    throw new Error(`Failed to invite user: ${error?.message ?? "unknown error"}`);
  }
  return { id: data.user.id };
}

/**
 * Best-effort compensating deletion, used only when the PostgreSQL side of
 * a provisioning flow fails after the Auth user was already created. Never
 * throws — a failure here is logged (without credentials) and surfaced to
 * the caller as part of the original error, not as a new thrown error that
 * could mask it.
 */
export async function deleteAuthUserBestEffort(userId: string): Promise<void> {
  try {
    const admin = getSupabaseAdminClient();
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error(
        `[supabaseAdmin] Compensating deletion failed for auth user ${userId}: ${error.message}`,
      );
    }
  } catch (cleanupError) {
    console.error(
      `[supabaseAdmin] Compensating deletion threw for auth user ${userId}:`,
      cleanupError instanceof Error ? cleanupError.message : cleanupError,
    );
  }
}
