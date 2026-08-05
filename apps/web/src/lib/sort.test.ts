import { describe, expect, it } from "vitest";

import { beanComparator, compareIds, defaultComparator, sortBeans } from "./sort.js";

import type { BeanListItem } from "@beans-web/shared";

const bean = (overrides: Partial<BeanListItem> & Pick<BeanListItem, "id">): BeanListItem => ({
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

describe("beanComparator", () => {
  it("returns a negative number when the first bean sorts before the second", () => {
    const a = bean({ id: "1", title: "Apple" });
    const b = bean({ id: "2", title: "Banana" });

    expect(beanComparator("title", "asc")(a, b)).toBeLessThan(0);
  });

  it("returns a positive number when the direction is reversed", () => {
    const a = bean({ id: "1", title: "Apple" });
    const b = bean({ id: "2", title: "Banana" });

    expect(beanComparator("title", "desc")(a, b)).toBeGreaterThan(0);
  });

  it("falls through to the default tiebreak instead of returning zero when the sort key ties", () => {
    const a = bean({ id: "1", title: "Apple" });
    const b = bean({ id: "2", title: "Apple" });

    expect(beanComparator("title", "asc")(a, b)).toBeLessThan(0);
  });
});

describe("compareIds", () => {
  it("orders numeric suffixes numerically, not lexically", () => {
    expect(compareIds("romn-2", "romn-10")).toBeLessThan(0);
  });

  it("orders by prefix first", () => {
    expect(compareIds("aaa-99", "bbb-1")).toBeLessThan(0);
  });

  it("falls back to a whole-string compare for non-numeric suffixes", () => {
    expect(compareIds("romn-alpha", "romn-beta")).toBeLessThan(0);
  });
});

describe("defaultComparator", () => {
  it("orders by priority before type", () => {
    const low = bean({ id: "a-1", priority: "low", type: "milestone" });
    const critical = bean({ id: "a-2", priority: "critical", type: "bug" });
    expect([low, critical].sort(defaultComparator).map((b) => b.id)).toEqual(["a-2", "a-1"]);
  });

  it("orders by type when priority ties", () => {
    const bug = bean({ id: "a-1", type: "bug" });
    const epic = bean({ id: "a-2", type: "epic" });
    expect([bug, epic].sort(defaultComparator).map((b) => b.id)).toEqual(["a-2", "a-1"]);
  });

  it("orders by natural id when priority and type tie", () => {
    const ten = bean({ id: "a-10" });
    const two = bean({ id: "a-2" });
    expect([ten, two].sort(defaultComparator).map((b) => b.id)).toEqual(["a-2", "a-10"]);
  });
});

describe("sortBeans determinism", () => {
  const beans: BeanListItem[] = [
    bean({ id: "a-1", type: "task", status: "todo", priority: "normal" }),
    bean({ id: "a-2", type: "task", status: "todo", priority: "normal" }),
    bean({ id: "a-3", type: "task", status: "todo", priority: "high", title: "Tied Title" }),
    bean({ id: "a-10", type: "bug", status: "draft", priority: "normal", title: "Tied Title" }),
    bean({ id: "b-1", type: "epic", status: "todo", priority: "normal" }),
  ];

  // Every rotation is a different input order for the same set. Sorting each
  // must produce identical output — this is the regression: today the tied
  // rows keep their input order and so shift on every refetch.
  function rotations(input: BeanListItem[]): BeanListItem[][] {
    return input.map((_, i) => [...input.slice(i), ...input.slice(0, i)]);
  }

  it("produces one stable order regardless of input order, with no sort key", () => {
    const expected = sortBeans(beans).map((b) => b.id);
    for (const rotated of rotations(beans)) {
      expect(sortBeans(rotated).map((b) => b.id)).toEqual(expected);
    }
  });

  it.each(["type", "title", "status"] as const)(
    "produces one stable order regardless of input order, sorted by %s",
    (key) => {
      for (const dir of ["asc", "desc"] as const) {
        const expected = sortBeans(beans, key, dir).map((b) => b.id);
        for (const rotated of rotations(beans)) {
          expect(sortBeans(rotated, key, dir).map((b) => b.id)).toEqual(expected);
        }
      }
    },
  );

  it("inverts only the primary key, leaving ties in ascending default order", () => {
    const asc = sortBeans(beans, "status", "asc");
    const rotated = rotations(beans)[1];
    if (!rotated) {
      throw new Error("expected a rotated bean list");
    }
    const desc = sortBeans(rotated, "status", "desc");
    const tiedAsc = asc.filter((b) => b.status === "todo").map((b) => b.id);
    const tiedDesc = desc.filter((b) => b.status === "todo").map((b) => b.id);
    expect(tiedDesc).toEqual(tiedAsc);
  });

  it("never mutates its input", () => {
    const input = [...beans];
    const before = input.map((b) => b.id);
    sortBeans(input, "title", "asc");
    expect(input.map((b) => b.id)).toEqual(before);
  });
});
