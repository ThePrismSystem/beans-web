import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderWithRouter } from "../test/renderWithRouter.js";

import { HierarchyList } from "./HierarchyList.js";

import type { BeanListItem, BeanStatus } from "@beans-frontend/shared";

function bean(
  id: string,
  type: BeanListItem["type"],
  parentId: string | null,
  title: string,
  status: BeanStatus = "todo",
): BeanListItem {
  return {
    id,
    slug: null,
    path: "",
    title,
    status,
    type,
    priority: "normal",
    tags: [],
    createdAt: "",
    updatedAt: "",
    etag: "",
    parentId,
    blockingIds: [],
    blockedByIds: [],
  };
}

const allIds = (list: BeanListItem[]) => new Set(list.map((b) => b.id));

const beans: BeanListItem[] = [
  bean("m1", "milestone", null, "Milestone One"),
  bean("m2", "milestone", null, "Empty Milestone"),
  bean("e1", "epic", "m1", "Epic One"),
  bean("t1", "task", "e1", "Task One"),
  bean("orphan", "task", null, "Orphan Task"),
];

describe("HierarchyList", () => {
  it("renders a milestone as a top-level row", async () => {
    renderWithRouter(
      <HierarchyList project="demo" beans={beans} orphaned={new Set()} knownIds={allIds(beans)} />,
    );

    expect(await screen.findByText("Milestone One")).toBeInTheDocument();
  });

  it("starts collapsed, showing only top-level nodes", async () => {
    renderWithRouter(
      <HierarchyList project="demo" beans={beans} orphaned={new Set()} knownIds={allIds(beans)} />,
    );

    expect(await screen.findByText("Milestone One")).toBeInTheDocument();
    expect(screen.queryByText("Epic One")).not.toBeInTheDocument();
    expect(screen.queryByText("Task One")).not.toBeInTheDocument();
  });

  it("renders a nested task at a greater indent than its epic", async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <HierarchyList project="demo" beans={beans} orphaned={new Set()} knownIds={allIds(beans)} />,
    );

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
    renderWithRouter(
      <HierarchyList project="demo" beans={beans} orphaned={new Set()} knownIds={allIds(beans)} />,
    );

    expect(await screen.findByText("Empty Milestone")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Empty Milestone/ })).not.toBeInTheDocument();
  });

  it("renders parent-less beans at the top level without a forced grouping header", async () => {
    renderWithRouter(
      <HierarchyList project="demo" beans={beans} orphaned={new Set()} knownIds={allIds(beans)} />,
    );

    expect(await screen.findByText("Orphan Task")).toBeInTheDocument();
    expect(screen.queryByText("No milestone")).not.toBeInTheDocument();
  });

  describe("with a type filter", () => {
    it("keeps ancestor milestones and epics as context while hiding non-matching beans", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <HierarchyList
          project="demo"
          beans={beans}
          orphaned={new Set()}
          knownIds={allIds(beans)}
          typeFilter={["task"]}
        />,
      );

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
    const chain: BeanListItem[] = [
      bean("m1", "milestone", null, "Milestone One"),
      bean("e1", "epic", "m1", "Epic One"),
      bean("t1", "task", "e1", "Task One"),
    ];

    it("hides the nested epic and task while the milestone is collapsed", async () => {
      renderWithRouter(
        <HierarchyList
          project="demo"
          beans={chain}
          orphaned={new Set()}
          knownIds={allIds(chain)}
        />,
      );

      expect(await screen.findByText("Milestone One")).toBeInTheDocument();
      expect(screen.queryByText("Epic One")).not.toBeInTheDocument();
      expect(screen.queryByText("Task One")).not.toBeInTheDocument();
    });

    it("reveals the nested epic (but not the task) when the milestone expands", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <HierarchyList
          project="demo"
          beans={chain}
          orphaned={new Set()}
          knownIds={allIds(chain)}
        />,
      );

      await user.click(await screen.findByRole("button", { name: "Expand Milestone One" }));

      expect(screen.getByText("Epic One")).toBeInTheDocument();
      expect(screen.queryByText("Task One")).not.toBeInTheDocument();
    });

    it("hides the epic again (and its task) when the milestone is re-collapsed", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <HierarchyList
          project="demo"
          beans={chain}
          orphaned={new Set()}
          knownIds={allIds(chain)}
        />,
      );

      await user.click(await screen.findByRole("button", { name: "Expand Milestone One" }));
      await user.click(await screen.findByRole("button", { name: "Expand Epic One" }));
      expect(await screen.findByText("Task One")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Collapse Milestone One" }));

      expect(screen.queryByText("Epic One")).not.toBeInTheDocument();
      expect(screen.queryByText("Task One")).not.toBeInTheDocument();
    });
  });

  describe("with sort", () => {
    // Top-level beans deliberately out of alphabetical order, plus a parent
    // whose children are also out of alphabetical order, so a title-sort
    // that leaked into `renderNode`'s children would be caught here too.
    const unsorted: BeanListItem[] = [
      bean("cherry", "task", null, "Cherry"),
      bean("apple", "task", null, "Apple"),
      bean("parent", "epic", null, "Parent"),
      bean("child-z", "task", "parent", "Zebra Child"),
      bean("child-a", "task", "parent", "Apple Child"),
      bean("banana", "task", null, "Banana"),
    ];

    it("sorts top-level rows by the given key and direction", async () => {
      renderWithRouter(
        <HierarchyList
          project="demo"
          beans={unsorted}
          orphaned={new Set()}
          knownIds={allIds(unsorted)}
          sort="title"
          dir="asc"
        />,
      );

      await screen.findByText("Apple");
      const rows = document.querySelectorAll(".hierarchy-roots > .hierarchy-node");
      const topLevelTitles = [...rows].map(
        (row) => row.querySelector(".bean-row-title")?.textContent,
      );
      expect(topLevelTitles).toEqual(["Apple", "Banana", "Cherry", "Parent"]);
    });

    it("leaves a parent's children in their original tree order when top-level is sorted", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <HierarchyList
          project="demo"
          beans={unsorted}
          orphaned={new Set()}
          knownIds={allIds(unsorted)}
          sort="title"
          dir="desc"
        />,
      );

      await user.click(await screen.findByRole("button", { name: "Expand Parent" }));

      const childRows = document.querySelectorAll(".hierarchy-children > .hierarchy-node");
      const childTitles = [...childRows].map(
        (row) => row.querySelector(".bean-row-title")?.textContent,
      );
      // buildTree always sorts children by the default comparator regardless
      // of the top-level sort, so this stays in that order even though the
      // top-level sort direction above is "desc".
      expect(childTitles).toEqual(["Apple Child", "Zebra Child"]);
    });

    it("renders top-level rows in tree order when no sort is given", async () => {
      renderWithRouter(
        <HierarchyList
          project="demo"
          beans={unsorted}
          orphaned={new Set()}
          knownIds={allIds(unsorted)}
        />,
      );

      await screen.findByText("Cherry");
      const rows = document.querySelectorAll(".hierarchy-roots > .hierarchy-node");
      const topLevelTitles = [...rows].map(
        (row) => row.querySelector(".bean-row-title")?.textContent,
      );
      expect(topLevelTitles).toEqual(["Cherry", "Apple", "Parent", "Banana"]);
    });
  });

  describe("flush top-level rows (#9)", () => {
    it("renders no carets, and no reserved caret column, when every top-level bean is childless", async () => {
      const onlyTasks: BeanListItem[] = [
        bean("t1", "task", null, "Task One"),
        bean("b1", "bug", null, "Bug One"),
      ];
      const { container } = renderWithRouter(
        <HierarchyList
          project="demo"
          beans={onlyTasks}
          orphaned={new Set()}
          knownIds={allIds(onlyTasks)}
        />,
      );

      expect(await screen.findByText("Task One")).toBeInTheDocument();
      expect(screen.getByText("Bug One")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Expand|Collapse/ })).not.toBeInTheDocument();
      expect(container.querySelector(".hierarchy-caret-spacer")).not.toBeInTheDocument();
    });

    it("renders a caret for a parent bean but not for its childless siblings", async () => {
      renderWithRouter(
        <HierarchyList
          project="demo"
          beans={beans}
          orphaned={new Set()}
          knownIds={allIds(beans)}
        />,
      );

      expect(
        await screen.findByRole("button", { name: "Expand Milestone One" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Empty Milestone/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Orphan Task/ })).not.toBeInTheDocument();
    });
  });
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("HierarchyList expand state", () => {
  const expandBeans = [
    bean("m-1", "milestone", null, "Milestone One"),
    bean("e-1", "epic", "m-1", "Epic One"),
    bean("t-1", "task", "e-1", "Task One"),
  ];

  it("survives a refetch that produces a new array of identical beans", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithRouter(
      <HierarchyList
        project="demo"
        beans={expandBeans}
        orphaned={new Set()}
        knownIds={allIds(expandBeans)}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Expand Milestone One" }));
    expect(await screen.findByText("Epic One")).toBeInTheDocument();

    // What an SSE-triggered refetch produces: same contents, new identities.
    const refetched = expandBeans.map((b) => ({ ...b }));
    rerender(
      <HierarchyList
        project="demo"
        beans={refetched}
        orphaned={new Set()}
        knownIds={allIds(refetched)}
      />,
    );

    expect(screen.getByText("Epic One")).toBeInTheDocument();
  });

  it("restores expand state from storage on a fresh mount", async () => {
    window.localStorage.setItem("beans:expanded:demo", JSON.stringify(["m-1"]));

    renderWithRouter(
      <HierarchyList
        project="demo"
        beans={expandBeans}
        orphaned={new Set()}
        knownIds={allIds(expandBeans)}
      />,
    );

    expect(await screen.findByText("Epic One")).toBeInTheDocument();
  });

  it("seeds a newly appeared node collapsed", async () => {
    renderWithRouter(
      <HierarchyList
        project="demo"
        beans={expandBeans}
        orphaned={new Set()}
        knownIds={allIds(expandBeans)}
      />,
    );

    expect(await screen.findByText("Milestone One")).toBeInTheDocument();
    expect(screen.queryByText("Epic One")).not.toBeInTheDocument();
  });

  it("prunes ids that no longer exist in the project when writing", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("beans:expanded:demo", JSON.stringify(["gone-1"]));

    renderWithRouter(
      <HierarchyList
        project="demo"
        beans={expandBeans}
        orphaned={new Set()}
        knownIds={allIds(expandBeans)}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Expand Milestone One" }));

    const stored: unknown = JSON.parse(window.localStorage.getItem("beans:expanded:demo") ?? "[]");
    expect(stored).toEqual(["m-1"]);
  });
});

describe("HierarchyList orphan display", () => {
  const orphanBeans = [
    bean("m-1", "milestone", null, "Docker setup", "completed"),
    bean("t-1", "task", "m-1", "Fix SSE reconnect"),
    bean("t-2", "task", "m-1", "Pin CI actions"),
  ];

  it("shows a recursive orphan count on the collapsed ancestor", async () => {
    renderWithRouter(
      <HierarchyList
        project="demo"
        beans={orphanBeans}
        orphaned={new Set(["t-1", "t-2"])}
        knownIds={allIds(orphanBeans)}
      />,
    );

    expect(await screen.findByText("⚠ 2 orphaned")).toBeInTheDocument();
  });

  it("badges the orphans themselves once expanded", async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <HierarchyList
        project="demo"
        beans={orphanBeans}
        orphaned={new Set(["t-1", "t-2"])}
        knownIds={allIds(orphanBeans)}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Expand Docker setup" }));
    expect(screen.getAllByText("orphaned")).toHaveLength(2);
  });

  it("shows no count when nothing beneath is orphaned", async () => {
    renderWithRouter(
      <HierarchyList
        project="demo"
        beans={orphanBeans}
        orphaned={new Set()}
        knownIds={allIds(orphanBeans)}
      />,
    );

    await screen.findByText("Docker setup");
    expect(screen.queryByText(/orphaned/)).not.toBeInTheDocument();
  });
});
