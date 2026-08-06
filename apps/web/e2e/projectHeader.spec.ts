import { expect, test } from "@playwright/test";

import { readSeedState } from "./fixtures/seed.mjs";

/**
 * The project view is the only page that can create a bean with no parent, so
 * its create affordance has to survive the narrow viewport rather than being
 * dropped from it. These checks are read off real layout — a class name being
 * present says nothing about whether the control fits on a phone.
 */

const MOBILE = { width: 375, height: 812 };

test.describe("the project view's create affordance", () => {
  test("shares the header row with the view toggle on a desktop width", async ({ page }) => {
    const { projectName } = readSeedState();
    await page.goto(`/p/${projectName}`);

    const create = page.getByRole("button", { name: "+ New bean" });
    const toggle = page.locator(".view-toggle");
    await expect(create).toBeVisible();

    const createBox = (await create.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    const toggleBox = (await toggle.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };

    // Same row, create to the right of the toggle: the two share a vertical
    // band rather than stacking.
    expect(Math.abs(createBox.y - toggleBox.y)).toBeLessThan(createBox.height);
    expect(createBox.x).toBeGreaterThan(toggleBox.x);
  });

  test("drops to its own full-width row on a phone, at a real touch size", async ({ page }) => {
    const { projectName } = readSeedState();
    await page.setViewportSize(MOBILE);
    await page.goto(`/p/${projectName}`);

    const heading = page.getByRole("heading", { level: 1, name: projectName, exact: true });
    const create = page.getByRole("button", { name: "+ New bean" });
    const toggle = page.locator(".view-toggle");
    await expect(create).toBeVisible();

    const headingBox = (await heading.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    const createBox = (await create.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    const toggleBox = (await toggle.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    const filterBox = (await page.locator(".filter-bar").boundingBox()) ?? {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };

    // Below the project name rather than competing with it for the same line.
    expect(createBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height);
    // WCAG 2.5.5, the same floor the view toggle and sort controls already meet.
    expect(createBox.height).toBeGreaterThanOrEqual(44);
    // Fully on screen — a create button half off the right edge is worse than
    // one that wrapped.
    expect(createBox.x + createBox.width).toBeLessThanOrEqual(MOBILE.width);

    // The row spans the content column, so the two controls sit at opposite
    // ends rather than packed together: two 44px targets a thumb-width apart
    // are far harder to mis-tap than two separated by a 0.6rem gap. Without
    // the full-width rule the cluster shrink-wraps at the left and this gap
    // collapses to that gap.
    const gap = createBox.x - (toggleBox.x + toggleBox.width);
    expect(gap).toBeGreaterThan(24);
    // Right-aligned to the same edge the content column ends on.
    expect(createBox.x + createBox.width).toBeCloseTo(filterBox.x + filterBox.width, 0);
  });

  test("opens the form inline, above the filters, without covering the page", async ({ page }) => {
    const { projectName } = readSeedState();
    await page.setViewportSize(MOBILE);
    await page.goto(`/p/${projectName}`);

    await page.getByRole("button", { name: "+ New bean" }).click();

    const form = page.locator(".create-bean-form");
    await expect(form).toBeVisible();
    // A disclosure in the page flow, not a modal over it: the filter bar is
    // still there, pushed down rather than hidden behind a scrim.
    await expect(page.locator(".filter-bar")).toBeVisible();

    const formBox = (await form.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    const filterBox = (await page.locator(".filter-bar").boundingBox()) ?? {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
    expect(formBox.y).toBeLessThan(filterBox.y);
    // The form's first field is reachable without scrolling past the fold.
    expect(formBox.y).toBeLessThan(MOBILE.height);
  });
});
