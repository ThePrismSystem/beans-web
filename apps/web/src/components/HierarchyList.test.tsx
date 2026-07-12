import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HierarchyList } from "./HierarchyList.js";

import { renderWithRouter } from "../test/renderWithRouter.js";

import type { Bean } from "@beans-frontend/shared";

class StaticMediaQueryList {
  constructor(public readonly matches: boolean) {}
  addEventListener(): void {
    // no viewport changes are simulated in these tests
  }
  removeEventListener(): void {
    // no viewport changes are simulated in these tests
  }
}

function stubMobileViewport(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => new StaticMediaQueryList(matches)),
  );
}

function bean(id: string, type: Bean["type"], parentId: string | null, title: string): Bean {
  return {
    id,
    slug: null,
    path: "",
    title,
    status: "todo",
    type,
    priority: "normal",
    tags: [],
    createdAt: "",
    updatedAt: "",
    body: "",
    etag: "",
    parentId,
    blockingIds: [],
    blockedByIds: [],
  };
}

const beans: Bean[] = [
  bean("m1", "milestone", null, "Milestone One"),
  bean("m2", "milestone", null, "Empty Milestone"),
  bean("e1", "epic", "m1", "Epic One"),
  bean("t1", "task", "e1", "Task One"),
  bean("orphan", "task", null, "Orphan Task"),
];

describe("HierarchyList", () => {
  it("renders a milestone as a section header", async () => {
    renderWithRouter(<HierarchyList project="demo" beans={beans} />);

    expect(await screen.findByText("Milestone One")).toBeInTheDocument();
  });

  it("starts collapsed, showing only top-level sections", async () => {
    const user = userEvent.setup();
    renderWithRouter(<HierarchyList project="demo" beans={beans} />);

    expect(await screen.findByText("Milestone One")).toBeInTheDocument();
    expect(screen.queryByText("Epic One")).not.toBeInTheDocument();
    expect(screen.queryByText("Task One")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Milestone One" }));

    expect(screen.getByText("Epic One")).toBeInTheDocument();
    expect(screen.queryByText("Task One")).not.toBeInTheDocument();
  });

  it("renders a nested task at a greater indent than its epic", async () => {
    const user = userEvent.setup();
    renderWithRouter(<HierarchyList project="demo" beans={beans} />);

    await user.click(await screen.findByRole("button", { name: "Expand Milestone One" }));
    await user.click(screen.getByRole("button", { name: "Expand Epic One" }));

    const epicRow = (await screen.findByText("Epic One")).closest("[data-depth]");
    const taskRow = screen.getByText("Task One").closest("[data-depth]");
    expect(epicRow).not.toBeNull();
    expect(taskRow).not.toBeNull();
    const epicDepth = Number(epicRow?.getAttribute("data-depth"));
    const taskDepth = Number(taskRow?.getAttribute("data-depth"));
    expect(taskDepth).toBeGreaterThan(epicDepth);
  });

  it("hides a node's subtree when its caret is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<HierarchyList project="demo" beans={beans} />);

    await user.click(await screen.findByRole("button", { name: "Expand Milestone One" }));
    await user.click(screen.getByRole("button", { name: "Expand Epic One" }));
    expect(await screen.findByText("Task One")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse Epic One" }));

    expect(screen.queryByText("Task One")).not.toBeInTheDocument();
  });

  it("reveals a node's subtree again when its caret is clicked a second time", async () => {
    const user = userEvent.setup();
    renderWithRouter(<HierarchyList project="demo" beans={beans} />);

    await user.click(await screen.findByRole("button", { name: "Expand Milestone One" }));
    await user.click(screen.getByRole("button", { name: "Expand Epic One" }));
    await screen.findByText("Task One");
    await user.click(screen.getByRole("button", { name: "Collapse Epic One" }));
    expect(screen.queryByText("Task One")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Epic One" }));

    expect(screen.getByText("Task One")).toBeInTheDocument();
  });

  it("renders parent-less beans at the top level without a forced grouping header", async () => {
    renderWithRouter(<HierarchyList project="demo" beans={beans} />);

    expect(await screen.findByText("Orphan Task")).toBeInTheDocument();
    expect(screen.queryByText("No milestone")).not.toBeInTheDocument();
  });

  it("does not render a caret for a milestone with no children", async () => {
    renderWithRouter(<HierarchyList project="demo" beans={beans} />);

    expect(await screen.findByText("Empty Milestone")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Empty Milestone/ })).not.toBeInTheDocument();
  });

  describe("flush-left alignment when there are no sections", () => {
    const onlyTasks: Bean[] = [
      bean("t1", "task", null, "Task One"),
      bean("b1", "bug", null, "Bug One"),
    ];

    it("marks the list as flush when there are no milestones or epics", async () => {
      const { container } = renderWithRouter(<HierarchyList project="demo" beans={onlyTasks} />);

      expect(await screen.findByText("Task One")).toBeInTheDocument();
      expect(container.querySelector(".hierarchy-list")).toHaveClass("hierarchy-list--flush");
    });

    it("does not mark the list as flush when a milestone section exists", async () => {
      const { container } = renderWithRouter(<HierarchyList project="demo" beans={beans} />);

      expect(await screen.findByText("Milestone One")).toBeInTheDocument();
      expect(container.querySelector(".hierarchy-list")).not.toHaveClass("hierarchy-list--flush");
    });
  });

  describe("with a type filter", () => {
    it("keeps ancestor milestones and epics as context while hiding non-matching beans", async () => {
      const user = userEvent.setup();
      renderWithRouter(<HierarchyList project="demo" beans={beans} typeFilter={["task"]} />);

      expect(await screen.findByText("Milestone One")).toBeInTheDocument();
      expect(screen.getByText("Orphan Task")).toBeInTheDocument();
      expect(screen.queryByText("Empty Milestone")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Expand Milestone One" }));
      expect(screen.getByText("Epic One")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Expand Epic One" }));
      expect(screen.getByText("Task One")).toBeInTheDocument();
    });
  });

  describe("in grouped mobile mode", () => {
    const deepBeans: Bean[] = [
      bean("m1", "milestone", null, "Milestone One"),
      bean("e1", "epic", "m1", "Epic One"),
      bean("f1", "feature", "e1", "Feature One"),
      bean("t1", "task", "f1", "Deep Task"),
    ];

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("renders an epic as a section header with a deeply-nested task at a single indent beneath it", async () => {
      stubMobileViewport(true);
      const user = userEvent.setup();
      renderWithRouter(<HierarchyList project="demo" beans={deepBeans} />);

      const epicHeading = await screen.findByText("Epic One");
      const epicRow = epicHeading.closest("[data-depth]");
      await user.click(screen.getByRole("button", { name: "Expand Epic One" }));
      const taskRow = (await screen.findByText("Deep Task")).closest("[data-depth]");
      expect(epicRow).not.toBeNull();
      expect(taskRow).not.toBeNull();
      const epicDepth = Number(epicRow?.getAttribute("data-depth"));
      const taskDepth = Number(taskRow?.getAttribute("data-depth"));
      expect(taskDepth).toBe(epicDepth + 1);
      // The intermediate feature is flattened away, not rendered as its own header
      // (no expand/collapse control for it, unlike a real section).
      expect(screen.queryByRole("button", { name: /Feature One/ })).not.toBeInTheDocument();
    });

    it("still supports collapsing a section's caret", async () => {
      stubMobileViewport(true);
      const user = userEvent.setup();
      renderWithRouter(<HierarchyList project="demo" beans={deepBeans} />);

      await user.click(await screen.findByRole("button", { name: "Expand Epic One" }));
      await screen.findByText("Deep Task");

      await user.click(screen.getByRole("button", { name: "Collapse Epic One" }));
      expect(screen.queryByText("Deep Task")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Expand Epic One" }));
      expect(screen.getByText("Deep Task")).toBeInTheDocument();
    });

    it("renders full nesting depth when the viewport does not match the mobile query", async () => {
      stubMobileViewport(false);
      const user = userEvent.setup();
      renderWithRouter(<HierarchyList project="demo" beans={deepBeans} />);

      await user.click(await screen.findByRole("button", { name: "Expand Milestone One" }));
      await user.click(screen.getByRole("button", { name: "Expand Epic One" }));
      const featureHeading = await screen.findByText("Feature One");
      expect(featureHeading.closest("[data-depth]")?.getAttribute("data-depth")).toBe("2");

      await user.click(screen.getByRole("button", { name: "Expand Feature One" }));
      const taskRow = screen.getByText("Deep Task").closest("[data-depth]");
      expect(taskRow?.getAttribute("data-depth")).toBe("3");
    });
  });
});
