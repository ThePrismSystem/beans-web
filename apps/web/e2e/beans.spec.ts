import { expect, test } from "@playwright/test";

import { readSeedState } from "./fixtures/seed.mjs";

// The whole scenario is one linear flow: each step depends on state produced
// by the previous one (the created child bean, the edited title, etc.), so it
// runs as a single test rather than several independent ones sharing a page.
test("core client-visible contract", async ({ page }) => {
  const { projectName, featureTitle } = readSeedState();

  await test.step("overview lists the seeded project", async () => {
    await page.goto("/");
    await expect(page.locator(".project-card", { hasText: projectName })).toBeVisible();
  });

  await test.step("open the project", async () => {
    await page.locator(".project-card", { hasText: projectName }).click();
    await expect(page.getByRole("heading", { name: projectName, exact: true })).toBeVisible();
  });

  await test.step("toggle hierarchy view", async () => {
    await expect(page.getByText(featureTitle)).toBeVisible();
    await page.getByRole("button", { name: "Flat", exact: true }).click();
    await expect(page.getByRole("button", { name: "Flat", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText(featureTitle)).toBeVisible();
    await page.getByRole("button", { name: "Hierarchy", exact: true }).click();
    await expect(page.getByRole("button", { name: "Hierarchy", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  await test.step("open the feature bean's detail page", async () => {
    await page.getByText(featureTitle).click();
    await expect(page.locator("h1.bean-detail-title")).toHaveText(featureTitle);
    // No parent/children exist yet at this point, so the panel renders empty
    // (zero-size, not "visible" in Playwright's strict sense) — just confirm
    // it's mounted here; the real, populated check comes after the child
    // bean below is created.
    await expect(page.getByTestId("linked-beans")).toBeAttached();
  });

  const editedTitle = `${featureTitle} (edited)`;
  await test.step("edit the bean's title", async () => {
    await page.locator("h1.bean-detail-title").click();
    const titleInput = page.getByLabel("Title", { exact: true });
    await titleInput.fill(editedTitle);
    await titleInput.press("Enter");
    await expect(page.locator("h1.bean-detail-title")).toHaveText(editedTitle);
  });

  const childTitle = `${editedTitle} child`;
  await test.step("create a child bean respecting hierarchy", async () => {
    await page.getByRole("button", { name: "+ New bean" }).click();
    const createForm = page.locator(".create-bean-form");
    // The feature bean should be pre-selected as parent, since a task can
    // validly nest under a feature.
    await expect(createForm.getByLabel("Parent")).toHaveValue(/.+/);
    await createForm.getByLabel("Title", { exact: true }).fill(childTitle);
    await createForm.getByRole("button", { name: "Create bean" }).click();

    // Successful creation navigates to the new child's detail page.
    await expect(page.locator("h1.bean-detail-title")).toHaveText(childTitle);
  });

  await test.step("linked beans show the real parent/child relationship", async () => {
    const linkedBeans = page.getByTestId("linked-beans");
    await expect(linkedBeans.getByText("Parent")).toBeVisible();
    await expect(linkedBeans.getByRole("link", { name: editedTitle })).toBeVisible();
  });

  await test.step("scrap the child bean", async () => {
    page.once("dialog", (dialog) => {
      void dialog.accept("no longer needed");
    });
    await page.getByRole("button", { name: "Scrap", exact: true }).click();
    await expect(page.locator(".status-label")).toHaveText("Scrapped");
  });

  await test.step("global search finds a bean", async () => {
    await page.getByRole("search", { name: "Global search" }).click();
    await expect(page).toHaveURL(/\/search$/);
    await page.getByLabel("Search beans").fill(childTitle);
    await expect(page.getByRole("link", { name: childTitle })).toBeVisible();
  });

  await test.step("analytics page renders", async () => {
    await page.getByRole("link", { name: "Analytics" }).click();
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(page.getByText("Total beans")).toBeVisible();
  });
});
