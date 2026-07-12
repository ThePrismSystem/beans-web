import { describe, expect, it } from "vitest";

import {
  buildTree,
  collectCollapsibleIds,
  pruneTreeToMatches,
  withAncestors,
} from "./hierarchy.js";

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

describe("withAncestors", () => {
  it("preserves the full ancestor chain for a matched bean", () => {
    const all = [
      bean("m1", "milestone", null),
      bean("e1", "epic", "m1"),
      bean("t1", "task", "e1"),
      bean("other", "task", null),
    ];
    const result = withAncestors([all[2]!], all);
    expect(result.map((b) => b.id).sort()).toEqual(["e1", "m1", "t1"]);
  });

  it("dedupes a shared ancestor across multiple matches", () => {
    const all = [
      bean("m1", "milestone", null),
      bean("e1", "epic", "m1"),
      bean("t1", "task", "e1"),
      bean("t2", "task", "e1"),
    ];
    const result = withAncestors([all[2]!, all[3]!], all);
    expect(result.filter((b) => b.id === "e1")).toHaveLength(1);
    expect(result.map((b) => b.id).sort()).toEqual(["e1", "m1", "t1", "t2"]);
  });

  it("does not infinite-loop on a parent/child cycle", () => {
    const a = bean("a", "task", "b");
    const b = bean("b", "task", "a");
    const all = [a, b];
    const result = withAncestors([a], all);
    expect(result.map((x) => x.id).sort()).toEqual(["a", "b"]);
  });

  it("returns the list unchanged when no bean has a parent", () => {
    const all = [bean("t1", "task", null), bean("t2", "task", null)];
    const result = withAncestors(all, all);
    expect(result).toEqual(all);
  });
});

describe("collectCollapsibleIds", () => {
  it("collects ids of every node that has children", () => {
    const nodes = [
      {
        bean: { id: "m1" } as never,
        depth: 0,
        children: [
          {
            bean: { id: "e1" } as never,
            depth: 1,
            children: [{ bean: { id: "t1" } as never, depth: 2, children: [] }],
          },
        ],
      },
    ];
    expect(collectCollapsibleIds(nodes).sort()).toEqual(["e1", "m1"]);
  });
});
