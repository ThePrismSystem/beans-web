# beans-frontend UX Polish v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix data correctness (open-work counts), remove duplicate projects, rework filtering to multi-select + a dynamic prefix facet, add a header search bar, clean up the hierarchy and bean-detail views, replace relationship dropdowns with a searchable picker, and finish mobile touch-sizing.

**Architecture:** Frontend-heavy pass on the React 19 + Vite app, plus one additive server counts field. Discovery depth drops to 1. Filtering stays server-side except the new client-side prefix facet. New reusable components: `CheckboxMenu`, `InlineEditRow`, `BeanPicker`. Everything continues on branch `fix/mobile-responsive-a11y`.

**Tech Stack:** TypeScript, React 19, TanStack Query + Router, Vitest + Testing Library, Playwright, Hono (server), Zod, pnpm workspaces.

## Global Constraints

- Branch: `fix/mobile-responsive-a11y` (do NOT create a new branch).
- No `eslint-disable`, no `as any`, no `as unknown as` double-casts. Extract magic numbers to named constants.
- Conventional Commits (`type(scope): description`, imperative, ≤72 chars, no period, no emoji, no AI attribution).
- Coverage gate: ≥80% lines/functions/branches/statements per package (Vitest v8). Every new module needs its own test.
- Design language: warm editorial palette — CSS custom properties from `apps/web/src/theme/tokens.css` (`--paper`, `--ink`, `--hairline`, `--muted`, `--accent`, `--t-*`, `--s-*`); serif titles, hairline rules, type-colored tags, status dots. No new palette.
- `OPEN_STATUSES` = `["draft", "todo", "in-progress"]` (from `@beans-frontend/shared`).
- Run the local gate before pushing: `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm -r test`, `pnpm -r test:coverage`, `pnpm knip`, `pnpm spell`, `pnpm -r build`, and the Playwright E2E in `apps/web`.
- Commit after each task's tests pass.

---

## File Structure

**Server / shared:**
- `apps/server/src/env.ts` — `SCAN_DEPTH` default 4 → 1 (modify).
- `packages/shared/src/types.ts` — add `openByType` to `ProjectCounts` (modify).
- `apps/server/src/discovery/scan.ts` — tally `openByType` (modify).
- `apps/server/src/testing/fixtures.ts` — `openByType` in `fakeCounts` (modify).

**Web — lib/hooks:**
- `apps/web/src/lib/prefix.ts` — `beanPrefix(id)`, `distinctPrefixes(beans)` (create).
- `apps/web/src/hooks/useBeans.ts` — add `prefix` to `BeanFilterInput`, add `DEFAULT_BEAN_FILTER` (modify).

**Web — filter UI:**
- `apps/web/src/components/CheckboxMenu.tsx` — reusable multi-select popover (create).
- `apps/web/src/components/FilterBar.tsx` — popovers + prefix + tags sizing (rewrite).
- `apps/web/src/routes/projectList.tsx` — default filter, prefix search param, client-side prefix prune (modify).

**Web — overview & search:**
- `apps/web/src/routes/overview.tsx` — ledger rows (rewrite `ProjectCard`).
- `apps/web/src/components/HeaderSearch.tsx` — header search input + dropdown (create).
- `apps/web/src/components/AppShell.tsx` — mount `HeaderSearch` (modify).

**Web — hierarchy:**
- `apps/web/src/lib/hierarchy.ts` — expose collapsible-id collection helper (modify).
- `apps/web/src/components/HierarchyList.tsx` — collapse-on-load, linked section headers, flush-left (modify).
- `apps/web/src/components/SectionHeaderRow.tsx` — linked bean row for section headers (create).

**Web — bean detail:**
- `apps/web/src/components/InlineEditRow.tsx` — label + value + pencil→control + dirty Save/Cancel (create).
- `apps/web/src/routes/beanDetail.tsx` — header via `InlineEditRow`, body edit/save toggle (modify).
- `apps/web/src/components/BeanPicker.tsx` — searchable/filterable bean chooser modal (create).
- `apps/web/src/components/RelationEditor.tsx` — use `BeanPicker` (rewrite).

**Web — styling:**
- `apps/web/src/theme/global.css` — ledger rows, popover, header search, section tint, inline-edit, picker, mobile sizing (modify).

---

## Task 1: Discovery depth default → 1

**Files:**
- Modify: `apps/server/src/env.ts`
- Test: `apps/server/src/env.test.ts` (create if absent)

**Interfaces:**
- Produces: `env.SCAN_DEPTH` defaults to `1`.

- [ ] **Step 1: Write the failing test**

Create/append `apps/server/src/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("env SCAN_DEPTH", () => {
  it("defaults SCAN_DEPTH to 1 when unset", async () => {
    const before = process.env.SCAN_DEPTH;
    delete process.env.SCAN_DEPTH;
    const { env } = await import("./env.js");
    expect(env.SCAN_DEPTH).toBe(1);
    if (before !== undefined) process.env.SCAN_DEPTH = before;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/server test env`
Expected: FAIL (`expected 4 to be 1`).

- [ ] **Step 3: Implement**

In `apps/server/src/env.ts`, change the `SCAN_DEPTH` line:

```ts
    SCAN_DEPTH: z.coerce.number().int().min(1).max(8).default(1),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @beans-frontend/server test env`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/env.ts apps/server/src/env.test.ts
git commit -m "fix(server): default discovery depth to 1"
```

---

## Task 2: `openByType` counts on ProjectCounts

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `apps/server/src/discovery/scan.ts:46-53` (`emptyCounts`) and the tally loop (`:66-71`)
- Modify: `apps/server/src/testing/fixtures.ts` (`fakeCounts`)
- Test: `apps/server/src/discovery/scan.integration.test.ts` (extend)

**Interfaces:**
- Produces: `ProjectCounts.openByType: Record<BeanType, number>` — open beans (status ∈ OPEN_STATUSES) per type.

- [ ] **Step 1: Add the field to the shared type**

In `packages/shared/src/types.ts`, inside `ProjectCounts`, add after `byStatus`:

```ts
  /** Open beans (status in OPEN_STATUSES) grouped by type — the remaining-work view. */
  openByType: Record<BeanType, number>;
```

- [ ] **Step 2: Write the failing test**

In `apps/server/src/discovery/scan.integration.test.ts`, extend the first case (seeded project). After the existing `expect(project?.counts.total)...` line, add:

```ts
    // one seeded open task -> openByType.task >= 1, and open <= total
    expect(project?.counts.openByType.task).toBeGreaterThanOrEqual(1);
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/server test scan.integration`
Expected: FAIL (`openByType` is undefined).

- [ ] **Step 4: Implement in scan.ts**

Update `emptyCounts()`:

```ts
function emptyCounts(): ProjectCounts {
  return {
    total: 0,
    open: 0,
    byType: zeroCounts(BEAN_TYPES),
    byStatus: zeroCounts(BEAN_STATUSES),
    openByType: zeroCounts(BEAN_TYPES),
    error: false,
  };
}
```

In the tally loop inside `discoverProjects`, add the open-by-type increment:

```ts
      for (const b of data.beans) {
        counts.total += 1;
        counts.byType[b.type] += 1;
        counts.byStatus[b.status] += 1;
        if (OPEN_STATUSES.includes(b.status)) {
          counts.open += 1;
          counts.openByType[b.type] += 1;
        }
      }
```

- [ ] **Step 5: Update fixtures**

In `apps/server/src/testing/fixtures.ts`, add `openByType` to `fakeCounts`:

```ts
function fakeCounts(): ProjectCounts {
  return {
    total: 0,
    open: 0,
    byType: zeroCounts(BEAN_TYPES),
    byStatus: zeroCounts(BEAN_STATUSES),
    openByType: zeroCounts(BEAN_TYPES),
    error: false,
  };
}
```

- [ ] **Step 6: Fix web test fixtures that build ProjectCounts literals**

These build `counts` inline and now need `openByType`. In each, add `openByType: { milestone: 0, epic: 0, feature: 0, task: 0, bug: 0 },` next to `byStatus`:
- `apps/web/src/components/AppShell.test.tsx`
- `apps/web/src/components/Sidebar.test.tsx`
- `apps/web/src/hooks/useProjects.test.tsx`
- `apps/web/src/routes/overview.test.tsx`

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @beans-frontend/server test scan.integration && pnpm --filter @beans-frontend/web test AppShell Sidebar useProjects overview && pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/types.ts apps/server/src/discovery/scan.ts apps/server/src/testing/fixtures.ts apps/web/src/components/AppShell.test.tsx apps/web/src/components/Sidebar.test.tsx apps/web/src/hooks/useProjects.test.tsx apps/web/src/routes/overview.test.tsx
git commit -m "feat(shared): add open-by-type counts to project discovery"
```

---

## Task 3: Overview ledger rows

**Files:**
- Modify: `apps/web/src/routes/overview.tsx` (rewrite `ProjectCard` → `ProjectRow`)
- Modify: `apps/web/src/theme/global.css` (ledger styles; remove `.project-card`/`.project-grid`/`.project-types`/`.project-type-chip`/`.project-type-count`/`.project-counts` rules)
- Modify: `apps/web/src/routes/overview.test.tsx`

**Interfaces:**
- Consumes: `project.counts.openByType`, `project.counts.open`, `project.counts.total`.

- [ ] **Step 1: Write the failing test**

Replace the render assertions in `overview.test.tsx` so it checks open-by-type + pipes + open·total. Add/replace a test:

```ts
  it("renders a ledger row with open-by-type and open/total", async () => {
    useProjectsMock.mockReturnValue({ data: [project], isPending: false, isError: false });
    renderWithRouter(<Overview />);
    expect(await screen.findByText(project.name)).toBeInTheDocument();
    // open · total summary present
    expect(screen.getByText(/open/)).toBeInTheDocument();
    expect(screen.getByText(/total/)).toBeInTheDocument();
  });
```

(Ensure the `project` fixture in this file sets some `openByType`, e.g. `openByType: { milestone: 0, epic: 0, feature: 0, task: 2, bug: 1 }` and `total: 10`, `open: 3`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test overview`
Expected: FAIL (text not found / structure changed).

- [ ] **Step 3: Rewrite the component**

Replace `ProjectCard` and the grid in `overview.tsx`:

```tsx
import { Link } from "@tanstack/react-router";

import { useProjects } from "../hooks/useProjects.js";

import { BEAN_TYPES } from "@beans-frontend/shared";

import type { Project } from "@beans-frontend/shared";

function ProjectRow({ project }: { project: Project }) {
  const openTypes = BEAN_TYPES.map((type) => ({ type, count: project.counts.openByType[type] ?? 0 })).filter(
    ({ count }) => count > 0,
  );
  return (
    <Link to="/p/$project" params={{ project: project.name }} className="project-row">
      <div className="project-row-top">
        <span className="project-row-name">{project.name}</span>
        <span className="project-row-summary">
          <b>{project.counts.open}</b> open · {project.counts.total} total
        </span>
      </div>
      {openTypes.length > 0 && (
        <div className="project-row-types">
          {openTypes.map(({ type, count }, i) => (
            <span key={type}>
              {i > 0 && <span className="project-row-sep">|</span>}
              <span className="project-row-type" style={{ color: `var(--t-${type})` }}>
                {type} <b>{count}</b>
              </span>
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

export function Overview() {
  const { data: projects, isPending, isError } = useProjects();

  if (isPending) return <p className="muted">Loading projects…</p>;
  if (isError) return <p className="muted">Failed to load projects.</p>;
  if (projects.length === 0) return <p className="muted">No projects found.</p>;

  return (
    <div>
      <h1>Overview</h1>
      <div className="project-ledger">
        {projects.map((project) => (
          <ProjectRow key={project.name} project={project} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add styles, remove old card styles**

In `global.css`, delete the `.project-grid`, `.project-card`, `.project-card:hover`, `.project-counts`, `.project-types`, `.project-type-chip`, `.project-type-count` blocks, and add:

```css
.project-ledger {
  border: 1px solid var(--hairline);
  border-radius: 8px;
  overflow: hidden;
}
.project-row {
  display: block;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--hairline);
  color: var(--ink);
  text-decoration: none;
}
.project-row:last-child { border-bottom: none; }
.project-row:hover { background: var(--paper-raised); }
.project-row-top { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; }
.project-row-name { font-family: var(--font-serif); font-weight: 600; font-size: 1.1rem; }
.project-row-summary { font-family: var(--font-mono); font-size: 0.8rem; color: var(--muted); white-space: nowrap; }
.project-row-summary b { color: var(--ink); font-size: 0.95rem; }
.project-row-types { margin-top: 0.4rem; font-family: var(--font-mono); font-size: 0.85rem; line-height: 1.5; }
.project-row-type b { color: var(--ink); }
.project-row-sep { color: var(--muted); margin: 0 0.5rem; }
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @beans-frontend/web test overview && pnpm knip`
Expected: PASS; knip reports no unused (BeanTypeTag import removed from overview).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/overview.tsx apps/web/src/routes/overview.test.tsx apps/web/src/theme/global.css
git commit -m "feat(web): redesign overview as open-work ledger rows"
```

---

## Task 4: `beanPrefix` helper

**Files:**
- Create: `apps/web/src/lib/prefix.ts`
- Test: `apps/web/src/lib/prefix.test.ts`

**Interfaces:**
- Produces: `beanPrefix(id: string): string`, `distinctPrefixes(beans: { id: string }[]): string[]` (sorted, unique).

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/prefix.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { beanPrefix, distinctPrefixes } from "./prefix.js";

describe("beanPrefix", () => {
  it("takes everything before the final hyphen", () => {
    expect(beanPrefix("hhroot-o5e5")).toBe("hhroot");
    expect(beanPrefix("cc-web-ab12")).toBe("cc-web");
  });
  it("returns the whole id when there is no hyphen", () => {
    expect(beanPrefix("abc123")).toBe("abc123");
  });
});

describe("distinctPrefixes", () => {
  it("returns unique prefixes sorted", () => {
    expect(distinctPrefixes([{ id: "romn-1" }, { id: "hhroot-2" }, { id: "romn-3" }])).toEqual([
      "hhroot",
      "romn",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test prefix`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`apps/web/src/lib/prefix.ts`:

```ts
export function beanPrefix(id: string): string {
  const idx = id.lastIndexOf("-");
  return idx <= 0 ? id : id.slice(0, idx);
}

export function distinctPrefixes(beans: { id: string }[]): string[] {
  return [...new Set(beans.map((b) => beanPrefix(b.id)))].sort((a, b) => a.localeCompare(b));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @beans-frontend/web test prefix`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/prefix.ts apps/web/src/lib/prefix.test.ts
git commit -m "feat(web): add bean prefix derivation helpers"
```

---

## Task 5: Filter model — `prefix` facet + `DEFAULT_BEAN_FILTER`

**Files:**
- Modify: `apps/web/src/hooks/useBeans.ts`
- Modify: `apps/web/src/hooks/useBeans.test.tsx`

**Interfaces:**
- Produces: `BeanFilterInput` gains `prefix: string[]`; `DEFAULT_BEAN_FILTER` (status = open statuses); `EMPTY_BEAN_FILTER` keeps all-empty. `prefix` is NOT sent to GraphQL (client-side only).

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/hooks/useBeans.test.tsx`:

```ts
import { DEFAULT_BEAN_FILTER } from "./useBeans.js";

it("DEFAULT_BEAN_FILTER hides completed and scrapped by default", () => {
  expect(DEFAULT_BEAN_FILTER.status).toEqual(["draft", "todo", "in-progress"]);
  expect(DEFAULT_BEAN_FILTER.prefix).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test useBeans`
Expected: FAIL (`DEFAULT_BEAN_FILTER` undefined).

- [ ] **Step 3: Implement in useBeans.ts**

Add `prefix` to the interface and both filter constants; do NOT include `prefix` in `toGraphqlFilter`:

```ts
import { OPEN_STATUSES } from "@beans-frontend/shared";

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
```

`toGraphqlFilter` stays as-is (it already ignores unknown fields; it must NOT read `filter.prefix`). Leave the query key `["beans", project, filter]` — including `prefix`/`status` in the object is fine.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @beans-frontend/web test useBeans && pnpm typecheck`
Expected: FAIL in typecheck — `EMPTY_BEAN_FILTER` consumers and the FilterBar tests build objects without `prefix`. That's expected; fixed in later tasks. Re-run just the unit test: `pnpm --filter @beans-frontend/web test useBeans` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useBeans.ts apps/web/src/hooks/useBeans.test.tsx
git commit -m "feat(web): add prefix facet and open-by-default filter"
```

> Note: typecheck stays red until Task 7 updates FilterBar and its tests. Proceed directly to Task 6 → 7.

---

## Task 6: `CheckboxMenu` popover component

**Files:**
- Create: `apps/web/src/components/CheckboxMenu.tsx`
- Modify: `apps/web/src/theme/global.css` (popover styles)
- Test: `apps/web/src/components/CheckboxMenu.test.tsx`

**Interfaces:**
- Produces (generic over the value type so callers keep their enum arrays — no casts):
  ```ts
  interface CheckboxMenuProps<T extends string> {
    label: string;                 // e.g. "Type"
    options: { value: T; label: string }[];
    selected: T[];
    onChange: (next: T[]) => void;
  }
  export function CheckboxMenu<T extends string>(props: CheckboxMenuProps<T>): JSX.Element;
  ```
  Trigger button text: `label` plus ` (${selected.length})` when non-empty. Opens a checkbox list; toggling calls `onChange` with the new array. Closes on outside-click and Escape.

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/CheckboxMenu.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CheckboxMenu } from "./CheckboxMenu.js";

const options = [
  { value: "epic", label: "epic" },
  { value: "task", label: "task" },
];

describe("CheckboxMenu", () => {
  it("shows a count and toggles values", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CheckboxMenu label="Type" options={options} selected={["epic"]} onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: /Type \(1\)/ });
    await user.click(trigger);
    await user.click(screen.getByLabelText("task"));

    expect(onChange).toHaveBeenCalledWith(["epic", "task"]);
  });

  it("removes a value when unchecked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CheckboxMenu label="Type" options={options} selected={["epic"]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Type/ }));
    await user.click(screen.getByLabelText("epic"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test CheckboxMenu`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`apps/web/src/components/CheckboxMenu.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";

export interface CheckboxMenuProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
}

export function CheckboxMenu<T extends string>({ label, options, selected, onChange }: CheckboxMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(value: T) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div className="checkbox-menu" ref={rootRef}>
      <button
        type="button"
        className={`checkbox-menu-trigger ${selected.length > 0 ? "active" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        {selected.length > 0 ? ` (${selected.length})` : ""} ▾
      </button>
      {open && (
        <div className="checkbox-menu-list" role="group" aria-label={label}>
          {options.map((option) => (
            <label key={option.value} className="checkbox-menu-item">
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add styles**

In `global.css`:

```css
.checkbox-menu { position: relative; display: inline-block; }
.checkbox-menu-trigger {
  padding: 0.4rem 0.7rem; border: 1px solid var(--hairline); border-radius: 999px;
  background: var(--paper-raised); color: var(--muted); font-size: 0.85rem; cursor: pointer;
}
.checkbox-menu-trigger.active { border-color: var(--accent); color: var(--accent); }
.checkbox-menu-list {
  position: absolute; z-index: 50; margin-top: 0.35rem; min-width: 10rem; padding: 0.4rem;
  border: 1px solid var(--hairline); border-radius: 6px; background: var(--paper);
  box-shadow: 0 6px 24px rgb(0 0 0 / 15%); display: flex; flex-direction: column; gap: 0.15rem;
}
.checkbox-menu-item {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.5rem;
  border-radius: 4px; font-size: 0.9rem; cursor: pointer;
}
.checkbox-menu-item:hover { background: var(--paper-raised); }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @beans-frontend/web test CheckboxMenu`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/CheckboxMenu.tsx apps/web/src/components/CheckboxMenu.test.tsx apps/web/src/theme/global.css
git commit -m "feat(web): add reusable checkbox-menu popover"
```

---

## Task 7: FilterBar — multi-select popovers, prefix, tags sizing

**Files:**
- Rewrite: `apps/web/src/components/FilterBar.tsx`
- Rewrite: `apps/web/src/components/FilterBar.test.tsx`
- Modify: `apps/web/src/theme/global.css` (tags width)

**Interfaces:**
- Consumes: `CheckboxMenu`, `BeanFilterInput` (now with `prefix`), `BEAN_TYPES/BEAN_STATUSES/BEAN_PRIORITIES`.
- New prop: `prefixOptions: string[]` (dynamic prefixes for the current list).
- Produces: `FilterBar` calls `onChange` with the updated `BeanFilterInput` (arrays for type/status/priority/prefix, string for tags/search).

- [ ] **Step 1: Rewrite the test**

Replace `FilterBar.test.tsx` (single-select select semantics no longer apply). New tests target the popover checkboxes:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FilterBar } from "./FilterBar.js";

import { EMPTY_BEAN_FILTER } from "../hooks/useBeans.js";

const props = { filter: EMPTY_BEAN_FILTER, prefixOptions: ["hhroot", "romn"], onChange: vi.fn() };

describe("FilterBar", () => {
  it("adds a type via the Type popover", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterBar {...props} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Type/ }));
    await user.click(screen.getByLabelText("epic"));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_BEAN_FILTER, type: ["epic"] });
  });

  it("adds a prefix from the dynamic options", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterBar {...props} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Prefix/ }));
    await user.click(screen.getByLabelText("romn"));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_BEAN_FILTER, prefix: ["romn"] });
  });

  it("reports search text", () => {
    const onChange = vi.fn();
    render(<FilterBar {...props} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Search beans"), { target: { value: "x" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_BEAN_FILTER, search: "x" });
  });

  it("splits tags on comma", () => {
    const onChange = vi.fn();
    render(<FilterBar {...props} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "a, b" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_BEAN_FILTER, tags: ["a", "b"] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test FilterBar`
Expected: FAIL.

- [ ] **Step 3: Rewrite FilterBar.tsx**

```tsx
import { useState } from "react";

import { BEAN_PRIORITIES, BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";

import { CheckboxMenu } from "./CheckboxMenu.js";

import type { BeanFilterInput } from "../hooks/useBeans.js";
import type { ChangeEvent } from "react";

export interface FilterBarProps {
  filter: BeanFilterInput;
  prefixOptions: string[];
  onChange: (filter: BeanFilterInput) => void;
}

const toOptions = <T extends string>(values: readonly T[]) => values.map((value) => ({ value, label: value }));

export function FilterBar({ filter, prefixOptions, onChange }: FilterBarProps) {
  const [showFilters, setShowFilters] = useState(false);

  const activeCount =
    filter.type.length +
    filter.status.length +
    filter.priority.length +
    filter.prefix.length +
    filter.tags.length;

  function handleTags(event: ChangeEvent<HTMLInputElement>) {
    const tags = event.target.value
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    onChange({ ...filter, tags });
  }

  return (
    <div className={`filter-bar ${showFilters ? "filter-bar--open" : ""}`}>
      <input
        type="search"
        className="filter-search"
        placeholder="Search beans…"
        aria-label="Search beans"
        value={filter.search}
        onChange={(e) => onChange({ ...filter, search: e.target.value })}
      />
      <button
        type="button"
        className="filter-toggle"
        aria-expanded={showFilters}
        onClick={() => setShowFilters((o) => !o)}
      >
        Filters{activeCount > 0 ? ` (${activeCount})` : ""}
      </button>
      <div className="filter-bar-advanced">
        <CheckboxMenu label="Type" options={toOptions(BEAN_TYPES)} selected={filter.type}
          onChange={(type) => onChange({ ...filter, type })} />
        <CheckboxMenu label="Status" options={toOptions(BEAN_STATUSES)} selected={filter.status}
          onChange={(status) => onChange({ ...filter, status })} />
        <CheckboxMenu label="Priority" options={toOptions(BEAN_PRIORITIES)} selected={filter.priority}
          onChange={(priority) => onChange({ ...filter, priority })} />
        <CheckboxMenu label="Prefix" options={toOptions(prefixOptions)} selected={filter.prefix}
          onChange={(prefix) => onChange({ ...filter, prefix })} />
        <input
          type="text"
          className="filter-tags"
          placeholder="Tags…"
          aria-label="Tags"
          value={filter.tags.join(", ")}
          onChange={handleTags}
        />
      </div>
    </div>
  );
}
```

> `CheckboxMenu<T>` and `toOptions<T>` are generic, so `toOptions(BEAN_TYPES)` yields `{ value: BeanType }[]`, `selected={filter.type}` is `BeanType[]`, and `onChange` hands back `BeanType[]` — no casts needed. `FilterBarProps` no longer needs a `BeanFilterInput` type import for casting; keep the `import type { BeanFilterInput }` for the prop type only.

- [ ] **Step 4: Tags width**

In `global.css`, change `.filter-tags`:

```css
.filter-tags { flex: 0 1 150px; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @beans-frontend/web test FilterBar`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/FilterBar.tsx apps/web/src/components/FilterBar.test.tsx apps/web/src/theme/global.css
git commit -m "feat(web): multi-select filter popovers with prefix facet"
```

---

## Task 8: ProjectList — default filter, prefix param, client-side prefix

**Files:**
- Modify: `apps/web/src/routes/projectList.tsx`
- Modify: `apps/web/src/routes/projectList.test.tsx`

**Interfaces:**
- Consumes: `DEFAULT_BEAN_FILTER`, `distinctPrefixes`, `beanPrefix`, `FilterBar` (new `prefixOptions` prop).
- `ProjectSearch` gains `prefix?: string[]`.

- [ ] **Step 1: Write the failing test**

In `projectList.test.tsx`, add:

```ts
import { validateProjectSearch } from "./projectList.js";

it("validates prefix search param as a string array", () => {
  expect(validateProjectSearch({ prefix: ["romn", "hhroot"] })).toEqual({ prefix: ["romn", "hhroot"] });
  expect(validateProjectSearch({ prefix: "romn" })).toEqual({ prefix: ["romn"] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test projectList`
Expected: FAIL (`prefix` dropped).

- [ ] **Step 3: Implement in projectList.tsx**

Extend `ProjectSearch` and `validateProjectSearch`:

```ts
export interface ProjectSearch {
  type?: BeanType[];
  status?: BeanStatus[];
  priority?: BeanPriority[];
  tags?: string[];
  prefix?: string[];
  search?: string;
}
```

In `validateProjectSearch`, after `tags`:

```ts
  const prefix = toStringArray(search.prefix);
  if (prefix.length > 0) result.prefix = prefix;
```

Replace the filter construction and list rendering. Default the status to open when no status param is present, derive prefix options from the fetched beans, prune client-side:

```ts
import { DEFAULT_BEAN_FILTER, useBeans } from "../hooks/useBeans.js";
import { beanPrefix, distinctPrefixes } from "../lib/prefix.js";
// ...
  const filter: BeanFilterInput = {
    type: search.type ?? [],
    status: search.status ?? [...DEFAULT_BEAN_FILTER.status],
    priority: search.priority ?? [],
    tags: search.tags ?? [],
    prefix: search.prefix ?? [],
    search: search.search ?? "",
  };

  // Server filter excludes prefix (client-side) and, for hierarchy view, type.
  const serverFilter: BeanFilterInput =
    view === "hierarchy" ? { ...filter, type: [], prefix: [] } : { ...filter, prefix: [] };

  const { data: beans, isPending, isError } = useBeans(project, serverFilter);
  const prefixOptions = beans ? distinctPrefixes(beans) : [];

  const prefixFiltered =
    beans && filter.prefix.length > 0
      ? beans.filter((b) => filter.prefix.includes(beanPrefix(b.id)))
      : beans;
```

In `handleFilterChange`, add `prefix`:

```ts
        prefix: next.prefix.length > 0 ? next.prefix : undefined,
```

Pass `prefixOptions` to `FilterBar` and render from `prefixFiltered`:
- Flat view: `<FlatList project={project} beans={prefixFiltered} />`
- Hierarchy view: pass `prefixFiltered` to `HierarchyList` (prefix acts like a client-side filter there too; `HierarchyList` builds its tree from what it's given, so ancestors of matched beans are preserved via `buildTree` because matched beans keep their `parentId`). For hierarchy, prefix pruning to ancestors is handled by giving `HierarchyList` the prefix-filtered set plus their ancestors:

```ts
  // Keep ancestor chain for hierarchy so section headers remain as context.
  function withAncestors(list: Bean[], all: Bean[]): Bean[] {
    const byId = new Map(all.map((b) => [b.id, b]));
    const keep = new Map(list.map((b) => [b.id, b]));
    for (const b of list) {
      let pid = b.parentId;
      while (pid && byId.has(pid) && !keep.has(pid)) {
        const parent = byId.get(pid)!;
        keep.set(pid, parent);
        pid = parent.parentId;
      }
    }
    return [...keep.values()];
  }
  const hierarchyBeans =
    beans && filter.prefix.length > 0 ? withAncestors(prefixFiltered ?? [], beans) : beans;
```

Use `hierarchyBeans` for `HierarchyList` and `prefixFiltered` for `FlatList`. Guard `renderList` on `isPending`/`isError` as today; when `prefixFiltered.length === 0` show the existing empty state.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @beans-frontend/web test projectList && pnpm typecheck`
Expected: PASS (typecheck now green — FilterBar `prefixOptions` supplied; filter objects include `prefix`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/projectList.tsx apps/web/src/routes/projectList.test.tsx
git commit -m "feat(web): wire prefix filter and open-by-default status into lists"
```

---

## Task 9: Header search bar with live dropdown

**Files:**
- Create: `apps/web/src/components/HeaderSearch.tsx`
- Modify: `apps/web/src/components/AppShell.tsx` (replace the `search-entry` Link)
- Modify: `apps/web/src/components/AppShell.test.tsx` (search role now on the input)
- Modify: `apps/web/src/theme/global.css` (header search + dropdown)
- Test: `apps/web/src/components/HeaderSearch.test.tsx`

**Interfaces:**
- Consumes: `useSearch(query)` → `UseQueryResult<SearchResult>`; `useNavigate`, `useDebouncedValue`.
- Produces: `HeaderSearch()` — input (`role="search"`, `aria-label="Global search"`) + results dropdown; Enter → navigate to `/search` with the query.

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/HeaderSearch.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HeaderSearch } from "./HeaderSearch.js";
import { renderWithRouter } from "../test/renderWithRouter.js";

const { useSearchMock } = vi.hoisted(() => ({ useSearchMock: vi.fn() }));
vi.mock("../hooks/useSearch.js", () => ({ useSearch: useSearchMock }));

describe("HeaderSearch", () => {
  it("shows matching beans in a dropdown as you type", async () => {
    useSearchMock.mockReturnValue({
      data: {
        hits: [
          { project: "hh", bean: { id: "hh-1", title: "Ring bell", type: "task", status: "todo", priority: "normal" } },
        ],
        failures: [],
      },
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderWithRouter(<HeaderSearch />);
    await user.type(screen.getByRole("search", { name: "Global search" }).querySelector("input")!, "bell");
    expect(await screen.findByText("Ring bell")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test HeaderSearch`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`apps/web/src/components/HeaderSearch.tsx`:

```tsx
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { useSearch } from "../hooks/useSearch.js";
import { BeanTypeTag } from "./BeanTypeTag.js";
import { StatusDot } from "./StatusDot.js";

const SEARCH_DEBOUNCE_MS = 200;
const MAX_DROPDOWN = 8;

export function HeaderSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const debounced = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const { data } = useSearch(debounced);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const hits = data?.hits.slice(0, MAX_DROPDOWN) ?? [];

  return (
    <div className="header-search" ref={rootRef} role="search" aria-label="Global search">
      <input
        className="header-search-input"
        type="search"
        placeholder="Search beans…"
        aria-label="Search all beans"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setOpen(false);
            void navigate({ to: "/search", search: { q: query.trim() } });
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && debounced.length > 0 && hits.length > 0 && (
        <div className="header-search-dropdown">
          {hits.map((hit) => (
            <Link
              key={`${hit.project}:${hit.bean.id}`}
              to="/p/$project/$beanId"
              params={{ project: hit.project, beanId: hit.bean.id }}
              className="header-search-hit"
              onClick={() => setOpen(false)}
            >
              <BeanTypeTag type={hit.bean.type} />
              <span className="header-search-hit-title">{hit.bean.title}</span>
              <span className="muted">{hit.project}</span>
              <StatusDot status={hit.bean.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

> The `/search` route currently ignores a `q` param. Add optional search-param passthrough so the page can prefill: in `apps/web/src/routes/search.tsx`, read an initial query from the route if present. Minimal approach: keep `/search` as-is (it has its own input); navigating there focuses the page. If the search route lacks `validateSearch`, add `validateSearch: (s: Record<string, unknown>) => ({ q: typeof s.q === "string" ? s.q : "" })` in `router.tsx` and seed `SearchPage`'s initial `useState(q)`. Wire this in `router.tsx` and `search.tsx`.

- [ ] **Step 4: Update AppShell**

In `AppShell.tsx`, replace the `<Link ... className="search-entry" ...>` block with `<HeaderSearch />` (import it). Keep the `nav-toggle` and `updated-pill`.

Update `AppShell.test.tsx`: the `role="search"` name is still "Global search" (now on the `HeaderSearch` div), so existing assertions pass. If the mocked `useSearch` isn't provided in AppShell.test, add `vi.mock("../hooks/useSearch.js", () => ({ useSearch: () => ({ data: undefined, isPending: false, isError: false }) }));`.

- [ ] **Step 5: Add styles**

```css
.header-search { position: relative; flex: 1 1 auto; max-width: 28rem; }
.header-search-input {
  width: 100%; box-sizing: border-box; padding: 0.45rem 0.75rem; font-size: 0.9rem;
  border: 1px solid var(--hairline); border-radius: 6px; background: var(--paper-raised); color: var(--ink);
}
.header-search-dropdown {
  position: absolute; z-index: 60; left: 0; right: 0; margin-top: 0.35rem;
  border: 1px solid var(--hairline); border-radius: 6px; background: var(--paper);
  box-shadow: 0 8px 28px rgb(0 0 0 / 16%); overflow: hidden;
}
.header-search-hit {
  display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.7rem;
  border-bottom: 1px solid var(--hairline); color: var(--ink); text-decoration: none;
}
.header-search-hit:last-child { border-bottom: none; }
.header-search-hit:hover { background: var(--paper-raised); }
.header-search-hit-title { flex: 1; font-family: var(--font-serif); }
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @beans-frontend/web test HeaderSearch AppShell && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/HeaderSearch.tsx apps/web/src/components/HeaderSearch.test.tsx apps/web/src/components/AppShell.tsx apps/web/src/components/AppShell.test.tsx apps/web/src/routes/search.tsx apps/web/src/router.tsx apps/web/src/theme/global.css
git commit -m "feat(web): add header global search with live dropdown"
```

---

## Task 10: Hierarchy — collapse-all on load

**Files:**
- Modify: `apps/web/src/lib/hierarchy.ts` (add `collectCollapsibleIds`)
- Modify: `apps/web/src/components/HierarchyList.tsx`
- Modify: `apps/web/src/lib/hierarchy.test.ts` and `apps/web/src/components/HierarchyList.test.tsx`

**Interfaces:**
- Produces: `collectCollapsibleIds(nodes: BeanNode[]): string[]` — ids of every node with children (recursive); used to seed the collapsed set. For grouped sections, section ids with leaves are collapsible.

- [ ] **Step 1: Write the failing test (lib)**

In `hierarchy.test.ts`:

```ts
import { collectCollapsibleIds } from "./hierarchy.js";

it("collects ids of every node that has children", () => {
  const nodes = [
    { bean: { id: "m1" } as never, depth: 0, children: [
      { bean: { id: "e1" } as never, depth: 1, children: [
        { bean: { id: "t1" } as never, depth: 2, children: [] },
      ] },
    ] },
  ];
  expect(collectCollapsibleIds(nodes).sort()).toEqual(["e1", "m1"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test hierarchy.test`
Expected: FAIL (not exported).

- [ ] **Step 3: Implement in hierarchy.ts**

```ts
export function collectCollapsibleIds(nodes: BeanNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: BeanNode[]) => {
    for (const node of list) {
      if (node.children.length > 0) {
        ids.push(node.bean.id);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
}
```

- [ ] **Step 4: Seed collapsed state in HierarchyList.tsx**

Replace `const [collapsed, setCollapsed] = useState<Set<string>>(new Set());` with a lazy initializer seeded from the tree, recomputed when the tree changes:

```ts
  const initialCollapsed = useMemo(() => {
    const treeIds = collectCollapsibleIds([...milestones, ...roots]);
    const sectionIds = grouped.sections.filter((s) => s.leaves.length > 0).map((s) => s.bean.id);
    return new Set<string>([...treeIds, ...sectionIds]);
  }, [milestones, roots, grouped]);
  const [collapsed, setCollapsed] = useState<Set<string>>(initialCollapsed);
  const [seededFor, setSeededFor] = useState(initialCollapsed);
  if (seededFor !== initialCollapsed) {
    setSeededFor(initialCollapsed);
    setCollapsed(initialCollapsed);
  }
```

(Import `collectCollapsibleIds`. Place the `initialCollapsed` memo after `grouped` is defined.)

- [ ] **Step 5: Write the failing component test**

In `HierarchyList.test.tsx`, add a test asserting a child is hidden initially and shown after expanding. Use a milestone + child bean fixture; assert the child title is not present until the caret (`Expand <milestone>`) is clicked.

```tsx
it("starts collapsed, showing only top-level sections", async () => {
  const user = userEvent.setup();
  renderWithRouter(<HierarchyList project="p" beans={beansWithMilestoneAndChild} />);
  expect(screen.queryByText("Child task")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Expand/ }));
  expect(screen.getByText("Child task")).toBeInTheDocument();
});
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @beans-frontend/web test hierarchy.test HierarchyList`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/hierarchy.ts apps/web/src/lib/hierarchy.test.ts apps/web/src/components/HierarchyList.tsx apps/web/src/components/HierarchyList.test.tsx
git commit -m "feat(web): collapse hierarchy to top level on load"
```

---

## Task 11: Hierarchy — section headers as linked bean rows + subtle tint

**Files:**
- Create: `apps/web/src/components/SectionHeaderRow.tsx`
- Modify: `apps/web/src/components/HierarchyList.tsx` (use `SectionHeaderRow` for milestone/epic/grouped headers)
- Modify: `apps/web/src/theme/global.css` (`.hierarchy-section-header` tint)
- Test: `apps/web/src/components/SectionHeaderRow.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface SectionHeaderRowProps {
    project: string;
    bean: Bean;
    collapsed: boolean;
    hasChildren: boolean;
    onToggle: () => void;
  }
  export function SectionHeaderRow(props: SectionHeaderRowProps): JSX.Element;
  ```
  Renders a caret button (when `hasChildren`) + a `Link` to the bean detail containing `BeanTypeTag` + title + `StatusDot` — the same presentation as `BeanRow` — with a section tint.

- [ ] **Step 1: Write the failing test**

`SectionHeaderRow.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SectionHeaderRow } from "./SectionHeaderRow.js";
import { renderWithRouter } from "../test/renderWithRouter.js";

const bean = { id: "m1", title: "Q3 launch", type: "milestone", status: "todo" } as never;

describe("SectionHeaderRow", () => {
  it("renders the bean as a link with type and status", () => {
    renderWithRouter(
      <SectionHeaderRow project="p" bean={bean} collapsed hasChildren onToggle={vi.fn()} />,
    );
    expect(screen.getByText("Q3 launch").closest("a")).toHaveAttribute("href", "/p/p/m1");
    expect(screen.getByText("milestone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Expand/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test SectionHeaderRow`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/components/SectionHeaderRow.tsx`:

```tsx
import { Link } from "@tanstack/react-router";

import { BeanTypeTag } from "./BeanTypeTag.js";
import { StatusDot } from "./StatusDot.js";

import type { Bean } from "@beans-frontend/shared";

export interface SectionHeaderRowProps {
  project: string;
  bean: Bean;
  collapsed: boolean;
  hasChildren: boolean;
  onToggle: () => void;
}

export function SectionHeaderRow({ project, bean, collapsed, hasChildren, onToggle }: SectionHeaderRowProps) {
  return (
    <div className={`hierarchy-section-header hierarchy-section-header--${bean.type}`}>
      {hasChildren ? (
        <button
          type="button"
          className="hierarchy-caret"
          aria-label={collapsed ? `Expand ${bean.title}` : `Collapse ${bean.title}`}
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          {collapsed ? "▸" : "▾"}
        </button>
      ) : (
        <span className="hierarchy-caret-spacer" aria-hidden="true" />
      )}
      <Link to="/p/$project/$beanId" params={{ project, beanId: bean.id }} className="bean-row section-bean-row">
        <BeanTypeTag type={bean.type} />
        <span className="bean-row-title">{bean.title}</span>
        <StatusDot status={bean.status} />
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Use it in HierarchyList.tsx**

Replace the three `<h2 className="hierarchy-section-header">…</h2>` blocks (desktop milestone header, grouped-section header, and any epic header) with `SectionHeaderRow`, passing `collapsed`, `hasChildren` (children/leaves length > 0), and `onToggle={() => toggle(id)}`. Remove the now-unused inline caret markup in those spots.

- [ ] **Step 5: Update section-header styles**

In `global.css`, change `.hierarchy-section-header` to a flex row with a subtle tint and keep type hues:

```css
.hierarchy-section-header {
  display: flex; align-items: center; gap: 0.35rem;
  margin: 0 0 0.35rem; padding: 0.15rem 0.35rem;
  border-bottom: 1px solid var(--hairline);
  background: color-mix(in srgb, var(--t-milestone) 8%, transparent);
  border-radius: 4px 4px 0 0;
}
.hierarchy-section-header--epic { background: color-mix(in srgb, var(--t-epic) 8%, transparent); }
.section-bean-row { flex: 1; }
```

(Remove the old `color: var(--t-milestone)` / font-size rules that made headers look different from bean rows; the `hierarchy-grouped-section--epic > .hierarchy-section-header` rule can be dropped in favor of the modifier class.)

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @beans-frontend/web test SectionHeaderRow HierarchyList`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/SectionHeaderRow.tsx apps/web/src/components/SectionHeaderRow.test.tsx apps/web/src/components/HierarchyList.tsx apps/web/src/theme/global.css
git commit -m "feat(web): render hierarchy section headers as linked bean rows"
```

---

## Task 12: Hierarchy — flush-left when no sections

**Files:**
- Modify: `apps/web/src/components/HierarchyList.tsx`
- Modify: `apps/web/src/components/HierarchyList.test.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test**

In `HierarchyList.test.tsx`, render a project with only tasks/bugs (no milestones/epics) and assert the root rows carry a `no-sections` marker class (so CSS drops the caret indent):

```tsx
it("marks the list as section-less when there are no milestones or epics", () => {
  const { container } = renderWithRouter(<HierarchyList project="p" beans={onlyTasks} />);
  expect(container.querySelector(".hierarchy-list")).toHaveClass("hierarchy-list--flush");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test HierarchyList`
Expected: FAIL.

- [ ] **Step 3: Implement**

In both the mobile grouped return and the desktop return, compute whether any section headers exist and add a modifier class:

```ts
  const hasSections = isMobile
    ? grouped.sections.length > 0
    : milestones.length > 0 || roots.some((r) => r.children.length > 0);
  const listClass = `hierarchy-list${hasSections ? "" : " hierarchy-list--flush"}`;
```

Use `className={listClass}` on the wrapping `div.hierarchy-list` in both branches.

- [ ] **Step 4: CSS — drop caret indent when flush**

In `global.css`:

```css
.hierarchy-list--flush .hierarchy-caret-spacer { display: none; }
.hierarchy-list--flush .hierarchy-row { padding-left: 0 !important; }
```

(The `!important` overrides the inline `paddingLeft` for depth-0 flush rows; acceptable here because the inline style is generated and there is no other hook. Alternatively, in the render, set `paddingLeft` to `0` when `!hasSections`; prefer that if avoiding `!important`: pass a `flush` flag to `renderLeafRow`/`renderNode` and use `paddingLeft: flush ? 0 : \`calc(...)\``.)

Prefer the no-`!important` route: thread a `flush` boolean into `renderLeafRow`/`renderNode` and compute `paddingLeft` as `flush ? "0" : \`calc(${depth} * var(--indent))\``, and hide the spacer via conditional render `{!flush && <span className="hierarchy-caret-spacer" />}` for depth-0 leaves.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @beans-frontend/web test HierarchyList`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/HierarchyList.tsx apps/web/src/components/HierarchyList.test.tsx apps/web/src/theme/global.css
git commit -m "fix(web): align hierarchy beans flush-left with no sections"
```

---

## Task 13: `InlineEditRow` + bean-detail header redesign

**Files:**
- Create: `apps/web/src/components/InlineEditRow.tsx`
- Test: `apps/web/src/components/InlineEditRow.test.tsx`
- Modify: `apps/web/src/routes/beanDetail.tsx` (header uses `InlineEditRow`)
- Modify: `apps/web/src/theme/global.css` (inline-edit styles)
- Modify: `apps/web/src/routes/beanDetail.test.tsx` (header no longer double-renders type; type edited via row)

**Interfaces:**
- Produces:
  ```ts
  interface InlineEditRowProps {
    label: string;
    display: React.ReactNode;        // resting value (chip, dot+label, text, tag chips)
    editor: (args: { value: string; onValue: (v: string) => void }) => React.ReactNode; // control
    initialValue: string;            // current value as a string
    onSave: (value: string) => void; // fired only when dirty & Save clicked
  }
  export function InlineEditRow(props: InlineEditRowProps): JSX.Element;
  ```
  Resting: shows `label`, `display`, and a ✎ button. Editing: shows `editor`, and — only when the working value differs from `initialValue` — a ✔ Save and a ✕ cancel. Save calls `onSave(value)` and exits; cancel discards and exits.

- [ ] **Step 1: Write the failing test**

`InlineEditRow.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InlineEditRow } from "./InlineEditRow.js";

function renderRow(onSave = vi.fn()) {
  return {
    onSave,
    ...render(
      <InlineEditRow
        label="Type"
        display={<span>feature</span>}
        initialValue="feature"
        onSave={onSave}
        editor={({ value, onValue }) => (
          <select aria-label="Type editor" value={value} onChange={(e) => onValue(e.target.value)}>
            <option value="feature">feature</option>
            <option value="epic">epic</option>
          </select>
        )}
      />,
    ),
  };
}

describe("InlineEditRow", () => {
  it("shows Save only after the value changes, then saves", async () => {
    const user = userEvent.setup();
    const { onSave } = renderRow();
    await user.click(screen.getByRole("button", { name: "Edit Type" }));
    expect(screen.queryByRole("button", { name: "Save Type" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Type editor"), "epic");
    await user.click(screen.getByRole("button", { name: "Save Type" }));
    expect(onSave).toHaveBeenCalledWith("epic");
  });

  it("cancel discards without saving", async () => {
    const user = userEvent.setup();
    const { onSave } = renderRow();
    await user.click(screen.getByRole("button", { name: "Edit Type" }));
    await user.selectOptions(screen.getByLabelText("Type editor"), "epic");
    await user.click(screen.getByRole("button", { name: "Cancel Type edit" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit Type" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test InlineEditRow`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/components/InlineEditRow.tsx`:

```tsx
import { useState } from "react";

import type { ReactNode } from "react";

export interface InlineEditRowProps {
  label: string;
  display: ReactNode;
  editor: (args: { value: string; onValue: (v: string) => void }) => ReactNode;
  initialValue: string;
  onSave: (value: string) => void;
}

export function InlineEditRow({ label, display, editor, initialValue, onSave }: InlineEditRowProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);

  function startEdit() {
    setValue(initialValue);
    setEditing(true);
  }
  function cancel() {
    setEditing(false);
    setValue(initialValue);
  }
  function save() {
    setEditing(false);
    if (value !== initialValue) onSave(value);
  }

  const dirty = value !== initialValue;

  return (
    <div className="inline-edit-row">
      <span className="inline-edit-label">{label}</span>
      <span className="inline-edit-value">
        {editing ? (
          <>
            {editor({ value, onValue: setValue })}
            {dirty && (
              <button type="button" className="inline-edit-save" aria-label={`Save ${label}`} onClick={save}>
                ✔
              </button>
            )}
            <button type="button" className="inline-edit-cancel" aria-label={`Cancel ${label} edit`} onClick={cancel}>
              ✕
            </button>
          </>
        ) : (
          <>
            {display}
            <button type="button" className="inline-edit-pencil" aria-label={`Edit ${label}`} onClick={startEdit}>
              ✎
            </button>
          </>
        )}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @beans-frontend/web test InlineEditRow`
Expected: PASS.

- [ ] **Step 5: Rework the bean-detail header**

In `beanDetail.tsx`, replace the `.bean-detail-title-row` cluster (type `<select>` + `BeanTypeTag` + title/input + status `<select>` + `StatusDot`) and the `.bean-detail-meta` priority/tags controls with:
- A title line: the serif title with an `InlineEditRow`-style pencil (or reuse the existing title-input edit, gated by a ✎ button).
- Four `InlineEditRow`s:
  - **Type** — `display={<BeanTypeTag type={bean.type} />}`, `initialValue={bean.type}`, editor = a `<select>` over `BEAN_TYPES`, `onSave={(v) => updateBean.mutate({ id: bean.id, etag: bean.etag, input: { type: v as BeanType } })}`.
  - **Status** — `display={<StatusDot status={bean.status} />}`, editor = `<select>` over `BEAN_STATUSES`, save `{ status }`.
  - **Priority** — `display={bean.priority}`, editor = `<select>` over `BEAN_PRIORITIES`, save `{ priority }`.
  - **Tags** — `display={bean.tags.join(", ") || "—"}`, `initialValue={bean.tags.join(", ")}`, editor = text input, `onSave={(v) => updateBean.mutate({ ..., input: { tags: v.split(",").map(t=>t.trim()).filter(Boolean) } })}`.

Keep the id/timestamps footer. Guard the `as BeanType`/`as BeanStatus`/`as BeanPriority` casts by validating against the enum arrays before mutating (e.g. `const next = BEAN_TYPES.find((t) => t === v); if (next) updateBean.mutate(...)`), consistent with existing handlers — do NOT use raw casts.

- [ ] **Step 6: Update beanDetail.test.tsx**

The header no longer has a bare `Type` `<select>` at rest. Update the "fires the update mutation when the type changes" test to first click **Edit Type**, then select in the editor, then click **Save Type**:

```tsx
it("fires the update mutation when the type changes", async () => {
  const user = userEvent.setup();
  renderBeanDetail();
  await user.click(await screen.findByRole("button", { name: "Edit Type" }));
  await user.selectOptions(screen.getByLabelText("Type editor"), "bug");
  await user.click(screen.getByRole("button", { name: "Save Type" }));
  expect(updateBeanMutate).toHaveBeenCalledWith({ id: "t1", etag: "abc", input: { type: "bug" } });
});
```

Apply the same edit→save pattern to the status and priority tests, and update the tags test (edit Tags → type → save). Give each editor an `aria-label` like `"Type editor"`, `"Status editor"`, `"Priority editor"`, `"Tags editor"`.

- [ ] **Step 7: Add inline-edit styles**

```css
.inline-edit-row {
  display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid var(--hairline);
}
.inline-edit-row:last-of-type { border-bottom: none; }
.inline-edit-label {
  width: 5rem; flex: none; font-size: 0.75rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted);
}
.inline-edit-value { flex: 1; display: flex; align-items: center; gap: 0.5rem; }
.inline-edit-pencil, .inline-edit-save, .inline-edit-cancel {
  border: 1px solid var(--hairline); background: var(--paper-raised); border-radius: 6px;
  padding: 0.3rem 0.5rem; cursor: pointer; line-height: 1; color: var(--muted);
}
.inline-edit-save { background: var(--s-completed); border-color: var(--s-completed); color: #fff; }
```

- [ ] **Step 8: Run tests**

Run: `pnpm --filter @beans-frontend/web test InlineEditRow beanDetail && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/InlineEditRow.tsx apps/web/src/components/InlineEditRow.test.tsx apps/web/src/routes/beanDetail.tsx apps/web/src/routes/beanDetail.test.tsx apps/web/src/theme/global.css
git commit -m "feat(web): labeled inline-edit rows for bean detail header"
```

---

## Task 14: Bean detail — body edit/save toggle

**Files:**
- Modify: `apps/web/src/routes/beanDetail.tsx` (replace the always-open BodyEditor section)
- Modify: `apps/web/src/routes/beanDetail.test.tsx` (body edit flow)
- Modify: `apps/web/src/theme/global.css` (body actions)
- Remove/repurpose: `apps/web/src/components/BodyEditor.tsx` preview toggle (keep a plain textarea, or inline the textarea in beanDetail and delete BodyEditor + its test if unused)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test**

In `beanDetail.test.tsx`, replace the "saves body edits through the body editor" test with an edit/save toggle flow:

```tsx
it("edits and saves the body via the Edit toggle", async () => {
  const user = userEvent.setup();
  renderBeanDetail();
  await user.click(await screen.findByRole("button", { name: "Edit body" }));
  const textarea = screen.getByLabelText("Body");
  await user.clear(textarea);
  await user.type(textarea, "New body content");
  await user.click(screen.getByRole("button", { name: "Save body" }));
  expect(updateBeanMutate).toHaveBeenCalledWith({ id: "t1", etag: "abc", input: { body: "New body content" } });
});

it("cancels body edits without saving", async () => {
  const user = userEvent.setup();
  renderBeanDetail();
  await user.click(await screen.findByRole("button", { name: "Edit body" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(updateBeanMutate).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Edit body" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test beanDetail`
Expected: FAIL.

- [ ] **Step 3: Implement in beanDetail.tsx**

Replace the "Edit body" section + `BodyEditor` usage with a rendered-by-default view plus an edit toggle. Add state `const [editingBody, setEditingBody] = useState(false)` and reuse the existing `bodyDraft`/`setBodyDraft` (which already resyncs on bean id change):

```tsx
<section className="bean-detail-section">
  {editingBody ? (
    <>
      <textarea
        aria-label="Body"
        className="body-editor-textarea"
        value={bodyDraft}
        onChange={(e) => setBodyDraft(e.target.value)}
        rows={14}
      />
      <div className="bean-detail-body-actions">
        <button type="button" onClick={() => { setEditingBody(false); if (bodyDraft !== bean.body) saveBody(); }}>
          Save body
        </button>
        <button type="button" onClick={() => { setBodyDraft(bean.body); setEditingBody(false); }}>
          Cancel
        </button>
      </div>
    </>
  ) : (
    <>
      <div
        className="bean-detail-body"
        // Sanitized via renderMarkdown()'s DOMPurify step before reaching the DOM.
        dangerouslySetInnerHTML={{ __html: renderMarkdown(bean.body) }}
      />
      <div className="bean-detail-body-actions">
        <button type="button" onClick={() => { setBodyDraft(bean.body); setEditingBody(true); }}>
          Edit body
        </button>
      </div>
    </>
  )}
</section>
```

Remove the earlier standalone rendered-body `div` (now merged here) and the old `<BodyEditor>` import/usage and its "Save body" button. `saveBody()` already exists (mutates when `bodyDraft !== bean.body`).

- [ ] **Step 4: Handle BodyEditor**

If `BodyEditor` is no longer imported anywhere, delete `apps/web/src/components/BodyEditor.tsx` and `apps/web/src/components/BodyEditor.test.tsx` (knip will flag them otherwise). Verify with `grep -r BodyEditor apps/web/src`.

- [ ] **Step 5: Styles**

```css
.bean-detail-body-actions { display: flex; gap: 0.6rem; margin-top: 0.75rem; }
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @beans-frontend/web test beanDetail && pnpm knip`
Expected: PASS; knip clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(web): toggle bean body between rendered and raw edit"
```

---

## Task 15: `BeanPicker` modal

**Files:**
- Create: `apps/web/src/components/BeanPicker.tsx`
- Test: `apps/web/src/components/BeanPicker.test.tsx`
- Modify: `apps/web/src/theme/global.css` (sheet/dialog + rows)

**Interfaces:**
- Produces:
  ```ts
  interface BeanPickerProps {
    open: boolean;
    title: string;
    candidates: Bean[];        // already validity-filtered by the caller
    mode: "single" | "multi";
    allowNone?: boolean;       // single mode: show a "(none)" clear row
    onPick: (ids: string[]) => void; // single -> [id] or []; multi -> selected ids
    onClose: () => void;
  }
  export function BeanPicker(props: BeanPickerProps): JSX.Element | null;
  ```
  Renders `ConfirmDialog`-style modal shell (backdrop, focus trap, Escape → `onClose`). Contains a search input, the Type/Status/Prefix `CheckboxMenu`s (Status defaults to open statuses), and the candidate list as bean rows filtered by search + facets. Single mode: clicking a row calls `onPick([id])` and closes; `(none)` calls `onPick([])`. Multi mode: checkboxes + an "Add N" button calling `onPick(selectedIds)`.

- [ ] **Step 1: Write the failing test**

`BeanPicker.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BeanPicker } from "./BeanPicker.js";
import { renderWithRouter } from "../test/renderWithRouter.js";

const candidates = [
  { id: "e1", title: "Epic one", type: "epic", status: "todo" } as never,
  { id: "e2", title: "Epic two", type: "epic", status: "completed" } as never,
];

describe("BeanPicker", () => {
  it("hides completed candidates by default and picks one in single mode", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    renderWithRouter(
      <BeanPicker open title="Set parent" candidates={candidates} mode="single" allowNone onPick={onPick} onClose={vi.fn()} />,
    );
    expect(screen.queryByText("Epic two")).not.toBeInTheDocument(); // completed hidden
    await user.click(screen.getByText("Epic one"));
    expect(onPick).toHaveBeenCalledWith(["e1"]);
  });

  it("adds multiple in multi mode", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    renderWithRouter(
      <BeanPicker open title="Add blocks" candidates={candidates} mode="multi" onPick={onPick} onClose={vi.fn()} />,
    );
    await user.click(screen.getByLabelText("Select Epic one"));
    await user.click(screen.getByRole("button", { name: /Add 1/ }));
    expect(onPick).toHaveBeenCalledWith(["e1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test BeanPicker`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/components/BeanPicker.tsx`:

```tsx
import { useState } from "react";

import { BEAN_STATUSES, BEAN_TYPES, OPEN_STATUSES } from "@beans-frontend/shared";

import { BeanTypeTag } from "./BeanTypeTag.js";
import { CheckboxMenu } from "./CheckboxMenu.js";
import { StatusDot } from "./StatusDot.js";
import { beanPrefix, distinctPrefixes } from "../lib/prefix.js";

import type { Bean } from "@beans-frontend/shared";

export interface BeanPickerProps {
  open: boolean;
  title: string;
  candidates: Bean[];
  mode: "single" | "multi";
  allowNone?: boolean;
  onPick: (ids: string[]) => void;
  onClose: () => void;
}

const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

export function BeanPicker({ open, title, candidates, mode, allowNone, onPick, onClose }: BeanPickerProps) {
  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([...OPEN_STATUSES]);
  const [prefixes, setPrefixes] = useState<string[]>([]);
  const [checked, setChecked] = useState<string[]>([]);

  if (!open) return null;

  const prefixOptions = distinctPrefixes(candidates);
  const term = search.trim().toLowerCase();
  const shown = candidates.filter((b) => {
    if (types.length > 0 && !types.includes(b.type)) return false;
    if (statuses.length > 0 && !statuses.includes(b.status)) return false;
    if (prefixes.length > 0 && !prefixes.includes(beanPrefix(b.id))) return false;
    if (term && !b.title.toLowerCase().includes(term)) return false;
    return true;
  });

  function toggleChecked(id: string) {
    setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <h2>{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <input
          className="picker-search"
          type="search"
          placeholder="Search beans…"
          aria-label="Search beans"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="picker-filters">
          <CheckboxMenu label="Type" options={toOptions(BEAN_TYPES)} selected={types} onChange={setTypes} />
          <CheckboxMenu label="Status" options={toOptions(BEAN_STATUSES)} selected={statuses} onChange={setStatuses} />
          <CheckboxMenu label="Prefix" options={toOptions(prefixOptions)} selected={prefixes} onChange={setPrefixes} />
        </div>
        <div className="picker-list">
          {mode === "single" && allowNone && (
            <button type="button" className="picker-none" onClick={() => onPick([])}>— (none) —</button>
          )}
          {shown.map((b) =>
            mode === "single" ? (
              <button key={b.id} type="button" className="picker-row" onClick={() => onPick([b.id])}>
                <BeanTypeTag type={b.type} />
                <span className="picker-row-title">{b.title}</span>
                <StatusDot status={b.status} />
              </button>
            ) : (
              <label key={b.id} className="picker-row">
                <input
                  type="checkbox"
                  aria-label={`Select ${b.title}`}
                  checked={checked.includes(b.id)}
                  onChange={() => toggleChecked(b.id)}
                />
                <BeanTypeTag type={b.type} />
                <span className="picker-row-title">{b.title}</span>
                <StatusDot status={b.status} />
              </label>
            ),
          )}
        </div>
        {mode === "multi" && (
          <div className="picker-foot">
            <button type="button" className="picker-add" disabled={checked.length === 0} onClick={() => onPick(checked)}>
              Add {checked.length}
            </button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Styles**

Add `.picker-backdrop`, `.picker` (centered on desktop; bottom-sheet under 768px), `.picker-head`, `.picker-search`, `.picker-filters`, `.picker-list`, `.picker-row`, `.picker-none`, `.picker-foot`, `.picker-add` to `global.css`, mirroring `.confirm-dialog*` for the shell. Under `@media (max-width: 768px)` position `.picker` as a bottom sheet (`inset: auto 0 0 0; border-radius: 12px 12px 0 0; max-height: 85dvh`).

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @beans-frontend/web test BeanPicker`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/BeanPicker.tsx apps/web/src/components/BeanPicker.test.tsx apps/web/src/theme/global.css
git commit -m "feat(web): add searchable bean picker modal"
```

---

## Task 16: RelationEditor → BeanPicker

**Files:**
- Rewrite: `apps/web/src/components/RelationEditor.tsx`
- Rewrite: `apps/web/src/components/RelationEditor.test.tsx`

**Interfaces:**
- Consumes: `BeanPicker`. `RelationChange` union and `RelationEditorProps` unchanged (parent still emits `setParent`, etc.).

- [ ] **Step 1: Rewrite the test**

`RelationEditor.test.tsx` — parent now opens a picker and choosing emits `setParent`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RelationEditor } from "./RelationEditor.js";
import { renderWithRouter } from "../test/renderWithRouter.js";

const bean = { id: "t1", type: "task", parentId: null, blockingIds: [], blockedByIds: [] } as never;
const candidates = [{ id: "f1", title: "Feature one", type: "feature", status: "todo" } as never];

describe("RelationEditor", () => {
  it("sets a parent through the picker", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithRouter(<RelationEditor bean={bean} candidates={candidates} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Set parent/ }));
    await user.click(screen.getByText("Feature one"));
    expect(onChange).toHaveBeenCalledWith({ kind: "setParent", parentId: "f1" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test RelationEditor`
Expected: FAIL.

- [ ] **Step 3: Rewrite RelationEditor.tsx**

Keep the current candidate-validity logic (`canParent`, exclude self / already-linked), render the current parent + blocks + blocked-by lists (with Remove buttons as today), and open a `BeanPicker` per relationship:

```tsx
import { useState } from "react";

import { canParent, validParentTypes } from "@beans-frontend/shared";

import { BeanPicker } from "./BeanPicker.js";

import type { Bean } from "@beans-frontend/shared";

export type RelationChange =
  | { kind: "setParent"; parentId: string | null }
  | { kind: "addBlocking"; targetId: string }
  | { kind: "removeBlocking"; targetId: string }
  | { kind: "addBlockedBy"; targetId: string }
  | { kind: "removeBlockedBy"; targetId: string };

export interface RelationEditorProps {
  bean: Bean;
  candidates: Bean[];
  onChange: (change: RelationChange) => void;
}

type Picker = null | "parent" | "blocking" | "blockedBy";

export function RelationEditor({ bean, candidates, onChange }: RelationEditorProps) {
  const [picker, setPicker] = useState<Picker>(null);
  const parentTypes = validParentTypes(bean.type);

  const parentOptions = candidates.filter((c) => c.id !== bean.id && canParent(bean.type, c.type));
  const blockingOptions = candidates.filter((c) => c.id !== bean.id && !bean.blockingIds.includes(c.id));
  const blockedByOptions = candidates.filter((c) => c.id !== bean.id && !bean.blockedByIds.includes(c.id));
  const titleFor = (id: string) => candidates.find((c) => c.id === id)?.title ?? id;

  return (
    <div className="relation-editor">
      {parentTypes !== null && (
        <div className="relation-editor-section">
          <h3 className="relation-editor-label">Parent</h3>
          <div className="relation-editor-current">
            {bean.parentId ? titleFor(bean.parentId) : <span className="muted">(none)</span>}
          </div>
          <button type="button" onClick={() => setPicker("parent")}>Set parent</button>
        </div>
      )}

      <div className="relation-editor-section">
        <h3 className="relation-editor-label">Blocks</h3>
        <ul className="relation-editor-list">
          {bean.blockingIds.map((id) => (
            <li key={id} className="relation-editor-item">
              <span>{titleFor(id)}</span>
              <button type="button" className="relation-editor-remove"
                onClick={() => onChange({ kind: "removeBlocking", targetId: id })}>Remove</button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setPicker("blocking")}>Add blocks</button>
      </div>

      <div className="relation-editor-section">
        <h3 className="relation-editor-label">Blocked by</h3>
        <ul className="relation-editor-list">
          {bean.blockedByIds.map((id) => (
            <li key={id} className="relation-editor-item">
              <span>{titleFor(id)}</span>
              <button type="button" className="relation-editor-remove"
                onClick={() => onChange({ kind: "removeBlockedBy", targetId: id })}>Remove</button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setPicker("blockedBy")}>Add blocked by</button>
      </div>

      <BeanPicker
        open={picker === "parent"}
        title="Set parent"
        candidates={parentOptions}
        mode="single"
        allowNone
        onClose={() => setPicker(null)}
        onPick={(ids) => {
          setPicker(null);
          onChange({ kind: "setParent", parentId: ids[0] ?? null });
        }}
      />
      <BeanPicker
        open={picker === "blocking"}
        title="Add blocks"
        candidates={blockingOptions}
        mode="multi"
        onClose={() => setPicker(null)}
        onPick={(ids) => {
          setPicker(null);
          ids.forEach((targetId) => onChange({ kind: "addBlocking", targetId }));
        }}
      />
      <BeanPicker
        open={picker === "blockedBy"}
        title="Add blocked by"
        candidates={blockedByOptions}
        mode="multi"
        onClose={() => setPicker(null)}
        onPick={(ids) => {
          setPicker(null);
          ids.forEach((targetId) => onChange({ kind: "addBlockedBy", targetId }));
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @beans-frontend/web test RelationEditor beanDetail && pnpm typecheck`
Expected: PASS. (beanDetail's relation test at line ~317 selects a parent — update it to the picker flow: click "Set parent", click the candidate.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/RelationEditor.tsx apps/web/src/components/RelationEditor.test.tsx apps/web/src/routes/beanDetail.test.tsx
git commit -m "feat(web): use bean picker for relationship editing"
```

---

## Task 17: Finish mobile touch sizing (width-based)

**Files:**
- Modify: `apps/web/src/theme/global.css`

**Interfaces:** none.

- [ ] **Step 1: Broaden the touch-sizing rules**

The earlier pass keyed sizing on `@media (pointer: coarse)`. Add the same guarantees under `@media (max-width: 768px)` so width-based mobile also gets them. Extend the existing coarse-pointer selector list to also cover the new controls, and duplicate the key rules in the 768px block:

```css
@media (max-width: 768px) {
  .side-item, .bean-row, .linked-bean-link, .view-toggle button, .nav-toggle, .filter-toggle,
  .checkbox-menu-trigger, .inline-edit-pencil, .inline-edit-save, .inline-edit-cancel,
  .picker-row, .picker-add, .relation-editor-section > button {
    min-height: 44px;
  }
  .hierarchy-caret, .hierarchy-caret-spacer { width: 2.25rem; }
  .hierarchy-caret { min-height: 44px; }
  .filter-bar input, .filter-bar select, .header-search-input, .picker-search,
  .checkbox-menu-item, .bean-detail-title-row select, .inline-edit-value select,
  .inline-edit-value input, .create-bean-field input, .create-bean-field select,
  .create-bean-field textarea, .body-editor-textarea {
    font-size: 16px;
  }
}
```

- [ ] **Step 2: Verify build + no regressions**

Run: `pnpm --filter @beans-frontend/web build`
Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/theme/global.css
git commit -m "fix(web): apply touch sizing at mobile width, not only coarse pointer"
```

---

## Task 18: Full gate, E2E, on-device visual verification

**Files:**
- Modify: `apps/web/e2e/beans.spec.ts` (extend for header search, body edit, relationship picker)

- [ ] **Step 1: Extend the E2E spec**

Update `beans.spec.ts`:
- **Header search:** type in the header search input (`getByRole("search", { name: "Global search" })`), assert a dropdown hit appears, click it, land on the bean.
- **Body edit:** on the detail page, click "Edit body", edit the textarea, click "Save body", assert the rendered body updates.
- **Relationship picker:** click "Set parent", pick a candidate in the modal, assert the linked-beans "Parent" section updates.
- Adjust the existing metadata-edit steps to the new inline-edit rows (click "Edit Type" → select in "Type editor" → "Save Type", etc.).

- [ ] **Step 2: Run the full gate**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage && pnpm knip && pnpm spell && pnpm -r build
```
Expected: all green, coverage ≥80% per package.

- [ ] **Step 3: Run E2E**

Run: `cd apps/web && pnpm exec playwright test`
Expected: PASS.

- [ ] **Step 4: On-device visual check**

Rebuild web (`pnpm --filter @beans-frontend/web build`), then screenshot at a 390px viewport with touch emulation (Playwright `devices["iPhone 13"]` or `{ viewport: {width:390,height:844}, hasTouch: true, isMobile: true }`) for: overview ledger, project list (filters collapsed + a popover open), hierarchy (collapsed, then expanded, plus a no-section project), bean detail header + body edit + relationship picker bottom sheet. Confirm touch targets and layout. Fix any issues found, re-running the affected tests.

- [ ] **Step 5: Push**

```bash
git push
```
Expected: pre-push hook runs the suite; PR #2 updates.

- [ ] **Step 6: Commit any E2E/spec changes**

```bash
git add apps/web/e2e/beans.spec.ts
git commit -m "test(web): extend e2e for search, body edit, and relationship picker"
git push
```

---

## Self-Review (spec coverage)

- **§3.1 depth 1** → Task 1. **§3.2 openByType** → Task 2.
- **§4 overview ledger** → Task 3.
- **§5.1 multi-select popovers** → Tasks 6–7. **§5.2 prefix facet** → Tasks 4, 7, 8. **§5.3 open-by-default + container edge** → Tasks 5, 8. **§5.4 tags sizing** → Task 7. **§5.5 URL persistence** → Task 8.
- **§6 header search** → Task 9.
- **§7.1 collapse on load** → Task 10. **§7.2 linked section headers + tint** → Task 11. **§7.3 flush-left** → Task 12.
- **§8.1 header inline edit** → Task 13. **§8.2 body edit/save** → Task 14. **§8.3 relationship picker** → Tasks 15–16.
- **§9 mobile sizing** → Task 17.
- **§10 testing / §11 rollout** → per-task tests + Task 18 gate/E2E/visual.
