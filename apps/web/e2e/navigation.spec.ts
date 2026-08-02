import { expect, test } from "@playwright/test";

import { readSeedState } from "./fixtures/seed.mjs";

/**
 * A single-page app changes view without the browser doing anything a screen
 * reader notices: the document title stays put and focus lands nowhere. Every
 * route here used to be titled "beans-frontend", and every navigation dropped
 * focus onto <body>, so a non-sighted user got no signal at all that the page
 * had changed.
 */

test.describe("navigation is perceivable", () => {
  test("each route names itself in the document title", async ({ page }) => {
    const { projectName } = readSeedState();

    await page.goto("/");
    await expect(page).toHaveTitle("Overview · beans");

    await page.getByRole("link", { name: "Analytics" }).click();
    await expect(page).toHaveTitle("Analytics · beans");

    await page.locator("nav.sidebar").getByText(projectName).first().click();
    await expect(page).toHaveTitle(`${projectName} · beans`);

    // Whichever bean is first — other specs in this run rename the seeded one,
    // so the title is read off the page rather than assumed from the fixture.
    await page.locator(".bean-row-title").first().click();
    const beanTitle = await page.getByRole("heading", { level: 1 }).innerText();
    await expect(page).toHaveTitle(`${beanTitle} · beans`);
  });

  test("focus moves into the main landmark on navigation", async ({ page }) => {
    const { projectName } = readSeedState();
    await page.goto("/");

    await page.locator(".project-row", { hasText: projectName }).click();
    await expect(page.getByRole("heading", { name: projectName, exact: true })).toBeVisible();

    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("first paint does not steal focus", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    // Landing on a page should leave focus at the document start, so the skip
    // link is the first thing Tab reaches.
    await expect(page.locator("#main-content")).not.toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });

  test("a failed load is announced rather than shown silently", async ({ page }) => {
    // Every project query fails, so the list must reach its error branch.
    await page.route("**/api/projects*", (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.goto("/");

    // TanStack Query retries three times with exponential backoff before it
    // settles as an error, which outlasts the default assertion timeout.
    await expect(page.getByRole("alert")).toHaveText("Failed to load projects.", {
      timeout: 20_000,
    });
  });
});
