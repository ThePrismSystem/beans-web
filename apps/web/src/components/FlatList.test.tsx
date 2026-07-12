import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FlatList } from "./FlatList.js";

import { renderWithRouter } from "../test/renderWithRouter.js";

import type { Bean } from "@beans-frontend/shared";

function bean(id: string, title: string): Bean {
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
    body: "",
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
});
