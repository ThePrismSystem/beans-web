import { expect, test } from "@playwright/test";

import { scan } from "./fixtures/axe.js";
import { readSeedState } from "./fixtures/seed.mjs";

import type { Page } from "@playwright/test";

/** Opens the seeded project's first feature bean. */
async function gotoBean(page: Page) {
  const { projectName, featureTitle } = readSeedState();
  await page.goto("/");
  await page.locator(".project-row", { hasText: projectName }).click();
  await page.getByText(featureTitle).first().click();
  await expect(page.locator("button.bean-detail-title")).toBeVisible();
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`accessibility (${scheme} mode)`, () => {
    test.use({ colorScheme: scheme });

    runA11ySuite();
  });
}

function runA11ySuite() {
  test("overview has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/");
    const { violations } = await scan(page);
    expect(violations).toEqual([]);
  });

  test("project view (hierarchy and flat) has no violations", async ({ page }) => {
    const { projectName } = readSeedState();
    await page.goto("/");
    await page.locator(".project-row", { hasText: projectName }).click();
    expect((await scan(page)).violations).toEqual([]);
    await page.getByRole("button", { name: "Flat", exact: true }).click();
    expect((await scan(page)).violations).toEqual([]);
  });

  test("bean detail has no violations", async ({ page }) => {
    const { projectName, featureTitle } = readSeedState();
    await page.goto("/");
    await page.locator(".project-row", { hasText: projectName }).click();
    await page.getByText(featureTitle).first().click();
    await expect(page.locator("button.bean-detail-title")).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });

  test("analytics has no violations", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Analytics" }).click();
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });

  test("search results have no violations", async ({ page }) => {
    const { featureTitle } = readSeedState();
    await page.goto("/");
    const search = page.getByRole("search", { name: "Global search" });
    await search.getByLabel("Search all beans").fill(featureTitle);
    await expect(page.locator(".header-search-dropdown")).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });

  // Dialogs were previously never scanned: every surface above renders with
  // them closed, so nothing inside one was ever checked.
  test("the scrap dialog has no violations", async ({ page }) => {
    await gotoBean(page);
    await page.getByRole("button", { name: "Scrap", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });

  test("the delete dialog has no violations", async ({ page }) => {
    await gotoBean(page);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });

  test("the relation picker has no violations", async ({ page }) => {
    await gotoBean(page);
    await page.getByRole("button", { name: "Add blocks" }).click();
    await expect(page.getByRole("dialog", { name: "Add blocks" })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });

  test("an open filter menu has no violations", async ({ page }) => {
    const { projectName } = readSeedState();
    await page.goto("/");
    await page.locator(".project-row", { hasText: projectName }).click();
    await page.getByRole("button", { name: /^Status/ }).click();
    await expect(page.getByRole("group", { name: "Status" })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });
}
