import { expect, test } from "@playwright/test";

import { readSeedState } from "./fixtures/seed.mjs";

// The whole scenario is one linear flow: each step depends on state produced
// by the previous one (the created child bean, the edited title, etc.), so it
// runs as a single test rather than several independent ones sharing a page.
test("core client-visible contract", async ({ page }) => {
  const { projectName, featureTitle } = readSeedState();

  await test.step("overview lists the seeded project", async () => {
    await page.goto("/");
    await expect(page.locator(".project-row", { hasText: projectName })).toBeVisible();
  });

  await test.step("open the project", async () => {
    await page.locator(".project-row", { hasText: projectName }).click();
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
    await expect(page.locator("button.bean-detail-title")).toHaveText(featureTitle);
    // No parent/children exist yet at this point, so the lists render empty —
    // just confirm the panel is mounted here; the real, populated check comes
    // after the child bean below is created.
    await expect(page.getByTestId("relations")).toBeAttached();
  });

  const editedTitle = `${featureTitle} (edited)`;
  await test.step("edit the bean's title", async () => {
    await page.locator("button.bean-detail-title").click();
    const titleInput = page.getByLabel("Title", { exact: true });
    await titleInput.fill(editedTitle);
    await titleInput.press("Enter");
    await expect(page.locator("button.bean-detail-title")).toHaveText(editedTitle);
  });

  await test.step("edit the body via the rendered/raw toggle", async () => {
    const newBody = "Updated body via e2e.";
    await page.getByRole("button", { name: "Edit body" }).click();
    const bodyField = page.getByLabel("Body", { exact: true });
    await bodyField.fill(newBody);
    await page.getByRole("button", { name: "Save body" }).click();
    await expect(page.locator(".bean-detail-body")).toContainText(newBody);
  });

  await test.step("edit priority through an inline-edit row", async () => {
    await page.getByRole("button", { name: "Edit Priority" }).click();
    await page.getByLabel("Priority editor").selectOption("high");
    await page.getByRole("button", { name: "Save Priority" }).click();
    await expect(page.locator(".inline-edit-row", { hasText: "Priority" })).toContainText("high");
  });

  await test.step("relationship picker modal opens and closes", async () => {
    await page.getByRole("button", { name: "Add blocks" }).click();
    const picker = page.getByRole("dialog", { name: "Add blocks" });
    await expect(picker).toBeVisible();
    await picker.getByRole("button", { name: "Close" }).click();
    await expect(picker).toBeHidden();
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
    await expect(page.locator("button.bean-detail-title")).toHaveText(childTitle);
  });

  await test.step("relationships show the real parent/child relationship", async () => {
    const relations = page.getByTestId("relations");
    await expect(relations.getByText("Parent", { exact: true })).toBeVisible();
    await expect(relations.getByRole("link", { name: editedTitle })).toBeVisible();
  });

  await test.step("scrap the child bean", async () => {
    page.once("dialog", (dialog) => {
      void dialog.accept("no longer needed");
    });
    await page.getByRole("button", { name: "Scrap", exact: true }).click();
    await expect(page.locator(".status-label")).toHaveText("Scrapped");
  });

  await test.step("header search shows a live dropdown hit", async () => {
    const headerSearch = page.getByRole("search", { name: "Global search" });
    await headerSearch.getByLabel("Search all beans").fill(childTitle);
    const hit = page.locator(".header-search-dropdown").getByRole("link", { name: childTitle });
    await expect(hit).toBeVisible();
    await hit.click();
    await expect(page.locator("button.bean-detail-title")).toHaveText(childTitle);
  });

  await test.step("analytics page renders", async () => {
    await page.getByRole("link", { name: "Analytics" }).click();
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(page.getByText("Total beans")).toBeVisible();
  });
});
