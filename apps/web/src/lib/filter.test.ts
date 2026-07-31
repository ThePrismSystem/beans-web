import { describe, expect, it } from "vitest";

import { applyFilter, DEFAULT_BEAN_FILTER, EMPTY_BEAN_FILTER, matchesFilter } from "./filter.js";

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

describe("matchesFilter", () => {
  it("matches everything when every facet is empty", () => {
    expect(matchesFilter(listItem({ id: "a-1" }), EMPTY_BEAN_FILTER)).toBe(true);
  });

  it("ignores search, which stays server-side", () => {
    const bean = listItem({ id: "a-1", title: "nothing alike" });
    expect(matchesFilter(bean, { ...EMPTY_BEAN_FILTER, search: "zzz" })).toBe(true);
  });

  it.each([
    ["type", { type: ["bug" as const] }, { type: "bug" as const }, { type: "task" as const }],
    [
      "status",
      { status: ["completed" as const] },
      { status: "completed" as const },
      { status: "todo" as const },
    ],
    [
      "priority",
      { priority: ["critical" as const] },
      { priority: "critical" as const },
      { priority: "low" as const },
    ],
  ])("filters by %s", (_label, facet, hit, miss) => {
    const filter = { ...EMPTY_BEAN_FILTER, ...facet };
    expect(matchesFilter(listItem({ id: "a-1", ...hit }), filter)).toBe(true);
    expect(matchesFilter(listItem({ id: "a-2", ...miss }), filter)).toBe(false);
  });

  it("ORs within a facet", () => {
    const filter = { ...EMPTY_BEAN_FILTER, type: ["bug" as const, "epic" as const] };
    expect(matchesFilter(listItem({ id: "a-1", type: "bug" }), filter)).toBe(true);
    expect(matchesFilter(listItem({ id: "a-2", type: "epic" }), filter)).toBe(true);
    expect(matchesFilter(listItem({ id: "a-3", type: "task" }), filter)).toBe(false);
  });

  it("ANDs across facets", () => {
    const filter = {
      ...EMPTY_BEAN_FILTER,
      type: ["bug" as const],
      priority: ["critical" as const],
    };
    expect(matchesFilter(listItem({ id: "a-1", type: "bug", priority: "critical" }), filter)).toBe(
      true,
    );
    expect(matchesFilter(listItem({ id: "a-2", type: "bug", priority: "low" }), filter)).toBe(
      false,
    );
  });

  it("matches a bean carrying any one of the requested tags", () => {
    const filter = { ...EMPTY_BEAN_FILTER, tags: ["ui", "perf"] };
    expect(matchesFilter(listItem({ id: "a-1", tags: ["perf", "other"] }), filter)).toBe(true);
    expect(matchesFilter(listItem({ id: "a-2", tags: ["other"] }), filter)).toBe(false);
    expect(matchesFilter(listItem({ id: "a-3", tags: [] }), filter)).toBe(false);
  });

  it("filters by id prefix", () => {
    const filter = { ...EMPTY_BEAN_FILTER, prefix: ["romn"] };
    expect(matchesFilter(listItem({ id: "romn-1" }), filter)).toBe(true);
    expect(matchesFilter(listItem({ id: "hhroot-1" }), filter)).toBe(false);
  });

  it("DEFAULT_BEAN_FILTER admits open beans and rejects closed ones", () => {
    for (const status of ["draft", "todo", "in-progress"] as const) {
      expect(matchesFilter(listItem({ id: "a-1", status }), DEFAULT_BEAN_FILTER)).toBe(true);
    }
    for (const status of ["completed", "scrapped"] as const) {
      expect(matchesFilter(listItem({ id: "a-2", status }), DEFAULT_BEAN_FILTER)).toBe(false);
    }
  });
});

describe("applyFilter", () => {
  it("keeps input order and does not mutate", () => {
    const beans = [
      listItem({ id: "a-1", type: "bug" }),
      listItem({ id: "a-2", type: "task" }),
      listItem({ id: "a-3", type: "bug" }),
    ];
    const result = applyFilter(beans, { ...EMPTY_BEAN_FILTER, type: ["bug"] });
    expect(result.map((b) => b.id)).toEqual(["a-1", "a-3"]);
    expect(beans).toHaveLength(3);
  });
});
