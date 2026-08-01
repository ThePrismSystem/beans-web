import { devices, expect, test } from "@playwright/test";

import { readSeedState } from "./fixtures/seed.mjs";

test.use({ ...devices["Pixel 5"] });

test.describe("mobile viewport", () => {
  test("overview has no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("the sidebar drawer opens and closes via the hamburger and backdrop", async ({ page }) => {
    await page.goto("/");
    const hamburger = page.getByRole("button", { name: "Toggle project menu" });
    await expect(hamburger).toBeVisible();
    await expect(hamburger).toHaveAttribute("aria-expanded", "false");
    await hamburger.tap();
    await expect(hamburger).toHaveAttribute("aria-expanded", "true");
    // The backdrop spans the viewport but sits behind the 300px-wide drawer, so
    // tap it in the uncovered right-hand region rather than its (covered) center.
    await page.getByRole("button", { name: "Close menu" }).tap({ position: { x: 360, y: 300 } });
    await expect(hamburger).toHaveAttribute("aria-expanded", "false");
  });

  test("a project is reachable from the drawer under touch", async ({ page }) => {
    const { projectName } = readSeedState();
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle project menu" }).tap();
    await page.locator(".sidebar").getByText(projectName).first().tap();
    await expect(page.getByRole("heading", { name: projectName, exact: true })).toBeVisible();
  });
});
