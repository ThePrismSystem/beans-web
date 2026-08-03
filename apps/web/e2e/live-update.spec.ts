import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { readSeedState } from "./fixtures/seed.mjs";

test("a bean created on disk appears without a reload", async ({ page }) => {
  const { projectName, projectDir } = readSeedState();
  await page.goto("/");
  await page.locator(".project-row", { hasText: projectName }).click();
  await expect(page.getByRole("heading", { name: projectName, exact: true })).toBeVisible();

  const title = `Live update ${String(Date.now())}`;
  execFileSync("beans", ["create", title, "-t", "task"], { cwd: projectDir });

  // No page.reload(): the chokidar watcher -> SSE -> refetch path must surface it.
  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
});
