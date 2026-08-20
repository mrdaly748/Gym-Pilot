import { expect, test } from "@playwright/test";

// Originally a Phase 0 sanity check against the placeholder scaffold
// ("AI Gym SaaS" / "Project scaffold — Phase 0") — updated for the real
// GymPilot landing page (Phase 9.5) rather than left asserting text that
// no longer exists. Still proves the Playwright e2e runner/webServer boot
// works, plus that the one real entry point (Sign in -> /login) is present.
test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Run your gym smarter." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
});
