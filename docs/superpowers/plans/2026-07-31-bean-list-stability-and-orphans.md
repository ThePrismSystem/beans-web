# Bean List Stability and Orphaned Beans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the per-project bean list stop reshuffling and collapsing itself on background refresh, and make open beans under completed or scrapped parents render consistently, badged as orphaned, with a one-click action to re-open the ancestors that stranded them.

**Architecture:** Each project's beans are fetched once, unfiltered, into a single React Query cache entry keyed only by project and search text. Every view — flat, hierarchy, and the detail page's relationship pickers — derives from that one dataset in the browser via pure helper modules (`filter`, `sort`, `orphan`, `hierarchy`). Because a completed parent is now always present in the client's data, orphan status is a lookup rather than an inference from absence, and because the dataset identity no longer changes when filters change, nothing downstream re-seeds itself.

**Tech Stack:** TypeScript (strict), React 19, TanStack Query v5, TanStack Router v1, Vitest 4 + Testing Library, Hono (server), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-07-31-bean-list-stability-and-orphans-design.md`

## Global Constraints

- Node >= 22, pnpm 10. Run commands from the repo root unless a task says otherwise.
- TypeScript strict. **Never** use `eslint-disable` comments, `as any`, or `as unknown as` double-casts. Resolve type errors with narrowing, generics, or utility types.
- `pnpm lint` runs with `--max-warnings 0`. Zero warnings is the bar.
- `pnpm knip` fails on unused exports. When a task deletes the last consumer of an export, delete the export in the same task.
- `pnpm spell` (cspell) runs over `**/*.{ts,tsx,md,json}`. Add new domain words to `cspell.config.yaml` in the task that introduces them.
- Prettier formats on commit via lint-staged. Run `pnpm format:fix` if a check fails.
- Conventional Commits: `type(scope): description`, imperative, <= 72 chars, no trailing period. No emojis. No mention of AI tooling in commit messages or code comments.
- Coverage thresholds stay at their current **80%** for this plan. Raising them to 90% belongs to the separate hardening spec — do not touch `thresholds` in any `vitest.config.ts`.
- Bean statuses are exactly `draft`, `todo`, `in-progress`, `completed`, `scrapped`. `OPEN_STATUSES` is `["draft", "todo", "in-progress"]`.
- Bean types in order: `milestone`, `epic`, `feature`, `task`, `bug`. Priorities in order: `critical`, `high`, `normal`, `low`, `deferred`.
- A parent is "closed" (orphaning) when its status is `completed` **or** `scrapped`.
- `search` is Bleve query syntax and stays server-side. Never reimplement it client-side.

**Per-task definition of done:** the task's own tests pass, plus `pnpm lint`, `pnpm typecheck`, and `pnpm test` are green, and the work is committed.

---

## File Structure

**Created:**

| File | Responsibility |
| --- | --- |
| `apps/web/src/lib/storage.ts` | Safe localStorage read/write with in-memory fallback |
| `apps/web/src/lib/storage.test.ts` | Tests for the above |
| `apps/web/src/lib/filter.ts` | `BeanFilterInput` shape + client-side facet predicates |
| `apps/web/src/lib/filter.test.ts` | Tests for the above |
| `apps/web/src/lib/orphan.ts` | Orphan detection and closed-ancestor chain walking |
| `apps/web/src/lib/orphan.test.ts` | Tests for the above |
| `apps/web/src/components/BeanRow.test.tsx` | Tests for `BeanRow` (none exist today) |
| `packages/shared/src/types.test.ts` | Compile-time assertions on the `Bean`/`BeanListItem` split |

**Modified:**

| File | Change |
| --- | --- |
| `packages/shared/src/types.ts` | Split `Bean` into `BeanListItem` + `Bean` |
| `apps/web/src/lib/sort.ts` | `defaultComparator`, natural id compare, tiebreak chaining |
| `apps/web/src/lib/hierarchy.ts` | Child ordering, orphan descendant counts, drop `collectCollapsibleIds` |
| `apps/web/src/hooks/useBeans.ts` | Replace `useBeans` with `useProjectBeans` |
| `apps/web/src/hooks/useMutations.ts` | Add `useReopenAncestors` + `ReopenPartialFailure` |
| `apps/web/src/components/BeanRow.tsx` | `orphaned` prop + badge |
| `apps/web/src/components/FlatList.tsx` | Pass `orphaned` through |
| `apps/web/src/components/HierarchyList.tsx` | Expanded-id state, persistence, orphan counts |
| `apps/web/src/components/FilterBar.tsx` | Import `BeanFilterInput` from `lib/filter` |
| `apps/web/src/components/ConfirmDialog.tsx` | `message` accepts `ReactNode` |
| `apps/web/src/components/RelationEditor.tsx`, `BeanPicker.tsx`, `CreateBeanForm.tsx` | Candidate props take `BeanListItem[]` |
| `apps/web/src/routes/projectList.tsx` | Client-side filtering; delete `serverFilter` |
| `apps/web/src/routes/beanDetail.tsx` | Orphan warning, confirm dialog, re-open button |
| `apps/web/src/theme/tokens.css`, `global.css` | `--warn` token and badge styles |
| `apps/server/src/discovery/scan.ts` | Sort discovered projects by name |

---

## Task 1: Split `Bean` into `BeanListItem` and `Bean`

List payloads stop carrying `body`. This task only changes types — `Bean` keeps every field it has today, so all existing code still compiles.

**Files:**

- Modify: `packages/shared/src/types.ts:3-19` and the `LinkedBean` alias near the end of the file
- Create: `packages/shared/src/types.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `BeanListItem` — every current `Bean` field **except** `body`.
  - `Bean extends BeanListItem { body: string }`.
  - `LinkedBean = Pick<BeanListItem, "id" | "title" | "type" | "status">` (unchanged shape).
  - `BeanDetail extends Bean` (unchanged).

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/types.test.ts`:

```ts
import { describe, expectTypeOf, it } from "vitest";

import type { Bean, BeanListItem } from "./types.js";

// These assertions are checked by `tsc`, not at runtime — a regression in the
// split fails `pnpm typecheck` as well as `vitest --typecheck`.
describe("bean types", () => {
  it("BeanListItem carries no body", () => {
    expectTypeOf<BeanListItem>().not.toHaveProperty("body");
  });

  it("Bean carries a string body", () => {
    expectTypeOf<Bean>().toHaveProperty("body");
    expectTypeOf<Bean["body"]>().toEqualTypeOf<string>();
  });

  it("Bean satisfies BeanListItem", () => {
    const bean = {} as Bean;
    const listItem: BeanListItem = bean;
    expectTypeOf(listItem).toHaveProperty("id");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @beans-frontend/shared exec vitest run src/types.test.ts`

Expected: FAIL — `BeanListItem` is not exported from `./types.js`.

- [ ] **Step 3: Split the interface**

In `packages/shared/src/types.ts`, replace the `Bean` interface with:

```ts
/** A bean as it appears in list views — every field except the markdown body. */
export interface BeanListItem {
  id: string;
  slug: string | null;
  path: string;
  title: string;
  status: BeanStatus;
  type: BeanType;
  priority: BeanPriority;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  etag: string;
  parentId: string | null;
  blockingIds: string[];
  blockedByIds: string[];
}

/**
 * A bean including its markdown body. Only the detail view needs `body`;
 * list queries fetch `BeanListItem` so an entire project can be held client
 * side cheaply.
 */
export interface Bean extends BeanListItem {
  body: string;
}
```

Then change the `LinkedBean` alias to read from `BeanListItem`:

```ts
/** A related bean shown in link lists — the minimal shape needed to render a row. */
export type LinkedBean = Pick<BeanListItem, "id" | "title" | "type" | "status">;
```

Leave `BeanDetail`, `SearchHit`, and everything else untouched.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @beans-frontend/shared exec vitest run src/types.test.ts`

Expected: PASS (3 tests).

- [ ] **Step 5: Verify nothing else broke**

Run: `pnpm typecheck && pnpm test`

Expected: both green. `Bean` still has every field it had, so no consumer changes.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/types.test.ts
git commit -m "refactor(shared): split Bean into BeanListItem and Bean"
```

---

## Task 2: Safe localStorage helpers

`loadViewMode` in `projectList.tsx` calls `window.localStorage.getItem` unguarded. In private browsing, with storage disabled, or over quota, that throws and takes the whole route down. This module is also what Task 8 persists expand state through.

**Files:**

- Create: `apps/web/src/lib/storage.ts`
- Create: `apps/web/src/lib/storage.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `readString(key: string): string | null`
  - `writeString(key: string, value: string): void`
  - `readStringSet(key: string): Set<string>`
  - `writeStringSet(key: string, value: Iterable<string>): void`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/storage.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { readString, readStringSet, writeString, writeStringSet } from "./storage.js";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("readString / writeString", () => {
  it("round-trips a value", () => {
    writeString("k", "v");
    expect(readString("k")).toBe("v");
  });

  it("returns null for a missing key", () => {
    expect(readString("absent")).toBeNull();
  });

  it("falls back to memory when localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    writeString("k", "v");
    expect(readString("k")).toBe("v");
  });
});

describe("readStringSet / writeStringSet", () => {
  it("round-trips a set", () => {
    writeStringSet("ids", new Set(["a", "b"]));
    expect([...readStringSet("ids")].sort()).toEqual(["a", "b"]);
  });

  it("returns an empty set for a missing key", () => {
    expect(readStringSet("absent").size).toBe(0);
  });

  it("returns an empty set for corrupt JSON", () => {
    window.localStorage.setItem("ids", "{not json");
    expect(readStringSet("ids").size).toBe(0);
  });

  it("returns an empty set when the payload is not an array", () => {
    window.localStorage.setItem("ids", JSON.stringify({ a: 1 }));
    expect(readStringSet("ids").size).toBe(0);
  });

  it("drops non-string members", () => {
    window.localStorage.setItem("ids", JSON.stringify(["a", 3, null, "b"]));
    expect([...readStringSet("ids")].sort()).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/lib/storage.test.ts`

Expected: FAIL — cannot resolve `./storage.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/storage.ts`:

```ts
// Falls back to this map when localStorage is unavailable (private browsing,
// storage disabled, quota exceeded). State then lives for the page session
// only, which is strictly better than throwing out of a render.
const memory = new Map<string, string>();

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}

export function readString(key: string): string | null {
  return safeGet(key);
}

export function writeString(key: string, value: string): void {
  safeSet(key, value);
}

/** Reads a JSON string array. Any unparsable or unexpected payload reads as empty. */
export function readStringSet(key: string): Set<string> {
  const raw = safeGet(key);
  if (raw === null) {
    return new Set();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Set();
  }
  if (!Array.isArray(parsed)) {
    return new Set();
  }
  return new Set(parsed.filter((value): value is string => typeof value === "string"));
}

export function writeStringSet(key: string, value: Iterable<string>): void {
  safeSet(key, JSON.stringify([...value]));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/lib/storage.test.ts`

Expected: PASS (8 tests).

- [ ] **Step 5: Point `loadViewMode` onto the helper**

In `apps/web/src/routes/projectList.tsx`, add the import and replace `loadViewMode`:

```tsx
import { readString, writeString } from "../lib/storage.js";
```

```tsx
function loadViewMode(project: string): ViewMode {
  return readString(viewStorageKey(project)) === "flat" ? "flat" : "hierarchy";
}
```

And in the persistence effect, replace `window.localStorage.setItem(...)` with:

```tsx
  useEffect(() => {
    writeString(viewStorageKey(project), view);
  }, [project, view]);
```

- [ ] **Step 6: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/storage.ts apps/web/src/lib/storage.test.ts apps/web/src/routes/projectList.tsx
git commit -m "feat(web): add localStorage helpers with in-memory fallback"
```

---

## Task 3: Deterministic ordering in `sort.ts`

Two defects: `Default` applies no ordering at all, and every explicit sort key returns `0` for equal values so tied rows fall through to whatever order the CLI emitted — which changes on refetch.

**Files:**

- Modify: `apps/web/src/lib/sort.ts` (whole file)
- Modify: `apps/web/src/lib/sort.test.ts` (append)

**Interfaces:**

- Consumes: `BeanListItem` (Task 1).
- Produces:
  - `compareIds(a: string, b: string): number`
  - `defaultComparator(a: BeanListItem, b: BeanListItem): number`
  - `beanComparator(key: SortKey, dir: SortDir): (a: BeanListItem, b: BeanListItem) => number` (signature unchanged, behavior gains a tiebreak)
  - `sortBeans<T extends BeanListItem>(beans: T[], key?: SortKey, dir?: SortDir): T[]` — `key` is now **optional**; omitting it applies `defaultComparator`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/lib/sort.test.ts` (keep the existing tests; if the file's local `bean` fixture helper differs, use it rather than redefining):

```ts
import { describe, expect, it } from "vitest";

import { compareIds, defaultComparator, sortBeans } from "./sort.js";

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
    const low = listItem({ id: "a-1", priority: "low", type: "milestone" });
    const critical = listItem({ id: "a-2", priority: "critical", type: "bug" });
    expect([low, critical].sort(defaultComparator).map((b) => b.id)).toEqual(["a-2", "a-1"]);
  });

  it("orders by type when priority ties", () => {
    const bug = listItem({ id: "a-1", type: "bug" });
    const epic = listItem({ id: "a-2", type: "epic" });
    expect([bug, epic].sort(defaultComparator).map((b) => b.id)).toEqual(["a-2", "a-1"]);
  });

  it("orders by natural id when priority and type tie", () => {
    const ten = listItem({ id: "a-10" });
    const two = listItem({ id: "a-2" });
    expect([ten, two].sort(defaultComparator).map((b) => b.id)).toEqual(["a-2", "a-10"]);
  });
});

describe("sortBeans determinism", () => {
  const beans: BeanListItem[] = [
    listItem({ id: "a-1", type: "task", status: "todo", priority: "normal" }),
    listItem({ id: "a-2", type: "task", status: "todo", priority: "normal" }),
    listItem({ id: "a-3", type: "task", status: "todo", priority: "high" }),
    listItem({ id: "a-10", type: "bug", status: "draft", priority: "normal" }),
    listItem({ id: "b-1", type: "epic", status: "todo", priority: "normal" }),
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
    const desc = sortBeans(beans, "status", "desc");
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/lib/sort.test.ts`

Expected: FAIL — `compareIds` and `defaultComparator` are not exported, and `sortBeans(beans)` with no key is a type error.

- [ ] **Step 3: Rewrite `sort.ts`**

Replace the contents of `apps/web/src/lib/sort.ts` with:

```ts
import { BEAN_PRIORITIES, BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";

import type { BeanListItem } from "@beans-frontend/shared";

export type SortKey = "type" | "title" | "status";
export type SortDir = "asc" | "desc";

const ID_SUFFIX = /^(.*)-(\d+)$/;

/**
 * Compares bean ids naturally, so `romn-2` precedes `romn-10`. Ids are
 * `prefix-number`; anything that doesn't match falls back to a whole-string
 * compare.
 */
export function compareIds(a: string, b: string): number {
  const matchA = ID_SUFFIX.exec(a);
  const matchB = ID_SUFFIX.exec(b);
  if (!matchA || !matchB) {
    return a.localeCompare(b);
  }
  const byPrefix = matchA[1]!.localeCompare(matchB[1]!);
  return byPrefix !== 0 ? byPrefix : Number(matchA[2]) - Number(matchB[2]);
}

/**
 * The `Default` ordering: priority, then type, then natural id. Ids are
 * unique, so this is a total order — it never returns 0 for two distinct
 * beans, which is what stops the list reshuffling when the data refetches.
 */
export function defaultComparator(a: BeanListItem, b: BeanListItem): number {
  const byPriority = BEAN_PRIORITIES.indexOf(a.priority) - BEAN_PRIORITIES.indexOf(b.priority);
  if (byPriority !== 0) {
    return byPriority;
  }
  const byType = BEAN_TYPES.indexOf(a.type) - BEAN_TYPES.indexOf(b.type);
  return byType !== 0 ? byType : compareIds(a.id, b.id);
}

function compareByKey(key: SortKey, a: BeanListItem, b: BeanListItem): number {
  if (key === "title") return a.title.localeCompare(b.title);
  if (key === "type") return BEAN_TYPES.indexOf(a.type) - BEAN_TYPES.indexOf(b.type);
  return BEAN_STATUSES.indexOf(a.status) - BEAN_STATUSES.indexOf(b.status);
}

/**
 * `dir` inverts the primary key only. Ties always resolve through
 * `defaultComparator` ascending, so both directions are fully deterministic.
 */
export function beanComparator(
  key: SortKey,
  dir: SortDir,
): (a: BeanListItem, b: BeanListItem) => number {
  const factor = dir === "desc" ? -1 : 1;
  return (a, b) => {
    const byKey = compareByKey(key, a, b) * factor;
    return byKey !== 0 ? byKey : defaultComparator(a, b);
  };
}

/** Stable copy; never mutates the input array. Omitting `key` applies the default ordering. */
export function sortBeans<T extends BeanListItem>(
  beans: T[],
  key?: SortKey,
  dir: SortDir = "asc",
): T[] {
  return [...beans].sort(key ? beanComparator(key, dir) : defaultComparator);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/lib/sort.test.ts`

Expected: PASS. If a pre-existing test asserted an order that only held because ties fell through to input order, update that test's expectation to the new deterministic order — do not weaken the new tests.

- [ ] **Step 5: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/sort.ts apps/web/src/lib/sort.test.ts
git commit -m "fix(web): give bean sorting a total order"
```

---

## Task 4: Client-side filter predicates

Moves the status/type/priority/tags facets off the wire. **Write and verify this module before Task 9 deletes the server filter path** — silently changing filter semantics during the port is the main risk in this whole plan, and this ordering is the mitigation.

**Files:**

- Create: `apps/web/src/lib/filter.ts`
- Create: `apps/web/src/lib/filter.test.ts`
- Modify: `apps/web/src/hooks/useBeans.ts` (re-export removal — see Step 5)
- Modify: `apps/web/src/components/FilterBar.tsx:8` (import path)

**Interfaces:**

- Consumes: `BeanListItem` (Task 1), `beanPrefix` from `./prefix.js`.
- Produces:
  - `BeanFilterInput` — moved verbatim from `hooks/useBeans.ts`.
  - `EMPTY_BEAN_FILTER`, `DEFAULT_BEAN_FILTER` — moved verbatim.
  - `matchesFilter(bean: BeanListItem, filter: BeanFilterInput): boolean`
  - `applyFilter<T extends BeanListItem>(beans: T[], filter: BeanFilterInput): T[]`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/filter.test.ts`:

```ts
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
    expect(matchesFilter(listItem({ id: "a-2", type: "bug", priority: "low" }), filter)).toBe(false);
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/lib/filter.test.ts`

Expected: FAIL — cannot resolve `./filter.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/filter.ts`:

```ts
import { OPEN_STATUSES } from "@beans-frontend/shared";

import { beanPrefix } from "./prefix.js";

import type { BeanListItem, BeanPriority, BeanStatus, BeanType } from "@beans-frontend/shared";

export interface BeanFilterInput {
  type: BeanType[];
  status: BeanStatus[];
  priority: BeanPriority[];
  tags: string[];
  prefix: string[];
  search: string;
}

export const EMPTY_BEAN_FILTER: BeanFilterInput = {
  type: [],
  status: [],
  priority: [],
  tags: [],
  prefix: [],
  search: "",
};

export const DEFAULT_BEAN_FILTER: BeanFilterInput = {
  ...EMPTY_BEAN_FILTER,
  status: [...OPEN_STATUSES],
};

/**
 * Mirrors the beans server-side BeanFilter semantics: an empty facet matches
 * everything (the server treats an absent field the same way), values within a
 * facet are ORed, and facets are ANDed together.
 *
 * `search` is deliberately not applied here. It is Bleve query syntax (fuzzy,
 * wildcard, phrase, boolean, field-scoped) and stays server-side.
 */
export function matchesFilter(bean: BeanListItem, filter: BeanFilterInput): boolean {
  if (filter.type.length > 0 && !filter.type.includes(bean.type)) return false;
  if (filter.status.length > 0 && !filter.status.includes(bean.status)) return false;
  if (filter.priority.length > 0 && !filter.priority.includes(bean.priority)) return false;
  if (filter.tags.length > 0 && !filter.tags.some((tag) => bean.tags.includes(tag))) return false;
  if (filter.prefix.length > 0 && !filter.prefix.includes(beanPrefix(bean.id))) return false;
  return true;
}

export function applyFilter<T extends BeanListItem>(
  beans: T[],
  filter: BeanFilterInput,
): T[] {
  return beans.filter((bean) => matchesFilter(bean, filter));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/lib/filter.test.ts`

Expected: PASS.

- [ ] **Step 5: Point the existing consumers**

In `apps/web/src/hooks/useBeans.ts`, delete the local `BeanFilterInput` interface and the `EMPTY_BEAN_FILTER` / `DEFAULT_BEAN_FILTER` constants, and import them instead:

```ts
import { EMPTY_BEAN_FILTER } from "../lib/filter.js";

import type { BeanFilterInput } from "../lib/filter.js";
```

Keep `EMPTY_BEAN_FILTER` referenced only if the file still uses it; if not, import the type alone. `toGraphqlFilter` and `useBeans` stay as they are for now — Task 9 removes them.

In `apps/web/src/components/FilterBar.tsx`, change:

```tsx
import type { BeanFilterInput } from "../lib/filter.js";
```

In `apps/web/src/routes/projectList.tsx` and `apps/web/src/routes/beanDetail.tsx`, update the `BeanFilterInput` / `DEFAULT_BEAN_FILTER` / `EMPTY_BEAN_FILTER` imports to come from `../lib/filter.js`. Update any test files that import them from `../hooks/useBeans.js` the same way.

- [ ] **Step 6: Verify the port matches current server behavior**

Read `apps/web/beans.schema.graphql`'s `input BeanFilter` block (lines 85+) and confirm each facet's documented semantics match `matchesFilter`: `status`, `type`, `priority`, and `tags` all document "OR logic" within the field. If any facet documents something different (for example tags requiring *all* values), fix `matchesFilter` and its test to match the schema, and note the correction in the commit body.

- [ ] **Step 7: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/filter.ts apps/web/src/lib/filter.test.ts apps/web/src/hooks/useBeans.ts apps/web/src/components/FilterBar.tsx apps/web/src/routes/projectList.tsx apps/web/src/routes/beanDetail.tsx
git commit -m "feat(web): add client-side bean filter predicates"
```

---

## Task 5: Orphan detection

**Files:**

- Create: `apps/web/src/lib/orphan.ts`
- Create: `apps/web/src/lib/orphan.test.ts`

**Interfaces:**

- Consumes: `BeanListItem`, `OPEN_STATUSES` (shared).
- Produces:
  - `indexById<T extends BeanListItem>(beans: T[]): Map<string, T>`
  - `isOrphaned(bean: BeanListItem, byId: ReadonlyMap<string, BeanListItem>): boolean`
  - `orphanedIds(beans: BeanListItem[]): Set<string>`
  - `closedAncestors(bean: BeanListItem, byId: ReadonlyMap<string, BeanListItem>): BeanListItem[]` — nearest ancestor first.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/orphan.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/lib/orphan.test.ts`

Expected: FAIL — cannot resolve `./orphan.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/orphan.ts`:

```ts
import { OPEN_STATUSES } from "@beans-frontend/shared";

import type { BeanListItem, BeanStatus } from "@beans-frontend/shared";

/** A parent in one of these states strands its open children. */
const CLOSED_STATUSES: readonly BeanStatus[] = ["completed", "scrapped"];

export function indexById<T extends BeanListItem>(beans: T[]): Map<string, T> {
  return new Map(beans.map((bean) => [bean.id, bean]));
}

/**
 * True when `bean` is open and its parent exists in the project but is
 * completed or scrapped.
 *
 * `byId` must index the FULL project dataset, never a filtered subset: a
 * parent missing because of a filter is not an orphaning parent, and treating
 * absence as evidence is exactly the bug this replaces.
 */
export function isOrphaned(bean: BeanListItem, byId: ReadonlyMap<string, BeanListItem>): boolean {
  if (!OPEN_STATUSES.includes(bean.status)) return false;
  if (bean.parentId === null) return false;
  const parent = byId.get(bean.parentId);
  return parent !== undefined && CLOSED_STATUSES.includes(parent.status);
}

export function orphanedIds(beans: BeanListItem[]): Set<string> {
  const byId = indexById(beans);
  return new Set(beans.filter((bean) => isOrphaned(bean, byId)).map((bean) => bean.id));
}

/**
 * The chain of consecutively completed/scrapped ancestors above `bean`,
 * nearest first — the beans a "Re-open parent" action must touch to leave
 * `bean` in an open tree. Stops at the first open ancestor, a missing parent,
 * or a revisited id (cycle guard).
 */
export function closedAncestors(
  bean: BeanListItem,
  byId: ReadonlyMap<string, BeanListItem>,
): BeanListItem[] {
  const chain: BeanListItem[] = [];
  const seen = new Set<string>([bean.id]);
  let parentId = bean.parentId;
  while (parentId !== null && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (parent === undefined || !CLOSED_STATUSES.includes(parent.status)) break;
    seen.add(parent.id);
    chain.push(parent);
    parentId = parent.parentId;
  }
  return chain;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/lib/orphan.test.ts`

Expected: PASS.

- [ ] **Step 5: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`

Note: `pnpm knip` will flag these exports as unused until Tasks 8, 9 and 11 consume them. Run `pnpm knip` only in the final verification task.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/orphan.ts apps/web/src/lib/orphan.test.ts
git commit -m "feat(web): detect orphaned beans and closed ancestor chains"
```

---

## Task 6: Hierarchy child ordering and orphan counts

`buildTree` sorts children by title and mutates the array it sorts. It gains the default ordering, a recursive orphan count per node, and loses `collectCollapsibleIds` (Task 8 removes the only caller).

**Files:**

- Modify: `apps/web/src/lib/hierarchy.ts` (whole file)
- Modify: `apps/web/src/lib/hierarchy.test.ts`

**Interfaces:**

- Consumes: `defaultComparator` (Task 3), `BeanListItem` (Task 1).
- Produces:
  - `BeanNode { bean: BeanListItem; children: BeanNode[]; depth: number; orphanedDescendants: number }`
  - `buildTree(beans: BeanListItem[], orphaned?: ReadonlySet<string>): { milestones: BeanNode[]; roots: BeanNode[] }`
  - `pruneTreeToMatches(nodes: BeanNode[], predicate: (bean: BeanListItem) => boolean, orphaned?: ReadonlySet<string>): BeanNode[]`
  - `withAncestors<T extends BeanListItem>(list: T[], all: T[]): T[]` (behavior unchanged, generic added)
  - `collectCollapsibleIds` is **removed**.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/lib/hierarchy.test.ts`. Replace the file's existing `bean` fixture helper with one that accepts status and priority, and update existing call sites (`bean("m1", "milestone", null)` keeps working since the extra params are optional):

```ts
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
    const beans = [bean("m-1", "milestone", null), bean("t-2", "task", "m-1"), bean("t-1", "task", "m-1")];
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
    const all = [bean("m-1", "milestone", null), bean("e-1", "epic", "m-1"), bean("t-1", "task", "e-1")];
    const kept = withAncestors([all[2]!], all);
    expect(kept.map((b) => b.id).sort()).toEqual(["e-1", "m-1", "t-1"]);
  });
});
```

Delete any existing `collectCollapsibleIds` tests and its import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/lib/hierarchy.test.ts`

Expected: FAIL — `orphanedDescendants` does not exist and `buildTree` takes one argument.

- [ ] **Step 3: Rewrite `hierarchy.ts`**

Replace the contents of `apps/web/src/lib/hierarchy.ts` with:

```ts
import { defaultComparator } from "./sort.js";

import type { BeanListItem } from "@beans-frontend/shared";

export interface BeanNode {
  bean: BeanListItem;
  children: BeanNode[];
  depth: number;
  /**
   * Orphaned beans anywhere beneath this node, not counting the node itself.
   * Lets a collapsed row advertise stranded work nested under it.
   */
  orphanedDescendants: number;
}

function countOrphans(children: BeanNode[], orphaned: ReadonlySet<string>): number {
  return children.reduce(
    (sum, child) => sum + child.orphanedDescendants + (orphaned.has(child.bean.id) ? 1 : 0),
    0,
  );
}

export function buildTree(
  beans: BeanListItem[],
  orphaned: ReadonlySet<string> = new Set(),
): { milestones: BeanNode[]; roots: BeanNode[] } {
  const byId = new Map(beans.map((b) => [b.id, b]));
  const childrenOf = new Map<string, BeanListItem[]>();
  for (const b of beans) {
    if (b.parentId && byId.has(b.parentId)) {
      const list = childrenOf.get(b.parentId) ?? [];
      list.push(b);
      childrenOf.set(b.parentId, list);
    }
  }
  const build = (b: BeanListItem, depth: number): BeanNode => {
    // Copy before sorting: `childrenOf` holds the live arrays, and sorting in
    // place would reorder them for every later reader.
    const children = [...(childrenOf.get(b.id) ?? [])]
      .sort(defaultComparator)
      .map((child) => build(child, depth + 1));
    return { bean: b, depth, children, orphanedDescendants: countOrphans(children, orphaned) };
  };
  const milestones = beans.filter((b) => b.type === "milestone").map((b) => build(b, 0));
  const roots = beans
    .filter((b) => b.type !== "milestone" && (!b.parentId || !byId.has(b.parentId)))
    .map((b) => build(b, 0));
  return { milestones, roots };
}

/**
 * Prunes a tree of BeanNodes down to beans matching `predicate`, keeping any
 * ancestor (milestone/epic/etc.) that has at least one matching descendant so
 * it still renders as context/section header. Nodes with no match anywhere
 * in their subtree, and no match themselves, are dropped entirely.
 *
 * Orphan counts are recomputed from the surviving children so a count always
 * describes what is actually nested beneath the node in the rendered tree.
 */
export function pruneTreeToMatches(
  nodes: BeanNode[],
  predicate: (bean: BeanListItem) => boolean,
  orphaned: ReadonlySet<string> = new Set(),
): BeanNode[] {
  const result: BeanNode[] = [];
  for (const node of nodes) {
    const children = pruneTreeToMatches(node.children, predicate, orphaned);
    if (predicate(node.bean) || children.length > 0) {
      result.push({ ...node, children, orphanedDescendants: countOrphans(children, orphaned) });
    }
  }
  return result;
}

/**
 * Given a subset of `all` (e.g. beans matching a prefix filter), returns that
 * subset plus every ancestor (milestone/epic/etc.) needed so the hierarchy
 * still has somewhere to nest each match, deduplicated. Safe against parent
 * cycles since a bean already added to `keep` stops the walk.
 */
export function withAncestors<T extends BeanListItem>(list: T[], all: T[]): T[] {
  const byId = new Map(all.map((b) => [b.id, b]));
  const keep = new Map(list.map((b) => [b.id, b]));
  for (const bean of list) {
    let parentId = bean.parentId;
    while (parentId && byId.has(parentId) && !keep.has(parentId)) {
      const parent = byId.get(parentId)!;
      keep.set(parentId, parent);
      parentId = parent.parentId;
    }
  }
  return [...keep.values()];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/lib/hierarchy.test.ts`

Expected: PASS.

- [ ] **Step 5: Fix the `HierarchyList` call site so the build stays green**

`HierarchyList.tsx` still imports `collectCollapsibleIds`. Task 8 rewrites that component; for now, replace the import and the `initialCollapsed` line with an inline equivalent so this commit compiles:

```tsx
  const initialCollapsed = useMemo(() => {
    const ids: string[] = [];
    const walk = (list: BeanNode[]) => {
      for (const node of list) {
        if (node.children.length > 0) {
          ids.push(node.bean.id);
          walk(node.children);
        }
      }
    };
    walk(topNodes);
    return new Set(ids);
  }, [topNodes]);
```

Remove `collectCollapsibleIds` from the import list.

- [ ] **Step 6: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/hierarchy.ts apps/web/src/lib/hierarchy.test.ts apps/web/src/components/HierarchyList.tsx
git commit -m "feat(web): order tree children by default sort and count orphans"
```

---

## Task 7: Warning token and the orphan badge on `BeanRow`

**Files:**

- Modify: `apps/web/src/theme/tokens.css:14-24` (token block)
- Modify: `apps/web/src/theme/global.css` (append styles)
- Modify: `apps/web/src/components/BeanRow.tsx`
- Modify: `apps/web/src/components/FlatList.tsx`
- Create: `apps/web/src/components/BeanRow.test.tsx`

**Interfaces:**

- Consumes: `BeanListItem` (Task 1).
- Produces:
  - `BeanRow({ project, bean, orphaned }: { project: string; bean: BeanListItem; orphaned?: boolean })`
  - `FlatList({ project, beans, orphaned }: { project: string; beans: BeanListItem[]; orphaned?: ReadonlySet<string> })`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/BeanRow.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BeanRow } from "./BeanRow.js";

import { renderWithRouter } from "../test/renderWithRouter.js";

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
```

Add to `apps/web/src/components/FlatList.test.tsx`:

```tsx
  it("badges only the beans in the orphaned set", async () => {
    const beans = [
      { ...bean, id: "t-1", title: "Orphan One" },
      { ...bean, id: "t-2", title: "Normal Two" },
    ];
    renderWithRouter(
      <FlatList project="demo" beans={beans} orphaned={new Set(["t-1"])} />,
    );
    await screen.findByText("Orphan One");
    expect(screen.getAllByText("orphaned")).toHaveLength(1);
  });
```

(Use the fixture helper already defined in `FlatList.test.tsx`; if it has none, copy the `bean` object from the `BeanRow` test above.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/components/BeanRow.test.tsx src/components/FlatList.test.tsx`

Expected: FAIL — `orphaned` is not a valid prop.

- [ ] **Step 3: Add the `--warn` token**

In `apps/web/src/theme/tokens.css`, add after the `--s-scrapped` line:

```css
  /* Orphaned-bean warning. Contrast measured against --paper in each scheme;
     both meet WCAG AA (4.5:1) for normal text. */
  --warn: light-dark(#9a3f12, #e0906a);
```

- [ ] **Step 4: Verify the contrast and record the measured ratios**

Compute the contrast ratio of `#9a3f12` against the light `--paper` `#f4efe4`, and of `#e0906a` against the dark `--paper` `#23211d`. Use any WCAG contrast checker (for example `https://webaim.org/resources/contrastchecker/`).

Both must be >= 4.5:1. If either falls short, darken the light value or lighten the dark value until it passes. Then replace the comment with the measured numbers, matching how `--muted` documents its own ratio:

```css
  /* Orphaned-bean warning. Light #9a3f12 on --paper ≈ N.N:1; dark #e0906a on
     --paper ≈ N.N:1 — both meet WCAG AA. */
```

- [ ] **Step 5: Add the badge styles**

Append to `apps/web/src/theme/global.css`:

```css
.bean-row-orphan,
.hierarchy-orphan-count {
  color: var(--warn);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.bean-row-orphan {
  border: 1px solid var(--warn);
  border-radius: 0.2rem;
  padding: 0 0.3rem;
}
```

- [ ] **Step 6: Update `BeanRow`**

Replace `apps/web/src/components/BeanRow.tsx` with:

```tsx
import { Link } from "@tanstack/react-router";

import { BeanTypeTag } from "./BeanTypeTag.js";
import { StatusDot } from "./StatusDot.js";

import type { BeanListItem } from "@beans-frontend/shared";

export function BeanRow({
  project,
  bean,
  orphaned = false,
}: {
  project: string;
  bean: BeanListItem;
  /** True when this bean is open but its parent is completed or scrapped. */
  orphaned?: boolean;
}) {
  return (
    <Link to="/p/$project/$beanId" params={{ project, beanId: bean.id }} className="bean-row">
      <BeanTypeTag type={bean.type} />
      <span className="bean-row-title">{bean.title}</span>
      {orphaned && <span className="bean-row-orphan">orphaned</span>}
      <StatusDot status={bean.status} />
    </Link>
  );
}
```

- [ ] **Step 7: Update `FlatList`**

Replace `apps/web/src/components/FlatList.tsx` with:

```tsx
import { BeanRow } from "./BeanRow.js";

import type { BeanListItem } from "@beans-frontend/shared";

export function FlatList({
  project,
  beans,
  orphaned,
}: {
  project: string;
  beans: BeanListItem[];
  orphaned?: ReadonlySet<string>;
}) {
  if (beans.length === 0) {
    return <p className="muted">No beans match the current filters.</p>;
  }

  return (
    <ul className="flat-list">
      {beans.map((bean) => (
        <li key={bean.id}>
          <BeanRow project={project} bean={bean} orphaned={orphaned?.has(bean.id) ?? false} />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/components/BeanRow.test.tsx src/components/FlatList.test.tsx`

Expected: PASS.

- [ ] **Step 9: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/theme/tokens.css apps/web/src/theme/global.css apps/web/src/components/BeanRow.tsx apps/web/src/components/BeanRow.test.tsx apps/web/src/components/FlatList.tsx apps/web/src/components/FlatList.test.tsx
git commit -m "feat(web): badge orphaned beans in list rows"
```

---

## Task 8: Persist expand state and show orphan counts in `HierarchyList`

This is the fix for the snap-shut bug. The component stores **expanded** ids rather than collapsed ones: absence then means collapsed, which is already the default, so a node appearing for the first time seeds collapsed for free and there is no seed step left to re-fire on refetch. `initialCollapsed`, `seededFor`, and the render-phase `setState` all disappear.

**Files:**

- Modify: `apps/web/src/components/HierarchyList.tsx` (whole file)
- Modify: `apps/web/src/components/HierarchyList.test.tsx`

**Interfaces:**

- Consumes: `buildTree`, `pruneTreeToMatches` (Task 6); `beanComparator`, `defaultComparator` (Task 3); `readStringSet`, `writeStringSet` (Task 2); `BeanRow` `orphaned` prop (Task 7).
- Produces: `HierarchyList({ project, beans, orphaned, knownIds, typeFilter, sort, dir })` where `orphaned: ReadonlySet<string>` and `knownIds: ReadonlySet<string>` are the orphan set and the id set of the **full** project dataset.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/src/components/HierarchyList.test.tsx` (the file already has a `bean(id, type, parentId, title)` helper — extend it to take an optional status, defaulting to `"todo"`, and drop `body` from the fixture since `BeanListItem` has none):

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const allIds = (list: BeanListItem[]) => new Set(list.map((b) => b.id));

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("HierarchyList expand state", () => {
  const beans = [
    bean("m-1", "milestone", null, "Milestone One"),
    bean("e-1", "epic", "m-1", "Epic One"),
    bean("t-1", "task", "e-1", "Task One"),
  ];

  it("survives a refetch that produces a new array of identical beans", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithRouter(
      <HierarchyList
        project="demo"
        beans={beans}
        orphaned={new Set()}
        knownIds={allIds(beans)}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Expand Milestone One" }));
    expect(await screen.findByText("Epic One")).toBeInTheDocument();

    // What an SSE-triggered refetch produces: same contents, new identities.
    const refetched = beans.map((b) => ({ ...b }));
    rerender(
      <HierarchyList
        project="demo"
        beans={refetched}
        orphaned={new Set()}
        knownIds={allIds(refetched)}
      />,
    );

    expect(screen.getByText("Epic One")).toBeInTheDocument();
  });

  it("restores expand state from storage on a fresh mount", async () => {
    window.localStorage.setItem("beans:expanded:demo", JSON.stringify(["m-1"]));

    renderWithRouter(
      <HierarchyList
        project="demo"
        beans={beans}
        orphaned={new Set()}
        knownIds={allIds(beans)}
      />,
    );

    expect(await screen.findByText("Epic One")).toBeInTheDocument();
  });

  it("seeds a newly appeared node collapsed", async () => {
    renderWithRouter(
      <HierarchyList
        project="demo"
        beans={beans}
        orphaned={new Set()}
        knownIds={allIds(beans)}
      />,
    );

    expect(await screen.findByText("Milestone One")).toBeInTheDocument();
    expect(screen.queryByText("Epic One")).not.toBeInTheDocument();
  });

  it("prunes ids that no longer exist in the project when writing", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("beans:expanded:demo", JSON.stringify(["gone-1"]));

    renderWithRouter(
      <HierarchyList
        project="demo"
        beans={beans}
        orphaned={new Set()}
        knownIds={allIds(beans)}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Expand Milestone One" }));

    const stored: unknown = JSON.parse(window.localStorage.getItem("beans:expanded:demo") ?? "[]");
    expect(stored).toEqual(["m-1"]);
  });
});

describe("HierarchyList orphan display", () => {
  const beans = [
    bean("m-1", "milestone", null, "Docker setup", "completed"),
    bean("t-1", "task", "m-1", "Fix SSE reconnect"),
    bean("t-2", "task", "m-1", "Pin CI actions"),
  ];

  it("shows a recursive orphan count on the collapsed ancestor", async () => {
    renderWithRouter(
      <HierarchyList
        project="demo"
        beans={beans}
        orphaned={new Set(["t-1", "t-2"])}
        knownIds={allIds(beans)}
      />,
    );

    expect(await screen.findByText("⚠ 2 orphaned")).toBeInTheDocument();
  });

  it("badges the orphans themselves once expanded", async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <HierarchyList
        project="demo"
        beans={beans}
        orphaned={new Set(["t-1", "t-2"])}
        knownIds={allIds(beans)}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Expand Docker setup" }));
    expect(screen.getAllByText("orphaned")).toHaveLength(2);
  });

  it("shows no count when nothing beneath is orphaned", async () => {
    renderWithRouter(
      <HierarchyList
        project="demo"
        beans={beans}
        orphaned={new Set()}
        knownIds={allIds(beans)}
      />,
    );

    await screen.findByText("Docker setup");
    expect(screen.queryByText(/orphaned/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/components/HierarchyList.test.tsx`

Expected: FAIL — `orphaned` / `knownIds` are not valid props, and the refetch test fails because expansion resets.

- [ ] **Step 3: Rewrite `HierarchyList.tsx`**

Replace the contents of `apps/web/src/components/HierarchyList.tsx` with:

```tsx
import { useEffect, useMemo, useState } from "react";

import { BeanRow } from "./BeanRow.js";

import { buildTree, pruneTreeToMatches } from "../lib/hierarchy.js";
import { beanComparator } from "../lib/sort.js";
import { readStringSet, writeStringSet } from "../lib/storage.js";

import type { BeanNode } from "../lib/hierarchy.js";
import type { SortDir, SortKey } from "../lib/sort.js";
import type { BeanListItem, BeanType } from "@beans-frontend/shared";
import type { ReactNode } from "react";

// Milestones and epics act as visual "sections": when they contain children
// they get a subtle tinted row so containers stand out from leaf beans.
const SECTION_TYPES: readonly BeanType[] = ["milestone", "epic"];

function expandedStorageKey(project: string): string {
  return `beans:expanded:${project}`;
}

function toggleId(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export function HierarchyList({
  project,
  beans,
  orphaned,
  knownIds,
  typeFilter,
  sort,
  dir,
}: {
  project: string;
  beans: BeanListItem[];
  /** Ids of open beans whose parent is completed or scrapped. */
  orphaned: ReadonlySet<string>;
  /**
   * Ids present in the full (unfiltered) project dataset. Persisted expand
   * state is pruned against this on write so it stays bounded by project size
   * and deleted beans do not accumulate. Pruning on write rather than read
   * means an id temporarily hidden by a filter keeps its expansion.
   */
  knownIds: ReadonlySet<string>;
  /**
   * When set, the tree is pruned client-side to beans matching one of these
   * types plus their ancestor chain, instead of relying on the server-side
   * type filter (which would exclude ancestor milestones/epics entirely and
   * collapse the hierarchy into a flat list).
   */
  typeFilter?: BeanType[];
  /**
   * When set, reorders only the top-level rows (milestones + roots) by this
   * key. Nested children always keep their existing tree order (see
   * buildTree, which sorts children by the default comparator) so that
   * expanding a parent never surprises the user with a reshuffled subtree.
   */
  sort?: SortKey;
  dir?: SortDir;
}) {
  const tree = useMemo(() => buildTree(beans, orphaned), [beans, orphaned]);
  const { milestones, roots } = useMemo(() => {
    if (!typeFilter || typeFilter.length === 0) {
      return tree;
    }
    const matches = (bean: BeanListItem) => typeFilter.includes(bean.type);
    return {
      milestones: pruneTreeToMatches(tree.milestones, matches, orphaned),
      roots: pruneTreeToMatches(tree.roots, matches, orphaned),
    };
  }, [tree, typeFilter, orphaned]);

  const topNodes = useMemo(() => {
    const nodes = [...milestones, ...roots];
    if (!sort) return nodes;
    const cmp = beanComparator(sort, dir ?? "asc");
    return [...nodes].sort((a, b) => cmp(a.bean, b.bean));
  }, [milestones, roots, sort, dir]);

  // Expanded ids, not collapsed ones: absence means collapsed, which is the
  // default we want, so a node appearing for the first time needs no seeding —
  // and there is no seeding step left to re-fire when the data refetches.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() =>
    readStringSet(expandedStorageKey(project)),
  );

  useEffect(() => {
    setExpanded(readStringSet(expandedStorageKey(project)));
  }, [project]);

  function toggle(id: string) {
    setExpanded((current) => {
      const next = toggleId(current, id);
      const pruned = new Set([...next].filter((value) => knownIds.has(value)));
      writeStringSet(expandedStorageKey(project), pruned);
      return pruned;
    });
  }

  // A single recursive renderer is used on every viewport so collapsing any
  // parent hides its entire subtree, regardless of nesting depth. Rows with
  // no children render no caret (and no reserved caret column), so top-level
  // childless beans sit flush against the left edge; nesting indent comes
  // only from paddingLeft.
  function renderNode(node: BeanNode): ReactNode {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.bean.id);
    const isSection = hasChildren && SECTION_TYPES.includes(node.bean.type);
    const rowClass = isSection
      ? `hierarchy-row hierarchy-row--section hierarchy-row--section-${node.bean.type}`
      : "hierarchy-row";
    return (
      <li key={node.bean.id} className="hierarchy-node" data-depth={node.depth}>
        <div className={rowClass} style={{ paddingLeft: `calc(${node.depth} * var(--indent))` }}>
          {hasChildren ? (
            <button
              type="button"
              className="hierarchy-caret"
              aria-label={isExpanded ? `Collapse ${node.bean.title}` : `Expand ${node.bean.title}`}
              aria-expanded={isExpanded}
              onClick={() => {
                toggle(node.bean.id);
              }}
            >
              {isExpanded ? "▾" : "▸"}
            </button>
          ) : null}
          <BeanRow
            project={project}
            bean={node.bean}
            orphaned={orphaned.has(node.bean.id)}
          />
          {node.orphanedDescendants > 0 && (
            <span className="hierarchy-orphan-count">⚠ {node.orphanedDescendants} orphaned</span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <ul className="hierarchy-children">{node.children.map((child) => renderNode(child))}</ul>
        )}
      </li>
    );
  }

  return (
    <ul className="hierarchy-list hierarchy-roots">{topNodes.map((node) => renderNode(node))}</ul>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/components/HierarchyList.test.tsx`

Expected: PASS. Pre-existing tests that asserted "starts collapsed" still hold — absence from storage means collapsed.

- [ ] **Step 5: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`

`projectList.tsx` does not yet pass `orphaned`/`knownIds`, so typecheck fails here. Add the two props at the `HierarchyList` call site with placeholder-free real values that Task 9 then refines:

```tsx
        orphaned={new Set<string>()}
        knownIds={new Set((beans ?? []).map((b) => b.id))}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/HierarchyList.tsx apps/web/src/components/HierarchyList.test.tsx apps/web/src/routes/projectList.tsx
git commit -m "fix(web): persist hierarchy expand state across refetches"
```

---

## Task 9: Unfiltered fetch and client-side filtering in `ProjectList`

The atomic switch. One query per project, everything else derived in the browser.

**Files:**

- Modify: `apps/web/src/hooks/useBeans.ts` (whole file)
- Modify: `apps/web/src/hooks/useBeans.test.tsx`
- Modify: `apps/web/src/routes/projectList.tsx`
- Modify: `apps/web/src/routes/beanDetail.tsx` (the `candidates` query only)
- Modify: `apps/web/src/components/RelationEditor.tsx`, `BeanPicker.tsx`, `CreateBeanForm.tsx` (candidate prop types)

**Interfaces:**

- Consumes: `applyFilter`, `BeanFilterInput`, `DEFAULT_BEAN_FILTER` (Task 4); `orphanedIds` (Task 5); `withAncestors` (Task 6); `sortBeans` (Task 3); `HierarchyList`/`FlatList` props (Tasks 7-8).
- Produces: `useProjectBeans(project: string, search: string): UseQueryResult<BeanListItem[]>`. `useBeans`, `toGraphqlFilter`, and the `BeanFilter` import are **removed**.

- [ ] **Step 1: Write the failing test**

Rewrite `apps/web/src/hooks/useBeans.test.tsx`, keeping the existing `wrapper` and `sentFilter` helpers:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useProjectBeans } from "./useBeans.js";

import type { BeanListItem } from "@beans-frontend/shared";
import type { ReactNode } from "react";

afterEach(() => vi.restoreAllMocks());

const bean: BeanListItem = {
  id: "t-1",
  slug: null,
  path: "",
  title: "Task One",
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

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ data: { beans: [bean] } }), {
      headers: { "content-type": "application/json" },
    }),
  );
}

function sentBody(fetchMock: ReturnType<typeof mockFetch>): { query: string; variables: unknown } {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error("fetch was not called");
  const init = call[1];
  if (!init || typeof init.body !== "string") throw new Error("request body was not a JSON string");
  return JSON.parse(init.body) as { query: string; variables: unknown };
}

describe("useProjectBeans", () => {
  it("sends an empty filter when there is no search text", async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useProjectBeans("demo", ""), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(sentBody(fetchMock).variables).toEqual({ filter: {} });
  });

  it("sends only the trimmed search term when there is one", async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useProjectBeans("demo", "  login~2  "), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(sentBody(fetchMock).variables).toEqual({ filter: { search: "login~2" } });
  });

  it("does not request the bean body", async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useProjectBeans("demo", ""), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(sentBody(fetchMock).query).not.toMatch(/\bbody\b/);
  });

  it("returns the beans from the response", async () => {
    mockFetch();
    const { result } = renderHook(() => useProjectBeans("demo", ""), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([bean]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/hooks/useBeans.test.tsx`

Expected: FAIL — `useProjectBeans` is not exported.

- [ ] **Step 3: Rewrite `useBeans.ts`**

Replace the contents of `apps/web/src/hooks/useBeans.ts` with:

```ts
import { useQuery } from "@tanstack/react-query";

import { projectGraphql } from "../api/client.js";

import type { UseQueryResult } from "@tanstack/react-query";
import type { BeanListItem } from "@beans-frontend/shared";

// `body` is deliberately absent: no list row renders it, and leaving it out is
// what makes fetching a whole project at once cheap. The detail view fetches
// its own body through BEAN_DETAIL_QUERY.
const BEANS_QUERY = `
  query Beans($filter: BeanFilter) {
    beans(filter: $filter) {
      id
      slug
      path
      title
      status
      type
      priority
      tags
      createdAt
      updatedAt
      etag
      parentId
      blockingIds
      blockedByIds
    }
  }
`;

interface BeansQueryResult {
  beans: BeanListItem[];
}

/**
 * Fetches every bean in a project in one query.
 *
 * Only `search` goes over the wire — it is Bleve query syntax (fuzzy,
 * wildcard, phrase, boolean, field-scoped) and cannot be reproduced in the
 * browser. Type/status/priority/tags/prefix are applied client-side from this
 * single dataset, which is what lets the UI resolve a completed parent's
 * status and keeps the dataset identity stable when filters change.
 */
export function useProjectBeans(project: string, search: string): UseQueryResult<BeanListItem[]> {
  const trimmed = search.trim();
  return useQuery({
    queryKey: ["beans", project, trimmed],
    queryFn: async () => {
      const data = await projectGraphql<BeansQueryResult>(project, BEANS_QUERY, {
        filter: trimmed.length > 0 ? { search: trimmed } : {},
      });
      return data.beans;
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/hooks/useBeans.test.tsx`

Expected: PASS.

- [ ] **Step 5: Rewire `ProjectList`**

In `apps/web/src/routes/projectList.tsx`:

Update imports:

```tsx
import { useProjectBeans } from "../hooks/useBeans.js";
import { applyFilter, DEFAULT_BEAN_FILTER } from "../lib/filter.js";
import { withAncestors } from "../lib/hierarchy.js";
import { orphanedIds } from "../lib/orphan.js";
import { beanPrefix, distinctPrefixes } from "../lib/prefix.js";
import { sortBeans } from "../lib/sort.js";

import type { BeanFilterInput } from "../lib/filter.js";
```

Replace the `filter` / `serverFilter` / `useBeans` block and both `useMemo`s with:

```tsx
  // `search` is structurally memoized by TanStack Router, so this identity is
  // stable while the URL params are — which keeps every derived memo below
  // from recomputing on unrelated re-renders.
  const filter: BeanFilterInput = useMemo(
    () => ({
      type: search.type ?? [],
      // With no status param present, default to the open statuses so
      // completed/scrapped beans are hidden until explicitly requested.
      status: search.status ?? [...DEFAULT_BEAN_FILTER.status],
      priority: search.priority ?? [],
      tags: search.tags ?? [],
      prefix: search.prefix ?? [],
      search: search.search ?? "",
    }),
    [search],
  );

  const { data: allBeans, isPending, isError } = useProjectBeans(project, filter.search);

  const prefixOptions = allBeans ? distinctPrefixes(allBeans) : [];

  // Orphan status is computed from the FULL project dataset, never a filtered
  // subset — a parent missing because of a filter is not an orphaning parent.
  const orphaned = useMemo(() => orphanedIds(allBeans ?? []), [allBeans]);
  const knownIds = useMemo(() => new Set((allBeans ?? []).map((b) => b.id)), [allBeans]);

  const flatBeans = useMemo(
    () => (allBeans ? applyFilter(allBeans, filter) : []),
    [allBeans, filter],
  );

  // In hierarchy view the type filter is applied by HierarchyList's prune so
  // ancestor milestones/epics stay visible as section context, and the prefix
  // filter keeps ancestors via withAncestors for the same reason. Both are
  // therefore excluded here and reapplied inside the tree.
  const hierarchyBeans = useMemo(() => {
    if (!allBeans) return [];
    const base = applyFilter(allBeans, { ...filter, type: [], prefix: [] });
    if (filter.prefix.length === 0) return base;
    const matched = base.filter((bean) => filter.prefix.includes(beanPrefix(bean.id)));
    return withAncestors(matched, base);
  }, [allBeans, filter]);
```

Replace `renderList` with:

```tsx
  function renderList() {
    if (isPending) {
      return <p className="muted">Loading beans…</p>;
    }
    if (isError) {
      return <p className="muted">Failed to load beans.</p>;
    }
    if (view === "flat") {
      if (flatBeans.length === 0) {
        return <p className="muted">No beans match the current filters.</p>;
      }
      return (
        <FlatList
          project={project}
          beans={sortBeans(flatBeans, search.sort, search.dir ?? "asc")}
          orphaned={orphaned}
        />
      );
    }
    if (hierarchyBeans.length === 0) {
      return <p className="muted">No beans match the current filters.</p>;
    }
    return (
      <HierarchyList
        project={project}
        beans={hierarchyBeans}
        orphaned={orphaned}
        knownIds={knownIds}
        typeFilter={filter.type}
        sort={search.sort}
        dir={search.dir}
      />
    );
  }
```

- [ ] **Step 6: Rewire the detail page's candidate query**

In `apps/web/src/routes/beanDetail.tsx`, replace the `useBeans(project, EMPTY_BEAN_FILTER)` call with:

```tsx
  const { data: candidates } = useProjectBeans(project, "");
```

and update the import. This now hits the same cache entry the list already populated, so opening a bean no longer triggers a second full project fetch.

Change `BeanDetailContentProps.candidates` from `Bean[]` to `BeanListItem[]`, and change the `candidates` prop type on `RelationEditor`, `BeanPicker`, and `CreateBeanForm` from `Bean[]` to `BeanListItem[]`. Update their test fixtures to drop `body`.

- [ ] **Step 7: Update `ProjectList`'s tests**

In `apps/web/src/routes/projectList.test.tsx`, any assertion on the GraphQL request body's `variables.filter` must now expect `{}` or `{ search: "…" }` only. Assertions that a status/type filter reaches the server become assertions that the rendered list is filtered. Drop `body` from the bean fixtures.

- [ ] **Step 8: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`

Expected: all green. If `pnpm test` reports a coverage threshold failure, add the missing tests rather than lowering the threshold.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/hooks/useBeans.ts apps/web/src/hooks/useBeans.test.tsx apps/web/src/routes/projectList.tsx apps/web/src/routes/projectList.test.tsx apps/web/src/routes/beanDetail.tsx apps/web/src/components/RelationEditor.tsx apps/web/src/components/BeanPicker.tsx apps/web/src/components/CreateBeanForm.tsx
git commit -m "fix(web): fetch a project's beans once and filter client-side"
```

---

## Task 10: `useReopenAncestors` mutation hook

**Files:**

- Modify: `apps/web/src/hooks/useMutations.ts` (append)
- Modify: `apps/web/src/hooks/useMutations.test.tsx` (append)

**Interfaces:**

- Consumes: `projectGraphql`, `UPDATE_BEAN_MUTATION`.
- Produces:
  - `class ReopenPartialFailure extends Error { readonly reopenedIds: string[] }`
  - `interface ReopenAncestorsVariables { ancestorIds: string[]; status: BeanStatus }`
  - `useReopenAncestors(project: string): UseMutationResult<{ reopenedIds: string[] }, Error, ReopenAncestorsVariables>`

Note: no `etag` is threaded through. The file's existing comment records that the installed `beans` binary rejects every `ifMatch`, so `useUpdateBean` already drops it — carrying an etag here would be dead data.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/hooks/useMutations.test.tsx`:

```tsx
describe("useReopenAncestors", () => {
  function mockGraphql(failOnId?: string) {
    return vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body)) as {
        variables: { id: string };
      };
      if (body.variables.id === failOnId) {
        return Promise.resolve(
          new Response(JSON.stringify({ errors: [{ message: "write failed" }] }), {
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ data: { updateBean: { id: body.variables.id, etag: "e" } } }),
          { headers: { "content-type": "application/json" } },
        ),
      );
    });
  }

  it("updates every ancestor to the given status, in order", async () => {
    const fetchMock = mockGraphql();
    const { result } = renderHook(() => useReopenAncestors("demo"), { wrapper });

    result.current.mutate({ ancestorIds: ["e-1", "m-1"], status: "in-progress" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const sent = fetchMock.mock.calls.map((call) => {
      const parsed = JSON.parse(String((call[1] as RequestInit).body)) as {
        variables: { id: string; input: { status: string } };
      };
      return parsed.variables;
    });
    expect(sent).toEqual([
      { id: "e-1", input: { status: "in-progress" } },
      { id: "m-1", input: { status: "in-progress" } },
    ]);
    expect(result.current.data?.reopenedIds).toEqual(["e-1", "m-1"]);
  });

  it("stops on failure and reports which ancestors were re-opened", async () => {
    const fetchMock = mockGraphql("m-1");
    const { result } = renderHook(() => useReopenAncestors("demo"), { wrapper });

    result.current.mutate({ ancestorIds: ["e-1", "m-1", "m-0"], status: "todo" });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // Third ancestor never attempted.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const error = result.current.error;
    expect(error).toBeInstanceOf(ReopenPartialFailure);
    expect((error as ReopenPartialFailure).reopenedIds).toEqual(["e-1"]);
    expect(describeMutationError(error)).toContain("e-1");
  });
});
```

Add `ReopenPartialFailure` and `useReopenAncestors` to the file's imports from `./useMutations.js`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/hooks/useMutations.test.tsx`

Expected: FAIL — `useReopenAncestors` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `apps/web/src/hooks/useMutations.ts`:

```ts
/**
 * Thrown when a multi-ancestor re-open fails partway. There is no transaction
 * to roll back with, so the ancestors already written stay written and are
 * named in the message.
 */
export class ReopenPartialFailure extends Error {
  constructor(
    readonly reopenedIds: string[],
    cause: unknown,
  ) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      reopenedIds.length > 0
        ? `Re-opened ${reopenedIds.join(", ")}, then failed: ${detail}`
        : `Re-open failed: ${detail}`,
    );
    this.name = "ReopenPartialFailure";
  }
}

export interface ReopenAncestorsVariables {
  /** Ancestor ids, nearest first — the order `closedAncestors` returns. */
  ancestorIds: string[];
  status: BeanStatus;
}

/**
 * Re-opens each ancestor to `status`, one at a time. Every call spawns a
 * `beans` process writing into the same project directory, so serializing the
 * writes avoids racing them. Invalidates once, after the chain settles.
 */
export function useReopenAncestors(
  project: string,
): UseMutationResult<{ reopenedIds: string[] }, Error, ReopenAncestorsVariables> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: ReopenAncestorsVariables) => {
      const reopenedIds: string[] = [];
      for (const id of v.ancestorIds) {
        try {
          await projectGraphql<{ updateBean: MutatedBean }>(project, UPDATE_BEAN_MUTATION, {
            id,
            input: { status: v.status },
          });
        } catch (err) {
          throw new ReopenPartialFailure(reopenedIds, err);
        }
        reopenedIds.push(id);
      }
      return { reopenedIds };
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["beans", project] });
      void qc.invalidateQueries({ queryKey: ["bean", project] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
```

Add `BeanStatus` to the file's type imports:

```ts
import type { BeanStatus } from "@beans-frontend/shared";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/hooks/useMutations.test.tsx`

Expected: PASS.

- [ ] **Step 5: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useMutations.ts apps/web/src/hooks/useMutations.test.tsx
git commit -m "feat(web): add sequential re-open mutation for closed ancestors"
```

---

## Task 11: Orphan warning and re-open action on the detail page

**Files:**

- Modify: `apps/web/src/components/ConfirmDialog.tsx:5-12` and its message element
- Modify: `apps/web/src/routes/beanDetail.tsx`
- Modify: `apps/web/src/routes/beanDetail.test.tsx` (append)
- Modify: `apps/web/src/theme/global.css` (append)

**Interfaces:**

- Consumes: `isOrphaned`, `closedAncestors`, `indexById` (Task 5); `useReopenAncestors` (Task 10); `ConfirmDialog`.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/routes/beanDetail.test.tsx`, following the mocking style already used there:

```tsx
describe("orphan warning", () => {
  it("renders no warning when the parent is open", async () => {
    // bean t-1 (todo) under epic e-1 (todo)
    renderDetail({ beanStatus: "todo", parentStatus: "todo" });
    await screen.findByText("Fix SSE reconnect");
    expect(screen.queryByRole("button", { name: /re-open/i })).not.toBeInTheDocument();
  });

  it("names the completed parent and offers a re-open button", async () => {
    renderDetail({ beanStatus: "in-progress", parentStatus: "completed" });
    expect(await screen.findByRole("button", { name: "Re-open parent" })).toBeInTheDocument();
    expect(screen.getByText(/Docker setup/)).toBeInTheDocument();
  });

  it("labels the button with the ancestor count when the chain is longer", async () => {
    renderDetail({
      beanStatus: "in-progress",
      parentStatus: "completed",
      grandparentStatus: "scrapped",
    });
    expect(await screen.findByRole("button", { name: "Re-open 2 ancestors" })).toBeInTheDocument();
  });

  it("lists every ancestor and its target status in the confirm dialog", async () => {
    const user = userEvent.setup();
    renderDetail({
      beanStatus: "in-progress",
      parentStatus: "completed",
      grandparentStatus: "scrapped",
    });

    await user.click(await screen.findByRole("button", { name: "Re-open 2 ancestors" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/e-1/)).toBeInTheDocument();
    expect(within(dialog).getByText(/m-1/)).toBeInTheDocument();
    expect(within(dialog).getAllByText(/in-progress/).length).toBeGreaterThan(0);
  });

  it("re-opens the ancestors on confirm, nearest first", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderDetail({
      beanStatus: "in-progress",
      parentStatus: "completed",
      grandparentStatus: "scrapped",
    });

    await user.click(await screen.findByRole("button", { name: "Re-open 2 ancestors" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByText("Re-open"));

    await waitFor(() => {
      const updates = fetchMock.mock.calls
        .map((call) => JSON.parse(String((call[1] as RequestInit).body)) as { variables?: { id?: string; input?: { status?: string } } })
        .filter((body) => body.variables?.input?.status !== undefined);
      expect(updates.map((u) => u.variables?.id)).toEqual(["e-1", "m-1"]);
      expect(updates[0]?.variables?.input?.status).toBe("in-progress");
    });
  });
});
```

Write a `renderDetail({ beanStatus, parentStatus, grandparentStatus })` helper in the test file that mocks `fetch` to answer the bean-detail query with bean `t-1` titled `Fix SSE reconnect` (parent `e-1`), and the project beans query with `e-1` titled `Docker setup` (parent `m-1`, status `parentStatus`) and `m-1` titled `Q3 launch` (status `grandparentStatus`, defaulting to `todo`). Return the fetch spy.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/routes/beanDetail.test.tsx`

Expected: FAIL — no re-open button exists.

- [ ] **Step 3: Let `ConfirmDialog` render a node**

In `apps/web/src/components/ConfirmDialog.tsx`, change the prop type and the element (a `<ul>` inside a `<p>` is invalid HTML):

```tsx
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
```

```tsx
  message?: ReactNode;
```

```tsx
        {message && <div className="confirm-dialog-message">{message}</div>}
```

- [ ] **Step 4: Add the warning and action to `BeanDetailContent`**

Add imports to `apps/web/src/routes/beanDetail.tsx`:

```tsx
import { closedAncestors, indexById, isOrphaned } from "../lib/orphan.js";
import { useReopenAncestors } from "../hooks/useMutations.js";
```

Inside `BeanDetailContent`, after the other mutation hooks:

```tsx
  const reopenAncestors = useReopenAncestors(project);
  const [isConfirmingReopen, setIsConfirmingReopen] = useState(false);

  // `candidates` is the full project dataset minus this bean, so it resolves
  // the parent chain — and orphan status is computed against all of it, never
  // a filtered subset.
  const byId = useMemo(() => indexById(candidates), [candidates]);
  const ancestorsToReopen = useMemo(
    () => (isOrphaned(bean, byId) ? closedAncestors(bean, byId) : []),
    [bean, byId],
  );
```

Add `reopenAncestors` to the `mutations` array so its errors surface in the existing banner.

Add the handler beside the other handlers:

```tsx
  function handleReopenConfirmed() {
    setIsConfirmingReopen(false);
    reopenAncestors.mutate({
      ancestorIds: ancestorsToReopen.map((ancestor) => ancestor.id),
      status: bean.status,
    });
  }
```

Render the warning immediately after the `mutationError` block:

```tsx
      {ancestorsToReopen.length > 0 && (
        <div className="bean-detail-orphan" role="status">
          <p>
            Orphaned — parent <span className="bean-id">{ancestorsToReopen[0]!.id}</span>{" "}
            “{ancestorsToReopen[0]!.title}” is {ancestorsToReopen[0]!.status}.
          </p>
          <button type="button" onClick={() => setIsConfirmingReopen(true)}>
            {ancestorsToReopen.length > 1
              ? `Re-open ${ancestorsToReopen.length} ancestors`
              : "Re-open parent"}
          </button>
        </div>
      )}
```

And the dialog, beside the existing delete `ConfirmDialog`:

```tsx
      <ConfirmDialog
        open={isConfirmingReopen}
        title={
          ancestorsToReopen.length > 1
            ? `Re-open ${ancestorsToReopen.length} ancestors?`
            : "Re-open parent?"
        }
        message={
          <ul className="confirm-dialog-list">
            {ancestorsToReopen.map((ancestor) => (
              <li key={ancestor.id}>
                <span className="bean-id">{ancestor.id}</span> “{ancestor.title}” —{" "}
                {ancestor.status} → {bean.status}
              </li>
            ))}
          </ul>
        }
        confirmLabel="Re-open"
        onConfirm={handleReopenConfirmed}
        onCancel={() => setIsConfirmingReopen(false)}
      />
```

Add `useMemo` to the React import if it is not already there.

- [ ] **Step 5: Style the warning**

Append to `apps/web/src/theme/global.css`:

```css
.bean-detail-orphan {
  align-items: center;
  border: 1px solid var(--warn);
  border-radius: 0.3rem;
  color: var(--warn);
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: space-between;
  margin-block: 1rem;
  padding: 0.6rem 0.8rem;
}

.confirm-dialog-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.confirm-dialog-list li {
  padding-block: 0.15rem;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @beans-frontend/web exec vitest run src/routes/beanDetail.test.tsx src/components/ConfirmDialog.test.tsx`

Expected: PASS.

- [ ] **Step 7: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/ConfirmDialog.tsx apps/web/src/routes/beanDetail.tsx apps/web/src/routes/beanDetail.test.tsx apps/web/src/theme/global.css
git commit -m "feat(web): offer re-opening closed ancestors from an orphaned bean"
```

---

## Task 12: Sort discovered projects by name

The Overview ledger renders directory-walk order, and `useEvents` invalidates `["projects"]` on every file change — the same reshuffle exposure, from the server side.

**Files:**

- Modify: `apps/server/src/discovery/scan.ts` (`discoverProjects` return)
- Modify: `apps/server/src/discovery/scan.test.ts` (append)

**Interfaces:**

- Consumes: nothing new.
- Produces: `discoverProjects` returns projects sorted by `name` ascending. Signature unchanged.

- [ ] **Step 1: Write the failing test**

Append to `apps/server/src/discovery/scan.test.ts`, using the file's existing fixture/mocking style:

```ts
describe("discoverProjects ordering", () => {
  it("returns projects sorted by name regardless of walk order", async () => {
    // Fixture: three project dirs whose filesystem walk order is not alphabetical.
    const projects = await discoverProjects(root, 2);
    expect(projects.map((p) => p.name)).toEqual([...projects.map((p) => p.name)].sort());
  });
});
```

Build the fixture so at least two directory names would come back out of alphabetical order from `readdir` — for example create `zeta`, `alpha`, and `mid` project dirs and assert the result is `["alpha", "mid", "zeta"]`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @beans-frontend/server exec vitest run src/discovery/scan.test.ts`

Expected: FAIL — order follows the walk, not the name.

- [ ] **Step 3: Sort the result**

In `apps/server/src/discovery/scan.ts`, change the end of `discoverProjects` from returning `mapWithConcurrency(...)` directly to:

```ts
  const projects = await mapWithConcurrency(dirs, BEANS_CONCURRENCY, async (dir) => {
    // ...unchanged body...
  });
  // Stable, name-ordered output: the Overview ledger renders this list directly
  // and is invalidated on every file change, so walk order would reshuffle it.
  return projects.sort((a, b) => a.name.localeCompare(b.name));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @beans-frontend/server exec vitest run src/discovery/scan.test.ts`

Expected: PASS.

- [ ] **Step 5: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/discovery/scan.ts apps/server/src/discovery/scan.test.ts
git commit -m "fix(server): return discovered projects in name order"
```

---

## Task 13: Full-suite verification

**Files:** none created; fixes applied wherever the checks land.

- [ ] **Step 1: Run every gate the CI workflow runs**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage && pnpm knip && pnpm spell
```

Expected: all green. Redirect to a file and read it rather than piping through truncating commands if output is long.

- [ ] **Step 2: Fix what fails**

- `knip` flags unused exports — most likely `collectCollapsibleIds` (deleted in Task 6) or a helper in `filter`/`orphan`/`storage` with no consumer. Delete genuinely dead exports; wire up anything that should have a consumer.
- Coverage below 80% on a new module — add the missing tests. Never lower a threshold.
- `spell` flags a new word — add it to `cspell.config.yaml`.

- [ ] **Step 3: Confirm both bugs are actually fixed, in the running app**

```bash
pnpm dev
```

With a project open in hierarchy view:

1. Expand a couple of nodes. Edit any `.beans` markdown file in that project on disk. Confirm the list refreshes **without** collapsing and **without** reordering.
2. Reload the page. Confirm the expansions are still there.
3. Find (or create) an open bean whose parent is `completed`. Confirm it shows an `orphaned` badge, and that its ancestor row shows `⚠ N orphaned` while collapsed.
4. Add `completed` to the status filter. Confirm the bean nests under its parent and still shows the badge, and the parent still shows the count.
5. Open the orphan's detail page, click the re-open button, confirm the dialog lists the ancestors, confirm, and check the parent's status changed on disk.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "test: close coverage gaps from list stability work"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| Types (`BeanListItem` split) | 1 |
| Fetching (`useProjectBeans`, drop `body`, shared cache entry) | 9 |
| Client-side filtering (`filter.ts`, port-before-delete) | 4, 9 |
| Ordering (`defaultComparator`, natural id, tiebreak, child order) | 3, 6 |
| Ordering (`discoverProjects` sorted) | 12 |
| Orphan model (`orphan.ts`, completed + scrapped) | 5 |
| Collapse persistence (expanded ids, pruning, `storage.ts`) | 2, 8 |
| Orphan UI (badge, recursive counts, `--warn` token) | 7, 8 |
| Re-open parent (chain walk, confirm, sequential, partial failure) | 5, 10, 11 |
| Testing (shuffle-determinism, refetch-survives-expansion) | 3, 8 |

No spec requirement is unassigned.

**Type consistency:** `BeanListItem` is the list-facing type from Task 1 onward. `orphaned` is `ReadonlySet<string>` in `HierarchyList`, `FlatList`, `buildTree`, and `pruneTreeToMatches`; `orphanedIds` returns `Set<string>`, which satisfies it. `closedAncestors` returns nearest-first, which Task 10 consumes as `ancestorIds` and Task 11 indexes `[0]` for the warning text — consistent. `sortBeans`'s `key` is optional from Task 3 on, which Task 9 relies on when `search.sort` is `undefined`.

**Ordering note:** Task 6 Step 5 and Task 8 Step 5 each patch a call site to keep the intermediate commit compiling. Both are replaced by their final form in the following task — they are real working code, not stubs.
