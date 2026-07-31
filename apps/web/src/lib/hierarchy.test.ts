import { describe, expect, it } from "vitest";

import { buildTree, pruneTreeToMatches, withAncestors } from "./hierarchy.js";

import type { BeanListItem, BeanStatus } from "@beans-frontend/shared";

const bean = (
  id: string,
  type: BeanListItem["type"],
  parentId: string | null,
  status: BeanStatus = "todo",
): BeanListItem => ({
  id,
  slug: null,
  path: "",
  title: id,
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
});

describe("buildTree ordering", () => {
  it("orders children by the default comparator, not by title", () => {
    const beans = [
      bean("m-1", "milestone", null),
      // Alphabetically "a-task" sorts first; by type, the epic wins.
      { ...bean("t-1", "task", "m-1"), title: "a-task" },
      { ...bean("e-1", "epic", "m-1"), title: "z-epic" },
    ];
    const { milestones } = buildTree(beans);
    expect(milestones[0]!.children.map((c) => c.bean.id)).toEqual(["e-1", "t-1"]);
  });

  it("does not mutate the input array", () => {
    const beans = [
      bean("m-1", "milestone", null),
      bean("t-2", "task", "m-1"),
      bean("t-1", "task", "m-1"),
    ];
    const before = beans.map((b) => b.id);
    buildTree(beans);
    expect(beans.map((b) => b.id)).toEqual(before);
  });
});

describe("buildTree orphan counts", () => {
  const beans = [
    bean("m-1", "milestone", null, "completed"),
    bean("e-1", "epic", "m-1", "completed"),
    bean("t-1", "task", "e-1"),
    bean("t-2", "task", "e-1"),
    bean("t-3", "task", "m-1"),
  ];
  const orphaned = new Set(["t-1", "t-2", "t-3", "e-1"]);

  it("counts orphaned descendants recursively, excluding the node itself", () => {
    const { milestones } = buildTree(beans, orphaned);
    const milestone = milestones[0]!;
    // e-1 (orphaned) + t-1 + t-2 + t-3 = 4 beneath m-1; m-1 itself is not counted.
    expect(milestone.orphanedDescendants).toBe(4);
    const epic = milestone.children.find((c) => c.bean.id === "e-1")!;
    expect(epic.orphanedDescendants).toBe(2);
  });

  it("counts zero when no orphan set is supplied", () => {
    expect(buildTree(beans).milestones[0]!.orphanedDescendants).toBe(0);
  });

  it("recounts after pruning so the count matches what is rendered", () => {
    const { milestones } = buildTree(beans, orphaned);
    const pruned = pruneTreeToMatches(milestones, (b) => b.id !== "t-2", orphaned);
    const epic = pruned[0]!.children.find((c) => c.bean.id === "e-1")!;
    expect(epic.orphanedDescendants).toBe(1);
  });
});

describe("withAncestors", () => {
  it("keeps ancestors of every listed bean", () => {
    const all = [
      bean("m-1", "milestone", null),
      bean("e-1", "epic", "m-1"),
      bean("t-1", "task", "e-1"),
    ];
    const kept = withAncestors([all[2]!], all);
    expect(kept.map((b) => b.id).sort()).toEqual(["e-1", "m-1", "t-1"]);
  });
});
