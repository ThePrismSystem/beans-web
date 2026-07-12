import { describe, expect, it } from "vitest";

import { buildGroupedSections, buildTree, pruneTreeToMatches } from "./hierarchy.js";

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

describe("buildGroupedSections", () => {
  it("treats a milestone and a nested epic as their own sections, flattening deep descendants under the epic", () => {
    const beans = [
      bean("m1", "milestone", null),
      bean("e1", "epic", "m1"),
      bean("f1", "feature", "e1"),
      bean("t1", "task", "f1"),
    ];
    const { milestones } = buildTree(beans);

    const { sections } = buildGroupedSections(milestones);

    expect(sections.map((s) => s.bean.id)).toEqual(["m1", "e1"]);
    const epicSection = sections.find((s) => s.bean.id === "e1");
    expect(epicSection?.leaves.map((b) => b.id)).toEqual(["f1", "t1"]);
    expect(epicSection?.depth).toBe(1);
    const milestoneSection = sections.find((s) => s.bean.id === "m1");
    expect(milestoneSection?.leaves).toEqual([]);
  });

  it("lists a task directly under a milestone as a leaf of that milestone's section", () => {
    const beans = [bean("m1", "milestone", null), bean("t1", "task", "m1")];
    const { milestones } = buildTree(beans);

    const { sections } = buildGroupedSections(milestones);

    expect(sections[0]?.leaves.map((b) => b.id)).toEqual(["t1"]);
  });

  it("collects parent-less leaf beans as rootLeaves without a forced section header", () => {
    const beans = [bean("orphan", "task", null)];
    const { roots } = buildTree(beans);

    const { sections, rootLeaves } = buildGroupedSections(roots);

    expect(sections).toEqual([]);
    expect(rootLeaves.map((b) => b.id)).toEqual(["orphan"]);
  });

  it("treats a root-level epic as its own top-level section", () => {
    const beans = [bean("e1", "epic", null), bean("t1", "task", "e1")];
    const { roots } = buildTree(beans);

    const { sections } = buildGroupedSections(roots);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.bean.id).toBe("e1");
    expect(sections[0]?.depth).toBe(0);
    expect(sections[0]?.leaves.map((b) => b.id)).toEqual(["t1"]);
  });
});
