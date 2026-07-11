import { describe, expect, it } from "vitest";

import { buildTree } from "./hierarchy.js";

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
