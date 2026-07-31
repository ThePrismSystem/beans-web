import { describe, expect, it } from "vitest";

import { closedAncestors, indexById, isOrphaned, orphanedIds } from "./orphan.js";

import type { BeanListItem } from "@beans-frontend/shared";

function listItem(overrides: Partial<BeanListItem> & { id: string }): BeanListItem {
  return {
    slug: null,
    path: "",
    title: overrides.id,
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
    ...overrides,
  };
}

describe("isOrphaned", () => {
  it.each(["completed", "scrapped"] as const)(
    "flags an open bean whose parent is %s",
    (parentStatus) => {
      const parent = listItem({ id: "e-1", type: "epic", status: parentStatus });
      const child = listItem({ id: "t-1", parentId: "e-1", status: "in-progress" });
      expect(isOrphaned(child, indexById([parent, child]))).toBe(true);
    },
  );

  it("does not flag a bean whose parent is open", () => {
    const parent = listItem({ id: "e-1", type: "epic", status: "todo" });
    const child = listItem({ id: "t-1", parentId: "e-1" });
    expect(isOrphaned(child, indexById([parent, child]))).toBe(false);
  });

  it.each(["completed", "scrapped"] as const)(
    "does not flag a %s child, however closed its parent",
    (childStatus) => {
      const parent = listItem({ id: "e-1", type: "epic", status: "completed" });
      const child = listItem({ id: "t-1", parentId: "e-1", status: childStatus });
      expect(isOrphaned(child, indexById([parent, child]))).toBe(false);
    },
  );

  it("does not flag a bean with no parent", () => {
    const bean = listItem({ id: "t-1" });
    expect(isOrphaned(bean, indexById([bean]))).toBe(false);
  });

  it("does not flag a bean whose parent is absent from the project", () => {
    const child = listItem({ id: "t-1", parentId: "gone" });
    expect(isOrphaned(child, indexById([child]))).toBe(false);
  });
});

describe("orphanedIds", () => {
  it("collects every orphan in the set", () => {
    const beans = [
      listItem({ id: "e-1", type: "epic", status: "completed" }),
      listItem({ id: "t-1", parentId: "e-1" }),
      listItem({ id: "t-2", parentId: "e-1", status: "completed" }),
      listItem({ id: "t-3" }),
    ];
    expect([...orphanedIds(beans)]).toEqual(["t-1"]);
  });
});

describe("closedAncestors", () => {
  it("walks the whole consecutively closed chain, nearest first", () => {
    const beans = [
      listItem({ id: "m-1", type: "milestone", status: "completed" }),
      listItem({ id: "e-1", type: "epic", parentId: "m-1", status: "scrapped" }),
      listItem({ id: "t-1", parentId: "e-1" }),
    ];
    const chain = closedAncestors(beans[2]!, indexById(beans));
    expect(chain.map((b) => b.id)).toEqual(["e-1", "m-1"]);
  });

  it("stops at the first open ancestor", () => {
    const beans = [
      listItem({ id: "m-1", type: "milestone", status: "todo" }),
      listItem({ id: "e-1", type: "epic", parentId: "m-1", status: "completed" }),
      listItem({ id: "t-1", parentId: "e-1" }),
    ];
    expect(closedAncestors(beans[2]!, indexById(beans)).map((b) => b.id)).toEqual(["e-1"]);
  });

  it("returns empty when the parent is open", () => {
    const beans = [
      listItem({ id: "e-1", type: "epic", status: "todo" }),
      listItem({ id: "t-1", parentId: "e-1" }),
    ];
    expect(closedAncestors(beans[1]!, indexById(beans))).toEqual([]);
  });

  it("terminates on a parent cycle", () => {
    const beans = [
      listItem({ id: "a-1", parentId: "a-2", status: "completed" }),
      listItem({ id: "a-2", parentId: "a-1", status: "completed" }),
      listItem({ id: "t-1", parentId: "a-1" }),
    ];
    expect(closedAncestors(beans[2]!, indexById(beans)).map((b) => b.id)).toEqual(["a-1", "a-2"]);
  });
});
