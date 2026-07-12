import { describe, expect, it } from "vitest";

import { sortBeans } from "./sort.js";

import type { Bean } from "@beans-frontend/shared";

const bean = (overrides: Partial<Bean> & Pick<Bean, "id" | "title">): Bean => ({
  slug: null,
  path: "",
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
  ...overrides,
});

describe("sortBeans", () => {
  it("sorts by title ascending using localeCompare order", () => {
    const beans = [bean({ id: "1", title: "Banana" }), bean({ id: "2", title: "Apple" })];

    expect(sortBeans(beans, "title", "asc").map((b) => b.title)).toEqual(["Apple", "Banana"]);
  });

  it("sorts by title descending", () => {
    const beans = [bean({ id: "1", title: "Apple" }), bean({ id: "2", title: "Banana" })];

    expect(sortBeans(beans, "title", "desc").map((b) => b.title)).toEqual(["Banana", "Apple"]);
  });

  it("sorts by type using BEAN_TYPES canonical order, not alphabetical", () => {
    const beans = [
      bean({ id: "1", title: "Bug", type: "bug" }),
      bean({ id: "2", title: "Milestone", type: "milestone" }),
      bean({ id: "3", title: "Task", type: "task" }),
      bean({ id: "4", title: "Epic", type: "epic" }),
      bean({ id: "5", title: "Feature", type: "feature" }),
    ];

    expect(sortBeans(beans, "type", "asc").map((b) => b.type)).toEqual([
      "milestone",
      "epic",
      "feature",
      "task",
      "bug",
    ]);
  });

  it("sorts by type descending", () => {
    const beans = [
      bean({ id: "1", title: "Bug", type: "bug" }),
      bean({ id: "2", title: "Milestone", type: "milestone" }),
    ];

    expect(sortBeans(beans, "type", "desc").map((b) => b.type)).toEqual(["bug", "milestone"]);
  });

  it("sorts by status using BEAN_STATUSES canonical order", () => {
    const beans = [
      bean({ id: "1", title: "Completed", status: "completed" }),
      bean({ id: "2", title: "Draft", status: "draft" }),
      bean({ id: "3", title: "InProgress", status: "in-progress" }),
      bean({ id: "4", title: "Todo", status: "todo" }),
      bean({ id: "5", title: "Scrapped", status: "scrapped" }),
    ];

    expect(sortBeans(beans, "status", "asc").map((b) => b.status)).toEqual([
      "draft",
      "todo",
      "in-progress",
      "completed",
      "scrapped",
    ]);
  });

  it("sorts by status descending", () => {
    const beans = [
      bean({ id: "1", title: "Draft", status: "draft" }),
      bean({ id: "2", title: "Todo", status: "todo" }),
    ];

    expect(sortBeans(beans, "status", "desc").map((b) => b.status)).toEqual(["todo", "draft"]);
  });

  it("does not mutate the input array", () => {
    const beans = [bean({ id: "1", title: "Banana" }), bean({ id: "2", title: "Apple" })];
    const original = [...beans];

    sortBeans(beans, "title", "asc");

    expect(beans).toEqual(original);
  });

  it("returns a new array, not the same reference", () => {
    const beans = [bean({ id: "1", title: "Apple" })];

    expect(sortBeans(beans, "title", "asc")).not.toBe(beans);
  });
});
