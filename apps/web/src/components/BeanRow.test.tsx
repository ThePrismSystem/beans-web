import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithRouter } from "../test/renderWithRouter.js";

import { BeanRow } from "./BeanRow.js";

import type { BeanListItem } from "@beans-frontend/shared";

const bean: BeanListItem = {
  id: "t-1",
  slug: null,
  path: "",
  title: "Fix SSE reconnect",
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

describe("BeanRow", () => {
  it("renders the title", async () => {
    renderWithRouter(<BeanRow project="demo" bean={bean} />);
    expect(await screen.findByText("Fix SSE reconnect")).toBeInTheDocument();
  });

  it("renders no orphan badge by default", async () => {
    renderWithRouter(<BeanRow project="demo" bean={bean} />);
    await screen.findByText("Fix SSE reconnect");
    expect(screen.queryByText("orphaned")).not.toBeInTheDocument();
  });

  it("renders a readable orphan badge when orphaned", async () => {
    renderWithRouter(<BeanRow project="demo" bean={bean} orphaned />);
    // Text, not a bare glyph, so a screen reader announces it.
    expect(await screen.findByText("orphaned")).toBeInTheDocument();
  });
});
