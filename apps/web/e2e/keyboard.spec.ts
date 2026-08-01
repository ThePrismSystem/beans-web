import { expect, test } from "@playwright/test";

import { readSeedState } from "./fixtures/seed.mjs";

test.describe("keyboard-only navigation", () => {
  test("the relationship picker traps focus and Escape restores it", async ({ page }) => {
    const { projectName, featureTitle } = readSeedState();
    await page.goto("/");
    await page.locator(".project-row", { hasText: projectName }).click();
    await page.getByText(featureTitle).first().click();
    await expect(page.locator("button.bean-detail-title")).toBeVisible();

    const trigger = page.getByRole("button", { name: "Add blocks" });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Add blocks" });
    await expect(dialog).toBeVisible();
    // Focus moved into the dialog's search on open.
    await expect(dialog.getByLabel("Search beans")).toBeFocused();

    // Tab stays inside the dialog (focus trap).
    await page.keyboard.press("Tab");
    const insideDialog = await dialog.evaluate((el) => el.contains(document.activeElement));
    expect(insideDialog).toBe(true);

    // Escape closes and restores focus to the trigger.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("the hierarchy/flat toggle is operable by keyboard", async ({ page }) => {
    const { projectName } = readSeedState();
    await page.goto("/");
    await page.locator(".project-row", { hasText: projectName }).click();
    const flat = page.getByRole("button", { name: "Flat", exact: true });
    await flat.focus();
    await page.keyboard.press("Enter");
    await expect(flat).toHaveAttribute("aria-pressed", "true");
  });
});
