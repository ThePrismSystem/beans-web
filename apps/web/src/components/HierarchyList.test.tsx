import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { HierarchyList } from "./HierarchyList.js";

import { renderWithRouter } from "../test/renderWithRouter.js";

import type { Bean } from "@beans-frontend/shared";

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
  it("renders a milestone as a top-level row", async () => {
    renderWithRouter(<HierarchyList project="demo" beans={beans} />);

    expect(await screen.findByText("Milestone One")).toBeInTheDocument();
  });

  it("starts collapsed, showing only top-level nodes", async () => {
    renderWithRouter(<HierarchyList project="demo" beans={beans} />);

    expect(await screen.findByText("Milestone One")).toBeInTheDocument();
    expect(screen.queryByText("Epic One")).not.toBeInTheDocument();
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

  it("does not render a caret for a milestone with no children", async () => {
    renderWithRouter(<HierarchyList project="demo" beans={beans} />);

    expect(await screen.findByText("Empty Milestone")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Empty Milestone/ })).not.toBeInTheDocument();
  });

  it("renders parent-less beans at the top level without a forced grouping header", async () => {
    renderWithRouter(<HierarchyList project="demo" beans={beans} />);

    expect(await screen.findByText("Orphan Task")).toBeInTheDocument();
    expect(screen.queryByText("No milestone")).not.toBeInTheDocument();
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

  describe("subtree encapsulation (#2)", () => {
    // A milestone -> epic -> task chain. Collapsing the milestone must hide
    // its entire subtree, including the nested epic, not just the task.
    const chain: Bean[] = [
      bean("m1", "milestone", null, "Milestone One"),
      bean("e1", "epic", "m1", "Epic One"),
      bean("t1", "task", "e1", "Task One"),
    ];

    it("hides the nested epic and task while the milestone is collapsed", async () => {
      renderWithRouter(<HierarchyList project="demo" beans={chain} />);

      expect(await screen.findByText("Milestone One")).toBeInTheDocument();
      expect(screen.queryByText("Epic One")).not.toBeInTheDocument();
      expect(screen.queryByText("Task One")).not.toBeInTheDocument();
    });

    it("reveals the nested epic (but not the task) when the milestone expands", async () => {
      const user = userEvent.setup();
      renderWithRouter(<HierarchyList project="demo" beans={chain} />);

      await user.click(await screen.findByRole("button", { name: "Expand Milestone One" }));

      expect(screen.getByText("Epic One")).toBeInTheDocument();
      expect(screen.queryByText("Task One")).not.toBeInTheDocument();
    });

    it("hides the epic again (and its task) when the milestone is re-collapsed", async () => {
      const user = userEvent.setup();
      renderWithRouter(<HierarchyList project="demo" beans={chain} />);

      await user.click(await screen.findByRole("button", { name: "Expand Milestone One" }));
      await user.click(await screen.findByRole("button", { name: "Expand Epic One" }));
      expect(await screen.findByText("Task One")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Collapse Milestone One" }));

      expect(screen.queryByText("Epic One")).not.toBeInTheDocument();
      expect(screen.queryByText("Task One")).not.toBeInTheDocument();
    });
  });

  describe("flush top-level rows (#9)", () => {
    it("renders no carets, and no reserved caret column, when every top-level bean is childless", async () => {
      const onlyTasks: Bean[] = [
        bean("t1", "task", null, "Task One"),
        bean("b1", "bug", null, "Bug One"),
      ];
      const { container } = renderWithRouter(<HierarchyList project="demo" beans={onlyTasks} />);

      expect(await screen.findByText("Task One")).toBeInTheDocument();
      expect(screen.getByText("Bug One")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Expand|Collapse/ })).not.toBeInTheDocument();
      expect(container.querySelector(".hierarchy-caret-spacer")).not.toBeInTheDocument();
    });

    it("renders a caret for a parent bean but not for its childless siblings", async () => {
      renderWithRouter(<HierarchyList project="demo" beans={beans} />);

      expect(
        await screen.findByRole("button", { name: "Expand Milestone One" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Empty Milestone/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Orphan Task/ })).not.toBeInTheDocument();
    });
  });
});
