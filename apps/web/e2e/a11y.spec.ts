import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { readSeedState } from "./fixtures/seed.mjs";

import type { Page } from "@playwright/test";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG).analyze();
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
}
