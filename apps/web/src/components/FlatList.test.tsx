import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithRouter } from "../test/renderWithRouter.js";

import { FlatList } from "./FlatList.js";

import type { BeanListItem } from "@beans-web/shared";

function bean(id: string, title: string): BeanListItem {
  return {
    id,
    slug: null,
    path: "",
    title,
    status: "todo",
    type: "task",
    priority: "normal",
    tags: [],
    createdAt: "",
    updatedAt: "",
    etag: "",
    parentId: null,
    blockingIds: [],
    blockedByIds: [],
  };
}

describe("FlatList", () => {
  it("renders a row for every bean", async () => {
    renderWithRouter(
      <FlatList project="demo" beans={[bean("t1", "Task One"), bean("t2", "Task Two")]} />,
    );

    expect(await screen.findByText("Task One")).toBeInTheDocument();
    expect(screen.getByText("Task Two")).toBeInTheDocument();
  });

  it("shows an empty state when there are no beans", async () => {
    renderWithRouter(<FlatList project="demo" beans={[]} />);

    expect(await screen.findByText("No beans match the current filters.")).toBeInTheDocument();
  });

  it("badges only the beans in the orphaned set", async () => {
    const beans = [bean("t-1", "Orphan One"), bean("t-2", "Normal Two")];
    renderWithRouter(<FlatList project="demo" beans={beans} orphaned={new Set(["t-1"])} />);

    await screen.findByText("Orphan One");
    expect(screen.getAllByText("orphaned")).toHaveLength(1);
  });
});
