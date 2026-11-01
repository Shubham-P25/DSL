import { test, expect } from "@playwright/test";

test("home page exposes the upload workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/SignalPath/i);
  await expect(page.getByText(/upload|paste/i).first()).toBeVisible();
});

test("dashboard route loads", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/dashboard/);
});
