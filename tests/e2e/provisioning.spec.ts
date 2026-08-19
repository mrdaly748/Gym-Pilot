import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

/**
 * Phase 2 provisioning flow, run against the hosted Supabase dev project
 * (docs/implementation-plan.md Phase 2's E2E verification) — not the
 * ephemeral test Postgres used by tests/isolation/ and tests/integration/
 * (docs/decisions.md D18), since this needs real Supabase Auth.
 *
 * Requires, none of which this test can set up itself:
 *   - SUPABASE_SERVICE_ROLE_KEY set in .env (lib/server/supabaseAdmin.ts,
 *     and this file's own completeInviteViaGeneratedLink() helper).
 *   - Both Phase 1 and Phase 2 migrations applied to the hosted project.
 *   - One pre-existing Platform Admin account in that project (there is no
 *     self-serve "first admin" bootstrap flow — a Platform Admin is
 *     provisioned out-of-band, by the project owner).
 *   - E2E_PLATFORM_ADMIN_EMAIL / E2E_PLATFORM_ADMIN_PASSWORD env vars for
 *     that account.
 *   - DIRECT_URL (owner role) for this file's own cleanup helper.
 *
 * Skips itself (rather than failing) when those aren't configured, so a
 * normal `npm run test:e2e` run doesn't require hosted-project access.
 */
const platformAdminEmail = process.env.E2E_PLATFORM_ADMIN_EMAIL;
const platformAdminPassword = process.env.E2E_PLATFORM_ADMIN_PASSWORD;

test.skip(
  !platformAdminEmail || !platformAdminPassword,
  "E2E_PLATFORM_ADMIN_EMAIL / E2E_PLATFORM_ADMIN_PASSWORD not set — see this file's header comment.",
);

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  // click() only waits for the click to dispatch, not for loginAction's
  // async redirect (a Server Action, so the actual navigation completes
  // after a fetch round-trip) to land. Waiting for the URL to leave
  // /login is a direct, observable signal that the redirect completed —
  // not a fixed delay.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL((url) => url.pathname === "/login", {
    timeout: 15_000,
  });
}

/**
 * Completes an already-invited user's password setup without reading a
 * real inbox, using Supabase's Admin API to generate the same kind of
 * action link a real email would contain, then driving the browser through
 * the application's own, real, unmodified flow:
 *
 *   generateLink() -> Supabase's /auth/v1/verify -> our /auth/callback
 *   -> exchangeCodeForSession() -> /reset-password -> resetPasswordAction
 *   -> authenticated session
 *
 * E2E test infrastructure only — SUPABASE_SERVICE_ROLE_KEY never reaches
 * application code, and no session/DB row is fabricated or written
 * directly; every step after generateLink() is the real app handling a
 * real Supabase-issued link.
 */
async function completeInviteViaGeneratedLink(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to complete an invite via a generated link.",
    );
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: "http://localhost:3000/auth/callback?next=/reset-password",
    },
  });
  if (error || !data?.properties?.action_link) {
    throw new Error(
      `generateLink failed for ${email}: ${error?.message ?? "no action_link returned"}`,
    );
  }

  await page.goto(data.properties.action_link);
  await page.waitForURL((url) => url.pathname === "/reset-password", {
    timeout: 15_000,
  });
  await page.getByLabel("New password").fill(password);
  await page.getByRole("button", { name: "Update password" }).click();
  await page.waitForURL(
    (url) => url.pathname !== "/reset-password" && url.pathname !== "/login",
    { timeout: 15_000 },
  );
}

/**
 * Deterministic, scoped-by-name cleanup: resolves exactly the gym this
 * test run created (by its unique, timestamped name) and removes it plus
 * every membership/user that gym alone references, in FK-safe order, then
 * the corresponding Auth users. Never touches anything else — in
 * particular, a gym name that doesn't match anything (e.g. the test
 * failed before creating it) is a safe no-op, and the Platform Admin
 * account is never queried or touched by this helper at all.
 */
async function cleanupGymByName(gymName: string): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const directUrl = process.env.DIRECT_URL;
  if (!supabaseUrl || !serviceRoleKey || !directUrl) {
    return;
  }

  const db = new Client({ connectionString: directUrl });
  await db.connect();
  let userIds: string[] = [];
  try {
    const gymRes = await db.query<{ id: string }>(
      "SELECT id FROM gyms WHERE name = $1",
      [gymName],
    );
    if (gymRes.rows.length === 0) {
      return;
    }
    const gymId = gymRes.rows[0].id;

    const memberRes = await db.query<{ user_id: string }>(
      "SELECT user_id FROM gym_memberships WHERE gym_id = $1",
      [gymId],
    );
    userIds = memberRes.rows.map((r) => r.user_id);

    await db.query("DELETE FROM gym_memberships WHERE gym_id = $1", [gymId]);
    await db.query("DELETE FROM gyms WHERE id = $1", [gymId]);
    for (const id of userIds) {
      await db.query("DELETE FROM users WHERE id = $1", [id]);
    }
  } finally {
    await db.end();
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
}

test("Platform Admin can create a gym, and it appears in the gym list", async ({
  page,
}) => {
  const gymName = `E2E Test Gym ${Date.now()}`;
  try {
    await login(page, platformAdminEmail!, platformAdminPassword!);
    await expect(page).toHaveURL("/platform");

    await page.goto("/platform/gyms");
    await page.getByLabel("Gym name").fill(gymName);
    await page
      .getByLabel("Initial Gym Admin email")
      .fill(`e2e-admin-${Date.now()}@example.invalid`);
    await page.getByRole("button", { name: /Create gym/ }).click();

    await expect(page).toHaveURL("/platform/gyms");
    await expect(page.getByText(gymName)).toBeVisible();
  } finally {
    await cleanupGymByName(gymName);
  }
});

test("Full provisioning flow: Gym Admin, Gym Staff, and gym suspension", async ({
  page,
}) => {
  test.skip(
    !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL,
    "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL not set — required to complete invited-user logins without a real inbox.",
  );
  // This test performs ~13 sequential steps against the real hosted
  // Supabase project (3 logins, 2 generated-link password resets, gym +
  // staff provisioning, a suspend, and a blocked-login check) — the
  // default 30s test timeout is sized for a single short scenario, not
  // this full chain, and was observed to trip mid-flow with no other
  // failure present. Not a fixed sleep — Playwright's own timeout budget,
  // sized to this test's genuine scope.
  test.setTimeout(120_000);

  const runId = Date.now();
  const gymName = `E2E Full Flow Gym ${runId}`;
  const gymAdminEmail = `e2e-full-admin-${runId}@example.invalid`;
  const gymAdminPassword = `E2eAdminPw!${runId}`;
  const staffEmail = `e2e-full-staff-${runId}@example.invalid`;
  const staffPassword = `E2eStaffPw!${runId}`;

  try {
    // 1. Platform Admin logs in.
    await login(page, platformAdminEmail!, platformAdminPassword!);
    await expect(page).toHaveURL("/platform");

    // 2. Platform Admin creates a Gym (this also provisions the initial
    //    Gym Admin — scenario 3 — via the real createGym() service).
    await page.goto("/platform/gyms");
    await page.getByLabel("Gym name").fill(gymName);
    await page.getByLabel("Initial Gym Admin email").fill(gymAdminEmail);
    await page.getByRole("button", { name: /Create gym/ }).click();
    await expect(page).toHaveURL("/platform/gyms");
    await expect(page.getByText(gymName)).toBeVisible();

    // /platform/gyms has no logout button of its own — only /platform does.
    await page.goto("/platform");
    await logout(page);

    // 4. Gym Admin can authenticate (via the real /auth/callback ->
    //    /reset-password -> resetPasswordAction flow, entered through a
    //    generated link instead of a real inbox).
    await completeInviteViaGeneratedLink(page, gymAdminEmail, gymAdminPassword);
    await expect(page).toHaveURL(/\/gym\/[^/]+$/);
    const gymId = new URL(page.url()).pathname.split("/")[2];

    // 5. Gym Admin can access their gym — proven by landing there, and by
    //    the Gym-Admin-only "Manage staff" link being visible.
    await expect(page.getByRole("link", { name: "Manage staff" })).toBeVisible();

    // 6. Gym Admin creates Gym Staff.
    await page.goto(`/gym/${gymId}/staff`);
    await page.getByLabel("Staff email").fill(staffEmail);
    await page.getByRole("button", { name: "Invite staff" }).click();
    await expect(page).toHaveURL(`/gym/${gymId}/staff`);
    await expect(page.getByText(staffEmail)).toBeVisible();

    // /gym/[gymId]/staff has no logout button of its own — only the gym
    // home page does.
    await page.goto(`/gym/${gymId}`);
    await logout(page);

    // 7. Gym Staff can authenticate.
    await completeInviteViaGeneratedLink(page, staffEmail, staffPassword);
    await expect(page).toHaveURL(`/gym/${gymId}`);

    // 8. Gym Staff has the correct restricted permissions: no "Manage
    //    staff" link, and direct navigation to the staff-management route
    //    is rejected by the route's own Gym-Admin-only check (redirected
    //    back to the gym home page, not merely hidden in the UI).
    await expect(
      page.getByRole("link", { name: "Manage staff" }),
    ).toHaveCount(0);
    await page.goto(`/gym/${gymId}/staff`);
    await expect(page).toHaveURL(`/gym/${gymId}`);

    await logout(page);

    // 9. Platform Admin suspends the Gym.
    await login(page, platformAdminEmail!, platformAdminPassword!);
    await page.goto("/platform/gyms");
    const row = page.getByRole("row").filter({ hasText: gymName });
    await row.getByRole("button", { name: "Suspend" }).click();
    await expect(row.getByText("SUSPENDED")).toBeVisible();

    // /platform/gyms has no logout button of its own — only /platform does.
    await page.goto("/platform");
    await logout(page);

    // 10 & 11. A suspended gym blocks login, with the correct,
    // non-technical, user-facing message — not a generic error. This
    // deliberately does NOT use the shared login() helper, since that
    // helper waits for navigation away from /login, which must NOT happen
    // here.
    await page.goto("/login");
    await page.getByLabel("Email").fill(gymAdminEmail);
    await page.getByLabel("Password").fill(gymAdminPassword);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/login\?error=gym_suspended/, {
      timeout: 15_000,
    });
    // getByRole("alert") is ambiguous here: Next.js's own accessibility
    // route-announcer div also carries role="alert". The app's actual error
    // message is specifically a <p role="alert">, so target that element
    // directly rather than the ARIA role alone.
    await expect(page.locator('p[role="alert"]')).toContainText(
      "This gym's account is currently inactive. Contact your gym administrator.",
    );
  } finally {
    await cleanupGymByName(gymName);
  }
});
