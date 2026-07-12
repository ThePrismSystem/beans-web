import { describe, expect, it } from "vitest";

import { buildTree, pruneTreeToMatches } from "./hierarchy.js";

import type { Bean } from "@beans-frontend/shared";

const bean = (id: string, type: Bean["type"], parentId: string | null): Bean => ({
  id,
  slug: null,
  path: "",
  title: id,
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
});

describe("buildTree", () => {
  it("nests children under parents and separates milestones from roots", () => {
    const beans = [
      bean("m1", "milestone", null),
      bean("e1", "epic", "m1"),
      bean("t1", "task", "e1"),
      bean("orphan", "task", null),
    ];
    const { milestones, roots } = buildTree(beans);
    expect(milestones).toHaveLength(1);
    expect(milestones[0]!.children[0]!.bean.id).toBe("e1");
    expect(milestones[0]!.children[0]!.children[0]!.bean.id).toBe("t1");
    expect(milestones[0]!.children[0]!.children[0]!.depth).toBe(2);
    expect(roots.map((r) => r.bean.id)).toEqual(["orphan"]);
  });
});

describe("pruneTreeToMatches", () => {
  it("keeps ancestor milestones and epics that contain a matching task", () => {
    const beans = [
      bean("m1", "milestone", null),
      bean("e1", "epic", "m1"),
      bean("t1", "task", "e1"),
      bean("f1", "feature", "e1"),
    ];
    const { milestones } = buildTree(beans);

    const pruned = pruneTreeToMatches(milestones, (b) => b.type === "task");

    expect(pruned).toHaveLength(1);
    expect(pruned[0]!.bean.id).toBe("m1");
    expect(pruned[0]!.children).toHaveLength(1);
    expect(pruned[0]!.children[0]!.bean.id).toBe("e1");
    expect(pruned[0]!.children[0]!.children).toHaveLength(1);
    expect(pruned[0]!.children[0]!.children[0]!.bean.id).toBe("t1");
  });

  it("drops branches with no matching descendant", () => {
    const beans = [
      bean("m1", "milestone", null),
      bean("m2", "milestone", null),
      bean("e1", "epic", "m2"),
      bean("t1", "task", "e1"),
    ];
    const { milestones } = buildTree(beans);

    const pruned = pruneTreeToMatches(milestones, (b) => b.type === "task");

    expect(pruned.map((n) => n.bean.id)).toEqual(["m2"]);
  });

  it("keeps a matching leaf itself even without matching descendants", () => {
    const beans = [bean("m1", "milestone", null), bean("e1", "epic", "m1")];
    const { milestones } = buildTree(beans);

    const pruned = pruneTreeToMatches(milestones, (b) => b.type === "epic");

    expect(pruned[0]!.children.map((n) => n.bean.id)).toEqual(["e1"]);
  });

  it("returns an empty array when nothing matches", () => {
    const beans = [bean("m1", "milestone", null), bean("e1", "epic", "m1")];
    const { milestones } = buildTree(beans);

    const pruned = pruneTreeToMatches(milestones, (b) => b.type === "bug");

    expect(pruned).toEqual([]);
  });
});
