import { expect, test } from "@playwright/test";

/**
 * The drawer breakpoint lives twice: as a media query in global.css and as
 * DRAWER_BREAKPOINT in AppShell.tsx, which decides when the closed sidebar
 * becomes `inert`. CSS custom properties cannot be used in media queries, so
 * the literal cannot be shared without extra tooling — but the two drifting
 * apart is exactly what would silently break: a sidebar drawn off-screen while
 * still holding focus, or a visible sidebar nobody can tab into.
 *
 * These pin both sides of the boundary rather than the value itself.
 */

const BREAKPOINT = 768;

test.describe("drawer breakpoint", () => {
  test(`at ${String(BREAKPOINT)}px the sidebar is a drawer and is inert when closed`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: BREAKPOINT, height: 800 });
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Toggle project menu" })).toBeVisible();
    await expect(page.locator("nav.sidebar")).toHaveAttribute("inert", "");
  });

  test(`at ${String(BREAKPOINT + 1)}px the sidebar is persistent and never inert`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: BREAKPOINT + 1, height: 800 });
    await page.goto("/");

    await expect(page.locator("nav.sidebar")).toBeVisible();
    await expect(page.locator("nav.sidebar")).not.toHaveAttribute("inert", "");
    await expect(page.getByRole("button", { name: "Toggle project menu" })).toBeHidden();
    // The links must be reachable, which is the whole point of not being inert.
    await expect(page.locator("nav.sidebar").getByRole("link", { name: "Overview" })).toBeVisible();
  });

  test("crossing the breakpoint updates inert without a reload", async ({ page }) => {
    await page.setViewportSize({ width: BREAKPOINT + 1, height: 800 });
    await page.goto("/");
    await expect(page.locator("nav.sidebar")).not.toHaveAttribute("inert", "");

    await page.setViewportSize({ width: BREAKPOINT, height: 800 });

    await expect(page.locator("nav.sidebar")).toHaveAttribute("inert", "");
  });
});
