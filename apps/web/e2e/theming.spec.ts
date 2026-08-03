import { expect, test } from "@playwright/test";

import type { Browser } from "@playwright/test";

/**
 * Chart marks used to be hard-coded hexes chosen against the light palette, so
 * dark mode drew near-invisible bars under grid lines brighter than the data.
 * Color now comes from `light-dark()` tokens applied via CSS, which the SVG
 * `fill` presentation attribute could never carry. These read the resolved
 * paint back out of the DOM, because a rule that silently stopped matching
 * would be invisible to every other check in the suite.
 */

// The "Beans per project" bars and the axis/grid furniture are the marks that
// render for any non-empty dataset, so they are what the fixture can rely on.
const BAR = "path.chart-bar-total";
const GRID = ".recharts-cartesian-grid line";
const TICK = ".recharts-cartesian-axis-tick-value";

async function readChartPaint(browser: Browser, colorScheme: "light" | "dark") {
  const context = await browser.newContext({ colorScheme });
  const page = await context.newPage();
  try {
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(page.locator(BAR).first()).toBeAttached();
    await expect(page.locator(GRID).first()).toBeAttached();
    await expect(page.locator(TICK).first()).toBeAttached();

    return await page.evaluate(
      ([bar, grid, tick]) => {
        const paint = (selector: string, property: string) => {
          const node = document.querySelector(selector);
          return node ? getComputedStyle(node).getPropertyValue(property) : null;
        };
        const surface = document.querySelector(".chart-section");
        return {
          bar: paint(bar, "fill"),
          grid: paint(grid, "stroke"),
          tick: paint(tick, "fill"),
          surface: surface ? getComputedStyle(surface).backgroundColor : null,
        };
      },
      [BAR, GRID, TICK] as const,
    );
  } finally {
    await context.close();
  }
}

/** WCAG 2.1 relative luminance of an `rgb(r, g, b)` string. */
function luminance(color: string): number {
  const channels = color.match(/\d+(\.\d+)?/g);
  if (!channels) {
    throw new Error(`could not parse color channels from "${color}"`);
  }
  const [r, g, b] = channels.slice(0, 3).map(Number) as [number, number, number];
  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

test("chart marks resolve to real colors in both schemes, and differ between them", async ({
  browser,
}) => {
  const light = await readChartPaint(browser, "light");
  const dark = await readChartPaint(browser, "dark");

  // An unresolved var() leaves the paint at its initial value, never an rgb triple.
  for (const scheme of [light, dark]) {
    expect(scheme.bar).toMatch(/^rgb\(/);
    expect(scheme.grid).toMatch(/^rgb\(/);
    expect(scheme.tick).toMatch(/^rgb\(/);
  }

  // A rule that stopped matching would leave recharts' own light-mode defaults
  // in place, which look identical under both schemes.
  expect(dark.bar).not.toBe(light.bar);
  expect(dark.grid).not.toBe(light.grid);
  expect(dark.tick).not.toBe(light.tick);
});

/**
 * The status and type charts color each bar by looking its row up with
 * `props.index` inside a custom `shape`. That mapping is recharts' contract,
 * not ours — if `index` ever stopped meaning "position in `data`", every bar
 * would still render, just wearing the wrong status's color. Two unit tests
 * covered it; nothing checked it in a real browser, and the other chart specs
 * probe "Beans per project", which does not use a custom shape at all.
 */
test("each status bar carries its own row's fill class, in data order", async ({ page }) => {
  // Mirrors STATUS_LABEL, so the accessible table's row headers can be mapped
  // back to the slug the fill class is built from.
  const slugForLabel: Record<string, string> = {
    Draft: "draft",
    "To do": "todo",
    "In progress": "in-progress",
    Completed: "completed",
    Scrapped: "scrapped",
  };

  await page.goto("/analytics");
  const section = page.locator(".chart-section").filter({ hasText: "Beans by status" });
  await expect(section.getByRole("heading", { name: "Beans by status" })).toBeVisible();
  await expect(section.locator(".recharts-bar-rectangle path").first()).toBeAttached();

  // The chart's own table is the data the bars are drawn from, in the same
  // order. Deriving the expectation from it rather than hard-coding the
  // fixture's contents keeps this honest if the seed data changes.
  const rows = await section.locator("tbody tr").evaluateAll((trs) =>
    trs.map((tr) => ({
      label: tr.querySelector("th")?.textContent.trim() ?? "",
      count: Number(tr.querySelector("td")?.textContent.trim() ?? "0"),
    })),
  );
  const expected = rows
    .filter((row) => row.count > 0)
    .map((row) => `chart-fill-${slugForLabel[row.label] ?? row.label}`);
  expect(expected.length).toBeGreaterThan(0);

  const classes = await section
    .locator(".recharts-bar-rectangle path")
    .evaluateAll((nodes) =>
      nodes.map((node) => [...node.classList].find((c) => c.startsWith("chart-fill-")) ?? null),
    );

  // recharts draws nothing for a zero count, so the bars that exist are the
  // non-zero rows. If `props.index` ever meant "position among rendered bars"
  // instead of "position in `data`", these would come back as the first N
  // statuses rather than the right ones — which is the whole failure mode.
  expect(classes).toEqual(expected);
});

test("chart text and bars clear their WCAG minimums in both schemes", async ({ browser }) => {
  for (const scheme of ["light", "dark"] as const) {
    const paint = await readChartPaint(browser, scheme);
    if (paint.tick === null || paint.bar === null || paint.surface === null) {
      throw new Error(`${scheme}: chart paint did not resolve to real colors`);
    }

    // Axis labels are text: 4.5:1 (1.4.3). They previously sat at 3.40:1 in
    // light and 4.00:1 in dark, and recharts' untouched default is worse.
    expect(contrast(paint.tick, paint.surface), `${scheme} axis tick`).toBeGreaterThanOrEqual(4.5);

    // A bar carries meaning on its own: 3:1 non-text minimum (1.4.11).
    expect(contrast(paint.bar, paint.surface), `${scheme} bar fill`).toBeGreaterThanOrEqual(3);
  }
});
