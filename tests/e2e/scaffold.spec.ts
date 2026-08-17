import { expect, test } from "@playwright/test";

// Phase 0 sanity check: proves the Playwright e2e runner (and its
// webServer boot) is wired up correctly. Replace/extend with real user-flow
// tests starting Phase 2.
test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AI Gym SaaS" })).toBeVisible();
});
