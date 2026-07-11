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
  it("renders a milestone as a section header", async () => {
    renderWithRouter(<HierarchyList project="demo" beans={beans} />);

    expect(await screen.findByRole("heading", { name: /Milestone One/ })).toBeInTheDocument();
  });

  it("renders a nested task at a greater indent than its epic", async () => {
    renderWithRouter(<HierarchyList project="demo" beans={beans} />);

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

    expect(await screen.findByText("Task One")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse Epic One" }));

    expect(screen.queryByText("Task One")).not.toBeInTheDocument();
  });

  it("reveals a node's subtree again when its caret is clicked a second time", async () => {
    const user = userEvent.setup();
    renderWithRouter(<HierarchyList project="demo" beans={beans} />);

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
});
