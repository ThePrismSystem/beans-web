import { expect, test } from "@playwright/test";

import type { Page } from "@playwright/test";

/**
 * The search page shipped with no CSS of its own. Its input borrowed its looks
 * from `.filter-bar input`, a compound selector that never matched here, so it
 * rendered as a bare UA control: 185px wide at every viewport, `2px inset`
 * border, Arial, white background. Result rows had no separators and wrapped
 * mid-word on a phone.
 *
 * Every assertion below reads resolved style back out of a real browser,
 * because the failure mode was a rule that quietly did not apply — invisible
 * to any test that only looks at markup.
 */

// The one seeded bean whose title no other spec rewrites, so the hit set does
// not depend on where this file lands in the run order.
const QUERY = "First";

const MOBILE = { width: 375, height: 812 };

/** Resolves a color token the way the browser does, `light-dark()` and all. */
function resolveColor(page: Page, property: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, property);
}

function measure(page: Page) {
  return page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>(".search-page .filter-search")!;
    const column = document.querySelector<HTMLElement>(".search-page")!;
    const style = getComputedStyle(input);
    return {
      inputWidth: Math.round(input.getBoundingClientRect().width),
      columnWidth: Math.round(column.getBoundingClientRect().width),
      borderStyle: style.borderTopStyle,
      borderWidth: style.borderTopWidth,
      borderRadius: style.borderTopLeftRadius,
      background: style.backgroundColor,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      bodyFontFamily: getComputedStyle(document.body).fontFamily,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

async function gotoResults(page: Page) {
  await page.goto(`/search?q=${QUERY}`);
  await expect(page.locator(".bean-list .bean-row").first()).toBeVisible();
}

test.describe("search page", () => {
  test("the input is themed, not left to the user agent", async ({ page }) => {
    await gotoResults(page);
    const [style, paperRaised] = await Promise.all([
      measure(page),
      resolveColor(page, "--paper-raised"),
    ]);

    expect(style.borderStyle).toBe("solid"); // was `inset`
    expect(style.borderWidth).toBe("1px"); // was 2px
    expect(style.borderRadius).not.toBe("0px");
    expect(style.background).toBe(paperRaised); // was pure white
    expect(style.fontFamily).toBe(style.bodyFontFamily); // was Arial
  });

  test("the input fills a readable column on desktop", async ({ page }) => {
    await gotoResults(page);
    const style = await measure(page);

    // The field is the page's primary control; it used to occupy 185px of a
    // 1040px content area regardless of viewport.
    expect(style.inputWidth).toBe(style.columnWidth);
    expect(style.inputWidth).toBeGreaterThan(400);

    // …and the column itself is capped, so results stay a scannable list
    // rather than a line of text the full width of a desktop window.
    expect(style.columnWidth).toBeLessThan(800);
  });

  test("the input fills the screen on a phone, at a size that will not zoom", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoResults(page);
    const style = await measure(page);

    expect(style.inputWidth).toBe(style.columnWidth);
    expect(style.inputWidth).toBeGreaterThan(300);
    // iOS Safari zooms the viewport when a focused field is under 16px, and
    // never zooms back out.
    expect(style.fontSize).toBe("16px");
    expect(style.overflow).toBeLessThanOrEqual(0);
  });

  test("result rows are separated by hairlines rather than floating", async ({ page }) => {
    await gotoResults(page);
    const [rule, hairline] = await Promise.all([
      page.evaluate(() => {
        const list = document.querySelector<HTMLElement>(".bean-list")!;
        const row = document.querySelector<HTMLElement>(".bean-list .bean-row")!;
        const rowStyle = getComputedStyle(row);
        return {
          listTop: getComputedStyle(list).borderTopWidth,
          rowBottom: rowStyle.borderBottomWidth,
          rowBottomColor: rowStyle.borderBottomColor,
          rowRadius: rowStyle.borderTopLeftRadius,
        };
      }),
      resolveColor(page, "--hairline"),
    ]);

    expect(rule.listTop).toBe("1px");
    expect(rule.rowBottom).toBe("1px");
    expect(rule.rowBottomColor).toBe(hairline);
    // Rows butt against each other, so a rounded corner would only fight the rule.
    expect(rule.rowRadius).toBe("0px");
  });

  test("a row stacks onto its own lines instead of wrapping mid-word", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoResults(page);

    const stacked = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>(".bean-list .bean-row")!;
      const title = row.querySelector<HTMLElement>(".bean-row-title")!;
      const project = row.querySelector<HTMLElement>(".muted")!;
      return {
        projectBelowTitle: project.getBoundingClientRect().top > title.getBoundingClientRect().top,
        titleFitsOneLine:
          title.getBoundingClientRect().height <
          Number.parseFloat(getComputedStyle(title).lineHeight) * 1.5,
      };
    });

    // The project name and status used to be squeezed alongside the title in
    // the same 375px row, breaking "e2e-project" across two lines as "e2e-"
    // and "project".
    expect(stacked.projectBelowTitle).toBe(true);
    expect(stacked.titleFitsOneLine).toBe(true);
  });

  test("the result count is rendered and announced", async ({ page }) => {
    await gotoResults(page);
    const count = page.locator(".search-count");

    await expect(count).toHaveAttribute("role", "status");
    await expect(count).toHaveText(/^\d+ results?$/);

    // The count is derived, not decorative.
    const rows = await page.locator(".bean-list .bean-row").count();
    await expect(count).toHaveText(`${rows} ${rows === 1 ? "result" : "results"}`);
  });

  test("a failed search is announced, not just printed", async ({ page }) => {
    await page.route("**/api/search*", (route) => route.fulfill({ status: 500, body: "boom" }));
    await page.goto(`/search?q=${QUERY}`);

    // React Query retries three times with backoff before surfacing isError.
    await expect(page.getByRole("alert")).toHaveText("Search failed.", { timeout: 15_000 });
  });
});
