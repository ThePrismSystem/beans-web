import { devices, expect, test } from "@playwright/test";

import { scan } from "./fixtures/axe.js";

// a11y.spec.ts runs at the default desktop viewport, where the sidebar is never
// a drawer and the filter bar never collapses — so the mobile layout had no
// automated accessibility coverage at all.
test.use({ ...devices["Pixel 5"] });

test.describe("accessibility (mobile)", () => {
  test("overview has no violations", async ({ page }) => {
    await page.goto("/");
    expect((await scan(page)).violations).toEqual([]);
  });

  test("the open navigation drawer has no violations", async ({ page }) => {
    await page.goto("/");
    const hamburger = page.getByRole("button", { name: "Toggle project menu" });
    await hamburger.tap();
    await expect(hamburger).toHaveAttribute("aria-expanded", "true");
    expect((await scan(page)).violations).toEqual([]);
  });

  test("the closed drawer keeps its links out of the tab order", async ({ page }) => {
    await page.goto("/");
    // The drawer is hidden by a transform alone, which would otherwise leave
    // its links tabbable while off-screen.
    await expect(page.locator("nav.sidebar")).toHaveAttribute("inert", "");
    // `inert` does not change CSS visibility, so this has to test the thing
    // that actually matters: whether focus can land on the links at all.
    const focusable = await page.locator("nav.sidebar a").evaluateAll((links) =>
      links.filter((link) => {
        (link as HTMLElement).focus();
        return document.activeElement === link;
      }),
    );
    expect(focusable).toHaveLength(0);
  });

  test("analytics has no violations and does not overflow", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
