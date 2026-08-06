import { expect, test } from "@playwright/test";

import { readSeedState } from "./fixtures/seed.mjs";

import type { Request } from "@playwright/test";

const PROJECT_GRAPHQL_PATH = /^\/api\/projects\/[^/]+\/graphql$/;

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
    // The request count pins current behavior rather than guarding a fixed bug.
    // Committing with Enter unmounts the focused title input, and Chromium does
    // fire a native blur when a focused element is removed — but React never
    // routes it to that input's onBlur, because it does not dispatch synthetic
    // events to a node it is deleting. So the input's blur-commit path does not
    // run and Enter saves exactly once. That rests on a React implementation
    // detail, not a documented guarantee, so it is worth holding in place: the
    // rendered title below is identical whether the mutation fires once or
    // twice, and only a request count can tell those apart.
    let updateBeanRequests = 0;
    const countUpdateBean = (request: Request) => {
      if (request.method() !== "POST") return;
      if (!PROJECT_GRAPHQL_PATH.test(new URL(request.url()).pathname)) return;
      if (request.postData()?.includes("updateBean") === true) {
        updateBeanRequests += 1;
      }
    };
    page.on("request", countUpdateBean);

    await page.locator("button.bean-detail-title").click();
    const titleInput = page.getByLabel("Title", { exact: true });
    await titleInput.fill(editedTitle);
    await titleInput.press("Enter");
    await expect(page.locator("button.bean-detail-title")).toHaveText(editedTitle);

    // The heading only re-renders once the mutation resolved and the bean
    // refetched, so a second commit fired from the unmount would have been
    // issued — and counted — well before this point.
    page.off("request", countUpdateBean);
    expect(updateBeanRequests).toBe(1);
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
    const createDialog = page.getByRole("dialog", { name: "New bean" });
    // The feature bean should be pre-filled as parent, since a task can
    // validly nest under a feature.
    await expect(createDialog.getByTestId("create-bean-parent")).toContainText(editedTitle);
    await createDialog.getByLabel("Title (required)", { exact: true }).fill(childTitle);
    await createDialog.getByRole("button", { name: "Create bean" }).click();

    // Successful creation navigates to the new child's detail page.
    await expect(page.locator("button.bean-detail-title")).toHaveText(childTitle);
  });

  await test.step("relationships show the real parent/child relationship", async () => {
    const relations = page.getByTestId("relations");
    await expect(relations.getByText("Parent", { exact: true })).toBeVisible();
    await expect(relations.getByRole("link", { name: editedTitle })).toBeVisible();
  });

  await test.step("scrap the child bean", async () => {
    await page.getByRole("button", { name: "Scrap", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByLabel("Reason").fill("no longer needed");
    await dialog.getByRole("button", { name: "Scrap", exact: true }).click();
    await expect(page.locator(".status-label")).toHaveText("Scrapped");
  });

  await test.step("header search shows a live dropdown hit", async () => {
    const headerSearch = page.getByRole("search", { name: "Global search" });
    await headerSearch.getByLabel("Search all beans").fill(childTitle);
    // Dropdown rows are listbox options, not plain links — the input is a
    // combobox, so its results carry role="option".
    const hit = page.locator(".header-search-dropdown").getByRole("option", { name: childTitle });
    await expect(hit).toBeVisible();
    await hit.click();
    await expect(page.locator("button.bean-detail-title")).toHaveText(childTitle);
  });

  // Last, because it adds a bean to the seeded project. Two things only this
  // path reaches against the real binary: a create with no parent at all (the
  // detail page's form always pre-fills one), and a create that declares a
  // blocking edge in the same mutation rather than in a follow-up.
  await test.step("create a top-level bean with a blocking edge, from the project view", async () => {
    await page.locator("nav.sidebar").getByText(projectName).first().click();
    await page.getByRole("button", { name: "+ New bean" }).click();

    const createDialog = page.getByRole("dialog", { name: "New bean" });
    await expect(createDialog.getByTestId("create-bean-parent")).toContainText("(none)");
    await createDialog.getByLabel("Title (required)", { exact: true }).fill("Top level bean");

    await createDialog.getByRole("button", { name: "Add blocks" }).click();
    const picker = page.getByRole("dialog", { name: "Add blocks" });
    // The feature, not the child bean: the child was scrapped two steps ago and
    // the picker lists open statuses only.
    await picker.getByLabel(`Select ${editedTitle}`).check();
    await picker.getByRole("button", { name: /^Add 1/ }).click();
    await expect(createDialog.getByTestId("create-bean-blocking")).toContainText(editedTitle);

    await createDialog.getByRole("button", { name: "Create bean" }).click();

    await expect(page.locator("button.bean-detail-title")).toHaveText("Top level bean");
    const relations = page.getByTestId("relations");
    // The Parent row always renders for a type that could have one; what proves
    // the bean is top level is that it holds "(none)" rather than a link.
    await expect(relations.getByText("(none)")).toBeVisible();
    await expect(relations.getByRole("link", { name: editedTitle })).toBeVisible();
  });

  await test.step("analytics page renders", async () => {
    await page.getByRole("link", { name: "Analytics" }).click();
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(page.getByText("Total beans")).toBeVisible();
  });
});
