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

  test("opens as a dialog that fits the phone viewport", async ({ page }) => {
    const { projectName } = readSeedState();
    await page.setViewportSize(MOBILE);
    await page.goto(`/p/${projectName}`);

    await page.getByRole("button", { name: "+ New bean" }).click();

    const dialog = page.getByRole("dialog", { name: "New bean" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    const box = (await dialog.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    // Wholly on screen in both axes. A dialog taller than the viewport with no
    // internal scroll puts Create bean somewhere unreachable on a phone.
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(MOBILE.width);
    expect(box.height).toBeLessThanOrEqual(MOBILE.height);
    // The submit control is reachable by scrolling the dialog, not the page.
    await dialog.getByRole("button", { name: "Create bean" }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole("button", { name: "Create bean" })).toBeVisible();
  });

  test("its bean picker stacks above it, and Escape unwinds one layer at a time", async ({
    page,
  }) => {
    const { projectName } = readSeedState();
    await page.goto(`/p/${projectName}`);

    await page.getByRole("button", { name: "+ New bean" }).click();
    const createDialog = page.getByRole("dialog", { name: "New bean" });
    await createDialog.getByRole("button", { name: "Set parent" }).click();

    const picker = page.getByRole("dialog", { name: "Set parent" });
    await expect(picker).toBeVisible();

    // Rendered over the dialog that opened it rather than under it: a point in
    // the middle of the picker must hit the picker's own subtree.
    const box = (await picker.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    const onTop = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest(".picker") !== null,
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(onTop).toBe(true);

    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    await expect(createDialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(createDialog).toBeHidden();
  });
});
