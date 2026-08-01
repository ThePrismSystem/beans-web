import { expect, test } from "@playwright/test";

import { readSeedState } from "./fixtures/seed.mjs";

test.describe("empty states (real data)", () => {
  test("a gibberish search reports no matches", async ({ page }) => {
    await page.goto("/search?q=zzzznomatchzzzz");
    await expect(page.getByText(/No beans match/)).toBeVisible();
  });

  test("the empty project shows an empty bean list", async ({ page }) => {
    const { emptyProjectName } = readSeedState();
    await page.goto("/");
    await page.locator(".project-row", { hasText: emptyProjectName }).click();
    await expect(page.getByText("No beans match the current filters.")).toBeVisible();
  });
});

test.describe("error states (mocked)", () => {
  // React Query retries failed requests three times with exponential backoff
  // (~7s) before surfacing isError, so the error copy needs a longer wait.
  const ERROR_TIMEOUT = 15_000;

  test("overview shows an error when projects fail to load", async ({ page }) => {
    await page.route("**/api/projects", (route) => route.fulfill({ status: 500, body: "boom" }));
    await page.goto("/");
    await expect(page.getByText("Failed to load projects.")).toBeVisible({
      timeout: ERROR_TIMEOUT,
    });
  });

  test("analytics shows an error when the request fails", async ({ page }) => {
    await page.route("**/api/analytics", (route) => route.abort());
    await page.goto("/analytics");
    await expect(page.getByText("Failed to load analytics.")).toBeVisible({
      timeout: ERROR_TIMEOUT,
    });
  });

  test("analytics shows a partial-failure banner", async ({ page }) => {
    const body = JSON.stringify({
      perProject: [{ project: "e2e-project", total: 2, open: 2 }],
      byType: { milestone: 0, epic: 0, feature: 1, task: 1, bug: 0 },
      byStatus: { draft: 0, todo: 2, "in-progress": 0, completed: 0, scrapped: 0 },
      completedByMonth: [],
      failures: ["broken-project"],
    });
    await page.route("**/api/analytics", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body }),
    );
    await page.goto("/analytics");
    await expect(page.getByText(/Some projects failed to load: broken-project/)).toBeVisible();
  });

  test("bean detail shows an error when the query fails", async ({ page }) => {
    const { projectName, featureTitle } = readSeedState();
    await page.goto("/");
    await page.locator(".project-row", { hasText: projectName }).click();
    await expect(page.getByText(featureTitle).first()).toBeVisible();
    // Fail only the detail POST; the list has already loaded above.
    await page.route("**/api/projects/**/graphql", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ errors: [{ message: "boom" }] }),
      }),
    );
    await page.getByText(featureTitle).first().click();
    await expect(page.getByText("Failed to load bean.")).toBeVisible({ timeout: ERROR_TIMEOUT });
  });
});
