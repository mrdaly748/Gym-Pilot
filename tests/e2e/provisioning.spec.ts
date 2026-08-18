import { expect, test } from "@playwright/test";

/**
 * Phase 2 provisioning flow, run against the hosted Supabase dev project
 * (docs/implementation-plan.md Phase 2's E2E verification) — not the
 * ephemeral test Postgres used by tests/isolation/ and tests/integration/
 * (docs/decisions.md D18), since this needs real Supabase Auth email
 * delivery for the invite links.
 *
 * Requires, none of which this test can set up itself:
 *   - SUPABASE_SERVICE_ROLE_KEY set in .env (lib/server/supabaseAdmin.ts).
 *   - Both Phase 1 and Phase 2 migrations applied to the hosted project.
 *   - One pre-existing Platform Admin account in that project (there is no
 *     self-serve "first admin" bootstrap flow — a Platform Admin is
 *     provisioned out-of-band, by the project owner).
 *   - E2E_PLATFORM_ADMIN_EMAIL / E2E_PLATFORM_ADMIN_PASSWORD env vars for
 *     that account.
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

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test("Platform Admin can create a gym, and it appears in the gym list", async ({
  page,
}) => {
  await login(page, platformAdminEmail!, platformAdminPassword!);
  await expect(page).toHaveURL("/platform");

  await page.goto("/platform/gyms");
  const gymName = `E2E Test Gym ${Date.now()}`;
  await page.getByLabel("Gym name").fill(gymName);
  await page
    .getByLabel("Initial Gym Admin email")
    .fill(`e2e-admin-${Date.now()}@example.invalid`);
  await page.getByRole("button", { name: /Create gym/ }).click();

  await expect(page).toHaveURL("/platform/gyms");
  await expect(page.getByText(gymName)).toBeVisible();
});

test("Platform Admin suspending a gym blocks that gym's login with a clear message", async ({
  page,
}) => {
  await login(page, platformAdminEmail!, platformAdminPassword!);
  await page.goto("/platform/gyms");

  const gymName = `E2E Suspend Gym ${Date.now()}`;
  await page.getByLabel("Gym name").fill(gymName);
  await page
    .getByLabel("Initial Gym Admin email")
    .fill(`e2e-suspend-admin-${Date.now()}@example.invalid`);
  await page.getByRole("button", { name: /Create gym/ }).click();

  const row = page.getByRole("row").filter({ hasText: gymName });
  await row.getByRole("button", { name: "Suspend" }).click();
  await expect(row.getByText("SUSPENDED")).toBeVisible();

  // The invited Gym Admin never set a password in this automated run (no
  // real inbox to read the invite email from), so this only proves the
  // gym's status flipped and is visible — the actual blocked-login message
  // is covered by tests/integration/auth-context.test.ts's
  // "resolveIdentity reports gym_suspended" case at the application layer.
});
