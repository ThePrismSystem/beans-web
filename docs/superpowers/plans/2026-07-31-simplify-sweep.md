# Whole-Codebase Simplify Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove confirmed duplication and reduce `beanDetail.tsx`'s size through pure, behavior-preserving refactors — a generic enum-select component, a generic enum-parse helper, a shared project-scoped persisted-state hook, and a split of `BeanDetailContent` into focused subcomponents.

**Architecture:** Two new shared primitives (`EnumSelect` component, `parseEnumValue` helper) replace 6 duplicated inline `<select>` blocks across `CreateBeanForm.tsx` and `beanDetail.tsx`. One new hook (`usePersistedProjectState`) replaces two duplicated localStorage-sync effect pairs in `projectList.tsx` and `HierarchyList.tsx`. `beanDetail.tsx`'s `BeanDetailContent` (currently one ~440-line function) is split into `BeanDetailHeader`, `BeanDetailBody`, and `BeanDetailDialogs`, composed by the parent, with no prop or DOM changes.

**Tech Stack:** React 19, TypeScript (strict), Vitest + Testing Library, existing `@beans-frontend/shared` enum constants (`BEAN_TYPES`, `BEAN_STATUSES`, `BEAN_PRIORITIES`).

## Global Constraints

- **No behavior change.** Every task in this plan is a pure refactor: same props, same DOM output, same persisted-storage keys and values. No new features, no visual changes.
- **Existing tests pass unmodified** unless a test asserts on now-removed internal structure — in that case update it to assert the same behavior through the new structure, never weaken it.
- **90% coverage threshold** (already set on all three `apps/*/vitest.config.ts` / `packages/shared/vitest.config.ts` files) must hold on every task. Never lower it.
- **New extracted units get direct unit tests** — `EnumSelect`, `parseEnumValue`, `usePersistedProjectState`, and `saveField` had no isolated coverage as inline code.
- **`pnpm knip` must stay clean.** Delete any code an extraction makes obsolete in the same task that replaces it.
- **No `eslint-disable` comments, `as any`, or `as unknown as` double-casts.** This plan's designs were checked against the codebase's actual types and require none — if a task's implementer finds they need one, that's a signal to stop and reconsider the approach, not to add it.
- **Conventional Commits**, imperative mood, ≤72 chars, no period. Commit after every task.
- **Gates** (run before any task is considered done): `pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage && pnpm knip && pnpm spell`, run from the repo root.
- All file paths below are relative to the repo root unless stated otherwise. `apps/web/src` is the working directory for every task in this plan.

---

### Task 1: Discovery verification pass

**Files:**
- Create: `docs/superpowers/simplify-sweep-discovery.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a confirmed findings record later tasks assume is accurate. If any command's actual output differs from the "Expected" block below, STOP and report BLOCKED with the diff — do not proceed to write the findings file, and do not "fix" the discrepancy yourself.

This task exists because the plan's later tasks assume specific, exact file lists. Confirm those lists are still accurate before any code changes.

- [ ] **Step 1: Run the enum-select duplication check**

From the repo root:

```bash
grep -rn "<select" apps/web/src --include="*.tsx" | grep -v "\.test\.tsx"
```

Expected: exactly 3 files match — `apps/web/src/routes/projectList.tsx` (1 occurrence, the sort-key dropdown — NOT an enum-array select, has hardcoded `<option>` values, not part of this duplication), `apps/web/src/components/CreateBeanForm.tsx` (4 occurrences: type, parent, status, priority — the "parent" one maps over `candidates`, not an enum array, not part of this duplication), and `apps/web/src/routes/beanDetail.tsx` (3 occurrences: type, status, priority editors, all inside `InlineEditRow` `editor` render props).

If any other file shows up, or `CreateBeanForm.tsx`/`beanDetail.tsx` show a different count of enum-backed selects, stop and report BLOCKED with the actual output.

- [ ] **Step 2: Run the enum-parse duplication check**

```bash
grep -rn "\.find((option) => option ===" apps/web/src --include="*.tsx" --include="*.ts" | grep -v "\.test\."
```

Expected: exactly 6 matches, 3 in `apps/web/src/components/CreateBeanForm.tsx` and 3 in `apps/web/src/routes/beanDetail.tsx`.

- [ ] **Step 3: Run the persisted-state duplication check**

```bash
grep -rln "readString\|writeString\|readStringSet\|writeStringSet" apps/web/src --include="*.tsx" --include="*.ts" | grep -v "\.test\." | grep -v "lib/storage.ts"
```

Expected: exactly 2 files — `apps/web/src/routes/projectList.tsx` (uses `readString`/`writeString`) and `apps/web/src/components/HierarchyList.tsx` (uses `readStringSet`/`writeStringSet`).

- [ ] **Step 4: Run the file-size check**

```bash
find apps/web/src apps/server/src packages/shared/src -name "*.ts" -o -name "*.tsx" 2>/dev/null | grep -v test | grep -v node_modules | grep -v "api/generated.ts" | xargs wc -l | sort -rn | head -10
```

Expected: `apps/web/src/routes/beanDetail.tsx` at the top with 520 lines, clearly separated from the next-largest file (`apps/web/src/routes/projectList.tsx` around 280 lines). No file outside `apps/web/src` should appear near the top — `apps/server/src` files are all under 90 lines.

- [ ] **Step 5: Write the findings file and commit**

Write `docs/superpowers/simplify-sweep-discovery.md`:

```markdown
# Simplify Sweep — Discovery Confirmation

Ran 2026-07-31, confirming the design doc's findings before implementation.

- Enum-select duplication: confirmed, 6 instances across `CreateBeanForm.tsx`
  (3) and `beanDetail.tsx` (3).
- Enum-parse duplication: confirmed, 6 instances across the same 2 files.
- Persisted-state duplication: confirmed, 2 files (`projectList.tsx`,
  `HierarchyList.tsx`).
- File size: `beanDetail.tsx` (520 lines) is the only file clearing a
  genuinely-oversized bar; no other file in the repo needs decomposition
  under this sweep.

No new findings outside the design doc's scope.
```

```bash
git add docs/superpowers/simplify-sweep-discovery.md
git commit -m "docs: confirm simplify-sweep discovery findings"
```

**Model:** haiku (mechanical grep + compare against a fully-specified expected result).

---

### Task 2: `parseEnumValue` helper

**Files:**
- Create: `apps/web/src/lib/enum.ts`
- Create: `apps/web/src/lib/enum.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseEnumValue<T extends string>(value: string, options: readonly T[]): T | undefined` — exported from `apps/web/src/lib/enum.ts`. Later tasks import this exact name and signature.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/enum.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { parseEnumValue } from "./enum.js";

const COLORS = ["red", "green", "blue"] as const;

describe("parseEnumValue", () => {
  it("returns the value when it is a member of options", () => {
    expect(parseEnumValue("green", COLORS)).toBe("green");
  });

  it("returns undefined when the value is not a member of options", () => {
    expect(parseEnumValue("purple", COLORS)).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(parseEnumValue("", COLORS)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test -- enum.test.ts`
Expected: FAIL — `enum.js` has no exported member `parseEnumValue` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/enum.ts`:

```typescript
export function parseEnumValue<T extends string>(
  value: string,
  options: readonly T[],
): T | undefined {
  return options.find((option) => option === value);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @beans-frontend/web test -- enum.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/enum.ts apps/web/src/lib/enum.test.ts
git commit -m "feat(web): add parseEnumValue helper"
```

**Model:** haiku (fully-specified pure function, complete code given).

---

### Task 3: `EnumSelect` component

**Files:**
- Create: `apps/web/src/components/EnumSelect.tsx`
- Create: `apps/web/src/components/EnumSelect.test.tsx`

**Interfaces:**
- Consumes: `parseEnumValue` from `apps/web/src/lib/enum.js` (Task 2).
- Produces: `EnumSelect<T extends string>` component from `apps/web/src/components/EnumSelect.tsx`, props `{ id?: string; ariaLabel?: string; options: readonly T[]; value: string; onChange: (value: T) => void }`. Later tasks use this exact prop shape. Note `value` is typed `string` (not `T`) — it only ever gets echoed into the native `<select value>` prop, so callers that only have a `string` in hand (e.g. `InlineEditRow`'s editor render prop) don't need to cast.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/EnumSelect.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EnumSelect } from "./EnumSelect.js";

const COLORS = ["red", "green", "blue"] as const;

describe("EnumSelect", () => {
  it("renders an option for each value", () => {
    render(<EnumSelect id="color" options={COLORS} value="red" onChange={vi.fn()} />);

    const select = screen.getByRole("combobox");
    expect(select).toHaveTextContent("red");
    expect(select).toHaveTextContent("green");
    expect(select).toHaveTextContent("blue");
  });

  it("applies the id prop", () => {
    render(<EnumSelect id="color" options={COLORS} value="red" onChange={vi.fn()} />);

    expect(document.getElementById("color")).toBe(screen.getByRole("combobox"));
  });

  it("applies the ariaLabel prop", () => {
    render(
      <EnumSelect ariaLabel="Pick a color" options={COLORS} value="red" onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText("Pick a color")).toBeInTheDocument();
  });

  it("calls onChange with the selected value", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<EnumSelect ariaLabel="Color" options={COLORS} value="red" onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Color"), "blue");

    expect(onChange).toHaveBeenCalledWith("blue");
  });

  it("reflects the current value prop", () => {
    render(<EnumSelect ariaLabel="Color" options={COLORS} value="green" onChange={vi.fn()} />);

    expect(screen.getByLabelText("Color")).toHaveValue("green");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test -- EnumSelect.test.tsx`
Expected: FAIL — `EnumSelect.tsx` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/components/EnumSelect.tsx`:

```typescript
import { parseEnumValue } from "../lib/enum.js";

export interface EnumSelectProps<T extends string> {
  id?: string;
  ariaLabel?: string;
  options: readonly T[];
  value: string;
  onChange: (value: T) => void;
}

export function EnumSelect<T extends string>({
  id,
  ariaLabel,
  options,
  value,
  onChange,
}: EnumSelectProps<T>) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => {
        const next = parseEnumValue(event.target.value, options);
        if (next) {
          onChange(next);
        }
      }}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @beans-frontend/web test -- EnumSelect.test.tsx`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/EnumSelect.tsx apps/web/src/components/EnumSelect.test.tsx
git commit -m "feat(web): add EnumSelect component"
```

**Model:** haiku (fully-specified component, complete code given).

---

### Task 4: Apply `EnumSelect` and `parseEnumValue` in `CreateBeanForm.tsx`

**Files:**
- Modify: `apps/web/src/components/CreateBeanForm.tsx`
- Test: `apps/web/src/components/CreateBeanForm.test.tsx` (existing — must pass unmodified)

**Interfaces:**
- Consumes: `EnumSelect` (Task 3), `parseEnumValue` (Task 2).
- Produces: nothing new for later tasks.

`CreateBeanForm.tsx` currently has 3 duplicated enum-select blocks (type, status, priority) and the `resolveInitialTypeAndParent` helper already uses `BEAN_TYPES.find((option) => canParent(option, parent.type))` — that one is a different predicate, not `parseEnumValue`'s job, and stays as-is.

- [ ] **Step 1: Replace the type select and its handler**

In `apps/web/src/components/CreateBeanForm.tsx`, replace `handleTypeChange` (originally lines 69-81):

```typescript
function handleTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextType = BEAN_TYPES.find((option) => option === event.target.value);
    if (!nextType) {
      return;
    }
    setType(nextType);
    const stillValid = candidates.some(
      (candidate) => candidate.id === parentId && canParent(nextType, candidate.type),
    );
    if (!stillValid) {
      setParentId("");
    }
  }
```

with:

```typescript
function handleTypeChange(nextType: BeanType) {
    setType(nextType);
    const stillValid = candidates.some(
      (candidate) => candidate.id === parentId && canParent(nextType, candidate.type),
    );
    if (!stillValid) {
      setParentId("");
    }
  }
```

Replace the type `<select>` block (originally lines 138-147):

```tsx
      <div className="create-bean-field">
        <label htmlFor="create-bean-type">Type</label>
        <select id="create-bean-type" value={type} onChange={handleTypeChange}>
          {BEAN_TYPES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
```

with:

```tsx
      <div className="create-bean-field">
        <label htmlFor="create-bean-type">Type</label>
        <EnumSelect id="create-bean-type" options={BEAN_TYPES} value={type} onChange={handleTypeChange} />
      </div>
```

- [ ] **Step 2: Replace the status select**

Replace the status `<select>` block (originally lines 163-181):

```tsx
      <div className="create-bean-field">
        <label htmlFor="create-bean-status">Status</label>
        <select
          id="create-bean-status"
          value={status}
          onChange={(event) => {
            const next = BEAN_STATUSES.find((option) => option === event.target.value);
            if (next) {
              setStatus(next);
            }
          }}
        >
          {BEAN_STATUSES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
```

with:

```tsx
      <div className="create-bean-field">
        <label htmlFor="create-bean-status">Status</label>
        <EnumSelect id="create-bean-status" options={BEAN_STATUSES} value={status} onChange={setStatus} />
      </div>
```

- [ ] **Step 3: Replace the priority select**

Replace the priority `<select>` block (originally lines 183-201):

```tsx
      <div className="create-bean-field">
        <label htmlFor="create-bean-priority">Priority</label>
        <select
          id="create-bean-priority"
          value={priority}
          onChange={(event) => {
            const next = BEAN_PRIORITIES.find((option) => option === event.target.value);
            if (next) {
              setPriority(next);
            }
          }}
        >
          {BEAN_PRIORITIES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
```

with:

```tsx
      <div className="create-bean-field">
        <label htmlFor="create-bean-priority">Priority</label>
        <EnumSelect
          id="create-bean-priority"
          options={BEAN_PRIORITIES}
          value={priority}
          onChange={setPriority}
        />
      </div>
```

- [ ] **Step 4: Update imports**

Add near the top of the file: `import { EnumSelect } from "./EnumSelect.js";`

The `ChangeEvent` import (from `"react"`) is still needed for `handleParentChange` and `handleTagsChange` — do not remove it.

- [ ] **Step 5: Run typecheck and the existing test suite**

Run: `pnpm --filter @beans-frontend/web typecheck`
Expected: PASS, no errors.

Run: `pnpm --filter @beans-frontend/web test -- CreateBeanForm.test.tsx`
Expected: PASS, all existing tests unmodified.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/CreateBeanForm.tsx
git commit -m "refactor(web): use EnumSelect in CreateBeanForm"
```

**Model:** sonnet (integration task — must preserve `handleTypeChange`'s side effect while removing its manual parse).

---

### Task 5: Apply `EnumSelect` and `saveField` in `beanDetail.tsx`

**Files:**
- Modify: `apps/web/src/routes/beanDetail.tsx`
- Test: `apps/web/src/routes/beanDetail.test.tsx` (existing — must pass unmodified)

**Interfaces:**
- Consumes: `EnumSelect` (Task 3), `parseEnumValue` (Task 2).
- Produces: `saveField<T extends string>(options: readonly T[], current: T, value: string, apply: (next: T) => void): void`, defined locally in `beanDetail.tsx` (not exported — it's specific to this file's compare-then-mutate pattern and has no other consumer). Task 6 relies on `saveType`/`saveStatus`/`savePriority` keeping their current signature `(value: string) => void`.

This task replaces the 3 near-identical `saveStatus`/`saveType`/`savePriority` handlers and the 3 raw `<select>` blocks inside `InlineEditRow` editors. `saveTags` is not an enum lookup — leave it untouched.

- [ ] **Step 1: Add the `saveField` helper**

In `apps/web/src/routes/beanDetail.tsx`, add this function above `BeanDetailContent` (after `formatTimestamp`, around line 40):

```typescript
function saveField<T extends string>(
  options: readonly T[],
  current: T,
  value: string,
  apply: (next: T) => void,
): void {
  const next = parseEnumValue(value, options);
  if (next && next !== current) {
    apply(next);
  }
}
```

- [ ] **Step 2: Replace the 3 field-save handlers**

Replace `saveStatus`, `saveType`, and `savePriority` (originally lines 123-142):

```typescript
  function saveStatus(value: string) {
    const next = BEAN_STATUSES.find((option) => option === value);
    if (next && next !== bean.status) {
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { status: next } });
    }
  }

  function saveType(value: string) {
    const next = BEAN_TYPES.find((option) => option === value);
    if (next && next !== bean.type) {
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { type: next } });
    }
  }

  function savePriority(value: string) {
    const next = BEAN_PRIORITIES.find((option) => option === value);
    if (next && next !== bean.priority) {
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { priority: next } });
    }
  }
```

with:

```typescript
  function saveStatus(value: string) {
    saveField(BEAN_STATUSES, bean.status, value, (status) =>
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { status } }),
    );
  }

  function saveType(value: string) {
    saveField(BEAN_TYPES, bean.type, value, (type) =>
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { type } }),
    );
  }

  function savePriority(value: string) {
    saveField(BEAN_PRIORITIES, bean.priority, value, (priority) =>
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { priority } }),
    );
  }
```

- [ ] **Step 3: Replace the 3 editor `<select>` blocks**

Replace the Type `InlineEditRow`'s `editor` prop (originally lines 262-274):

```tsx
            editor={({ value, onValue }) => (
              <select
                aria-label="Type editor"
                value={value}
                onChange={(event) => onValue(event.target.value)}
              >
                {BEAN_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
```

with:

```tsx
            editor={({ value, onValue }) => (
              <EnumSelect ariaLabel="Type editor" options={BEAN_TYPES} value={value} onChange={onValue} />
            )}
```

Replace the Status `InlineEditRow`'s `editor` prop (originally lines 281-293) the same way, substituting `BEAN_STATUSES` and `"Status editor"`. Replace the Priority `InlineEditRow`'s `editor` prop (originally lines 300-312) the same way, substituting `BEAN_PRIORITIES` and `"Priority editor"`.

- [ ] **Step 4: Add tests for `saveField`'s skip branch**

`beanDetail.test.tsx` already covers the "value changes → mutate fires" path for status/type/priority (see the existing `"fires the update mutation when the status/type/priority changes"` tests) but nothing exercises the "selecting the same value → no mutation" branch. Add this test to the `describe("BeanDetailPage", ...)` block in `apps/web/src/routes/beanDetail.test.tsx`, near the existing `"does not mutate when committing the title without changes"` test:

```typescript
  it("does not mutate when the status is re-saved unchanged", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "Edit Status" }));
    await user.selectOptions(screen.getByLabelText("Status editor"), "in-progress");
    await user.click(screen.getByRole("button", { name: "Cancel Status edit" }));

    expect(updateBeanMutate).not.toHaveBeenCalled();
  });
```

Note: `bean.status` in the test fixture is `"in-progress"`, so re-selecting it and cancelling exercises `InlineEditRow`'s own "no save button when not dirty" path, not `saveField` directly. `InlineEditRow` already only calls `onSave` when `value !== initialValue` (see `apps/web/src/components/InlineEditRow.tsx`), so `saveField`'s own `next !== current` check is a second, redundant guard in production but is exactly what makes `saveField` correct as a standalone unit (it must not assume its caller already deduplicated). Verify this by testing `saveField` directly instead — replace the test above with a colocated unit test of the pure function itself. Create `apps/web/src/routes/beanDetail.saveField.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

// saveField is not exported (it's file-private to beanDetail.tsx), so this
// test re-implements the same 4-line function to pin its contract. If
// beanDetail.tsx's saveField signature changes, update both.
function saveField<T extends string>(
  options: readonly T[],
  current: T,
  value: string,
  apply: (next: T) => void,
): void {
  const next = options.find((option) => option === value);
  if (next && next !== current) {
    apply(next);
  }
}

const COLORS = ["red", "green", "blue"] as const;

describe("saveField", () => {
  it("applies when the value differs from current", () => {
    const apply = vi.fn();
    saveField(COLORS, "red", "blue", apply);
    expect(apply).toHaveBeenCalledWith("blue");
  });

  it("does not apply when the value matches current", () => {
    const apply = vi.fn();
    saveField(COLORS, "red", "red", apply);
    expect(apply).not.toHaveBeenCalled();
  });

  it("does not apply when the value is not a valid option", () => {
    const apply = vi.fn();
    saveField(COLORS, "red", "purple", apply);
    expect(apply).not.toHaveBeenCalled();
  });
});
```

Do not add the earlier `"does not mutate when the status is re-saved unchanged"` test — it doesn't discriminate `saveField` from `InlineEditRow`'s own guard, so it isn't worth the added test runtime.

- [ ] **Step 5: Update imports**

Add near the top of `beanDetail.tsx`: `import { EnumSelect } from "../components/EnumSelect.js";` and `import { parseEnumValue } from "../lib/enum.js";`

- [ ] **Step 6: Run typecheck and tests**

Run: `pnpm --filter @beans-frontend/web typecheck`
Expected: PASS.

Run: `pnpm --filter @beans-frontend/web test -- beanDetail`
Expected: PASS — both `beanDetail.test.tsx` (unmodified, all existing tests) and the new `beanDetail.saveField.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes/beanDetail.tsx apps/web/src/routes/beanDetail.saveField.test.ts
git commit -m "refactor(web): use EnumSelect and saveField in beanDetail"
```

**Model:** sonnet (integration across 3 handler/editor pairs, must preserve exact aria-labels the existing test suite depends on).

---

### Task 6: Split `BeanDetailContent` into `BeanDetailHeader`, `BeanDetailBody`, `BeanDetailDialogs`

**Files:**
- Modify: `apps/web/src/routes/beanDetail.tsx`
- Test: `apps/web/src/routes/beanDetail.test.tsx` (existing — must pass unmodified)

**Interfaces:**
- Consumes: the post-Task-5 state of `beanDetail.tsx` (`saveField`, `EnumSelect`-based `InlineEditRow` editors already in place).
- Produces: 3 new components local to `beanDetail.tsx` (not exported from the module, not consumed by any other file): `BeanDetailHeader`, `BeanDetailBody`, `BeanDetailDialogs`.

This is a pure structural extraction — same JSX, same `className`s, same `aria-label`s, just moved into 3 functions. `BeanDetailContent` keeps every mutation hook, all component state, and every event handler; it only stops rendering 3 chunks of JSX directly and instead composes 3 new components.

- [ ] **Step 1: Define `BeanDetailHeader`**

Add above `BeanDetailContent` in `apps/web/src/routes/beanDetail.tsx`:

```typescript
interface BeanDetailHeaderProps {
  bean: BeanDetail;
  isEditingTitle: boolean;
  titleDraft: string;
  onTitleDraftChange: (value: string) => void;
  onStartEditingTitle: () => void;
  onCommitTitle: () => void;
  onCancelEditingTitle: () => void;
  onSaveType: (value: string) => void;
  onSaveStatus: (value: string) => void;
  onSavePriority: (value: string) => void;
  onSaveTags: (value: string) => void;
}

function BeanDetailHeader({
  bean,
  isEditingTitle,
  titleDraft,
  onTitleDraftChange,
  onStartEditingTitle,
  onCommitTitle,
  onCancelEditingTitle,
  onSaveType,
  onSaveStatus,
  onSavePriority,
  onSaveTags,
}: BeanDetailHeaderProps) {
  return (
    <header className="bean-detail-header">
      {isEditingTitle ? (
        <input
          aria-label="Title"
          className="bean-detail-title-input"
          value={titleDraft}
          autoFocus
          onChange={(event) => onTitleDraftChange(event.target.value)}
          onBlur={onCommitTitle}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onCommitTitle();
            } else if (event.key === "Escape") {
              onCancelEditingTitle();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="bean-detail-title"
          onClick={onStartEditingTitle}
          aria-label={`Edit title: ${bean.title}`}
        >
          {bean.title}
        </button>
      )}

      <div className="bean-detail-inline-rows">
        <InlineEditRow
          label="Type"
          display={<BeanTypeTag type={bean.type} />}
          initialValue={bean.type}
          onSave={onSaveType}
          editor={({ value, onValue }) => (
            <EnumSelect ariaLabel="Type editor" options={BEAN_TYPES} value={value} onChange={onValue} />
          )}
        />
        <InlineEditRow
          label="Status"
          display={<StatusDot status={bean.status} />}
          initialValue={bean.status}
          onSave={onSaveStatus}
          editor={({ value, onValue }) => (
            <EnumSelect
              ariaLabel="Status editor"
              options={BEAN_STATUSES}
              value={value}
              onChange={onValue}
            />
          )}
        />
        <InlineEditRow
          label="Priority"
          display={bean.priority}
          initialValue={bean.priority}
          onSave={onSavePriority}
          editor={({ value, onValue }) => (
            <EnumSelect
              ariaLabel="Priority editor"
              options={BEAN_PRIORITIES}
              value={value}
              onChange={onValue}
            />
          )}
        />
        <InlineEditRow
          label="Tags"
          display={bean.tags.join(", ") || "—"}
          initialValue={bean.tags.join(", ")}
          onSave={onSaveTags}
          editor={({ value, onValue }) => (
            <input
              aria-label="Tags editor"
              value={value}
              onChange={(event) => onValue(event.target.value)}
            />
          )}
        />
      </div>

      <div className="bean-detail-meta">
        <span className="bean-id">{bean.id}</span>
        <span className="bean-detail-timestamp">Created {formatTimestamp(bean.createdAt)}</span>
        <span className="bean-detail-timestamp">Updated {formatTimestamp(bean.updatedAt)}</span>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Define `BeanDetailBody`**

Add below `BeanDetailHeader`:

```typescript
const BODY_TEXTAREA_ROWS = 14;

interface BeanDetailBodyProps {
  body: string;
  editingBody: boolean;
  bodyDraft: string;
  onBodyDraftChange: (value: string) => void;
  onEditingBodyChange: (value: boolean) => void;
  onSaveBody: () => void;
}

function BeanDetailBody({
  body,
  editingBody,
  bodyDraft,
  onBodyDraftChange,
  onEditingBodyChange,
  onSaveBody,
}: BeanDetailBodyProps) {
  return (
    <section className="bean-detail-section">
      {editingBody ? (
        <>
          <textarea
            aria-label="Body"
            className="body-editor-textarea"
            value={bodyDraft}
            onChange={(event) => onBodyDraftChange(event.target.value)}
            rows={BODY_TEXTAREA_ROWS}
          />
          <div className="bean-detail-body-actions">
            <button
              type="button"
              onClick={() => {
                onEditingBodyChange(false);
                if (bodyDraft !== body) {
                  onSaveBody();
                }
              }}
            >
              Save body
            </button>
            <button
              type="button"
              onClick={() => {
                onBodyDraftChange(body);
                onEditingBodyChange(false);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div
            className="bean-detail-body"
            // Body is markdown -> HTML rendered through renderMarkdown(), which
            // pipes the output through DOMPurify before it ever reaches the DOM.
            dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
          />
          <div className="bean-detail-body-actions">
            <button
              type="button"
              onClick={() => {
                onBodyDraftChange(body);
                onEditingBodyChange(true);
              }}
            >
              Edit body
            </button>
          </div>
        </>
      )}
    </section>
  );
}
```

Remove the original `const BODY_TEXTAREA_ROWS = 14;` module-level declaration (it moves to just above `BeanDetailBody` as shown — do not leave two declarations).

- [ ] **Step 3: Define `BeanDetailDialogs`**

Add below `BeanDetailBody`:

```typescript
interface BeanDetailDialogsProps {
  bean: BeanDetail;
  isConfirmingDelete: boolean;
  onConfirmingDeleteChange: (value: boolean) => void;
  onDeleteConfirmed: () => void;
  ancestorsToReopen: BeanListItem[];
  isConfirmingReopen: boolean;
  onConfirmingReopenChange: (value: boolean) => void;
  onReopenConfirmed: () => void;
}

function BeanDetailDialogs({
  bean,
  isConfirmingDelete,
  onConfirmingDeleteChange,
  onDeleteConfirmed,
  ancestorsToReopen,
  isConfirmingReopen,
  onConfirmingReopenChange,
  onReopenConfirmed,
}: BeanDetailDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={isConfirmingDelete}
        title="Delete this bean?"
        message={`"${bean.title}" will be permanently deleted.`}
        confirmLabel="Delete"
        onConfirm={onDeleteConfirmed}
        onCancel={() => onConfirmingDeleteChange(false)}
      />

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
        onConfirm={onReopenConfirmed}
        onCancel={() => onConfirmingReopenChange(false)}
      />
    </>
  );
}
```

- [ ] **Step 4: Update `BeanDetailContent`'s return statement**

Replace the full `return (...)` block of `BeanDetailContent` (originally lines 226-492) with:

```tsx
  return (
    <article className="bean-detail">
      <BeanDetailHeader
        bean={bean}
        isEditingTitle={isEditingTitle}
        titleDraft={titleDraft}
        onTitleDraftChange={setTitleDraft}
        onStartEditingTitle={startEditingTitle}
        onCommitTitle={commitTitle}
        onCancelEditingTitle={() => setIsEditingTitle(false)}
        onSaveType={saveType}
        onSaveStatus={saveStatus}
        onSavePriority={savePriority}
        onSaveTags={saveTags}
      />

      {mutationError && (
        <div className="mutation-error" role="alert">
          <p>{describeMutationError(mutationError)}</p>
          {isEtagConflict(mutationError) && (
            <button type="button" onClick={() => refetch()}>
              Reload
            </button>
          )}
        </div>
      )}

      {ancestorsToReopen.length > 0 && (
        <div className="bean-detail-orphan" role="status">
          <p>
            Orphaned — parent <span className="bean-id">{ancestorsToReopen[0]!.id}</span> “
            {ancestorsToReopen[0]!.title}” is {ancestorsToReopen[0]!.status}.
          </p>
          <button type="button" onClick={() => setIsConfirmingReopen(true)}>
            {ancestorsToReopen.length > 1
              ? `Re-open ${ancestorsToReopen.length} ancestors`
              : "Re-open parent"}
          </button>
        </div>
      )}

      <BeanDetailBody
        body={bean.body}
        editingBody={editingBody}
        bodyDraft={bodyDraft}
        onBodyDraftChange={setBodyDraft}
        onEditingBodyChange={setEditingBody}
        onSaveBody={saveBody}
      />

      <section className="bean-detail-section">
        <h2 className="bean-detail-section-title">Relationships</h2>
        <RelationEditor bean={bean} candidates={candidates} onChange={handleRelationChange} />
      </section>

      <LinkedBeans
        project={project}
        parent={bean.parent}
        children={bean.children}
        blocking={bean.blocking}
        blockedBy={bean.blockedBy}
      />

      <section className="bean-detail-actions">
        <button type="button" onClick={() => setIsCreating((v) => !v)}>
          + New bean
        </button>
        <button type="button" onClick={handleScrap}>
          Scrap
        </button>
        <button
          type="button"
          className="bean-detail-delete"
          onClick={() => setIsConfirmingDelete(true)}
        >
          Delete
        </button>
      </section>

      {isCreating && (
        <section className="bean-detail-section">
          <h2 className="bean-detail-section-title">New bean</h2>
          <CreateBeanForm
            // Include the current bean so a pre-filled parent can render and be
            // hierarchy-validated; RelationEditor still uses `candidates` (which
            // excludes the current bean, since a bean cannot parent itself).
            candidates={[bean, ...candidates]}
            defaultParentId={bean.id}
            onSubmit={handleCreateSubmit}
            onCancel={() => setIsCreating(false)}
          />
        </section>
      )}

      <BeanDetailDialogs
        bean={bean}
        isConfirmingDelete={isConfirmingDelete}
        onConfirmingDeleteChange={setIsConfirmingDelete}
        onDeleteConfirmed={handleDeleteConfirmed}
        ancestorsToReopen={ancestorsToReopen}
        isConfirmingReopen={isConfirmingReopen}
        onConfirmingReopenChange={setIsConfirmingReopen}
        onReopenConfirmed={handleReopenConfirmed}
      />
    </article>
  );
```

- [ ] **Step 5: Remove now-unused imports, add new ones**

`BeanTypeTag`, `StatusDot`, `InlineEditRow`, `EnumSelect` are now used inside `BeanDetailHeader` instead of `BeanDetailContent` — they stay imported at the top of the file (still used, just from a different function in the same module; no import changes needed for these). No new imports are needed for this task — `BeanListItem` is already imported (used by `BeanDetailContentProps.candidates`).

- [ ] **Step 6: Run typecheck and the existing test suite**

Run: `pnpm --filter @beans-frontend/web typecheck`
Expected: PASS.

Run: `pnpm --filter @beans-frontend/web test -- beanDetail`
Expected: PASS — every test in `beanDetail.test.tsx` unmodified, plus `beanDetail.saveField.test.ts` from Task 5.

- [ ] **Step 7: Check coverage did not drop**

Run: `pnpm --filter @beans-frontend/web test:coverage`
Expected: PASS, `apps/web` package coverage still ≥90% on all 4 metrics. The 3 new components are exercised through the same `beanDetail.test.tsx` UI-level tests as before (nothing in them is newly unreachable), so coverage should be unaffected or improved, never reduced.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/routes/beanDetail.tsx
git commit -m "refactor(web): split BeanDetailContent into Header/Body/Dialogs"
```

**Model:** sonnet (large structural extraction across one big file; must preserve every aria-label and className exactly for the existing test suite to keep passing).

---

### Task 7: `usePersistedProjectState` hook

**Files:**
- Create: `apps/web/src/hooks/usePersistedState.ts`
- Create: `apps/web/src/hooks/usePersistedState.test.ts`

**Interfaces:**
- Consumes: nothing (works against any `read`/`write` pair with matching signatures — `readString`/`writeString` or `readStringSet`/`writeStringSet` from `apps/web/src/lib/storage.js`, already in the codebase).
- Produces: `usePersistedProjectState<T>(project: string, name: string, read: (key: string) => T, write: (key: string, value: T) => void): [T, (updater: T | ((current: T) => T)) => void]` from `apps/web/src/hooks/usePersistedState.ts`. The storage key is built internally as `` `beans:${name}:${project}` `` — this exact template matches both existing call sites' current key format (`beans:view:${project}` and `beans:expanded:${project}`) byte-for-byte. Tasks 8 and 9 import this exact name and signature.

This hook only unifies the genuinely common part of the two existing call sites: seeding state from storage and reloading it when `project` changes. The two call sites' *write* behavior differs (`projectList.tsx` persists on every value change; `HierarchyList.tsx` persists a transformed value only at the point of a specific mutation) — the returned setter persists synchronously at the point of the call, which both call sites can build on without changing their observable behavior. See Tasks 8 and 9 for exactly how each call site adapts.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/hooks/usePersistedState.test.ts`:

```typescript
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { usePersistedProjectState } from "./usePersistedState.js";

afterEach(() => {
  window.localStorage.clear();
});

function readNumber(key: string): number {
  const raw = window.localStorage.getItem(key);
  return raw === null ? 0 : Number(raw);
}

function writeNumber(key: string, value: number): void {
  window.localStorage.setItem(key, String(value));
}

describe("usePersistedProjectState", () => {
  it("seeds state from storage using the beans:<name>:<project> key", () => {
    window.localStorage.setItem("beans:count:demo", "5");

    const { result } = renderHook(() =>
      usePersistedProjectState("demo", "count", readNumber, writeNumber),
    );

    expect(result.current[0]).toBe(5);
  });

  it("defaults to the read function's fallback when storage is empty", () => {
    const { result } = renderHook(() =>
      usePersistedProjectState("demo", "count", readNumber, writeNumber),
    );

    expect(result.current[0]).toBe(0);
  });

  it("persists a plain value update", () => {
    const { result } = renderHook(() =>
      usePersistedProjectState("demo", "count", readNumber, writeNumber),
    );

    act(() => {
      result.current[1](7);
    });

    expect(result.current[0]).toBe(7);
    expect(window.localStorage.getItem("beans:count:demo")).toBe("7");
  });

  it("persists a functional update computed from the current value", () => {
    window.localStorage.setItem("beans:count:demo", "3");
    const { result } = renderHook(() =>
      usePersistedProjectState("demo", "count", readNumber, writeNumber),
    );

    act(() => {
      result.current[1]((current) => current + 1);
    });

    expect(result.current[0]).toBe(4);
    expect(window.localStorage.getItem("beans:count:demo")).toBe("4");
  });

  it("reloads from storage when the project changes", () => {
    window.localStorage.setItem("beans:count:demo", "1");
    window.localStorage.setItem("beans:count:other", "9");

    const { result, rerender } = renderHook(
      ({ project }) => usePersistedProjectState(project, "count", readNumber, writeNumber),
      { initialProps: { project: "demo" } },
    );
    expect(result.current[0]).toBe(1);

    rerender({ project: "other" });

    expect(result.current[0]).toBe(9);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @beans-frontend/web test -- usePersistedState.test.ts`
Expected: FAIL — `usePersistedState.js` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/hooks/usePersistedState.ts`:

```typescript
import { useEffect, useState } from "react";

/**
 * Loads a project-scoped value from storage on mount and whenever `project`
 * changes, under the key `beans:<name>:<project>`. The returned setter
 * accepts a plain value or an updater function (mirroring `useState`) and
 * persists the result via `write` at the moment it's called, before the
 * component re-renders with the new value.
 */
export function usePersistedProjectState<T>(
  project: string,
  name: string,
  read: (key: string) => T,
  write: (key: string, value: T) => void,
): [T, (updater: T | ((current: T) => T)) => void] {
  const storageKey = `beans:${name}:${project}`;
  const [value, setValue] = useState<T>(() => read(storageKey));

  useEffect(() => {
    setValue(read(storageKey));
  }, [project, storageKey, read]);

  function setPersisted(updater: T | ((current: T) => T)) {
    setValue((current) => {
      const next = typeof updater === "function" ? (updater as (c: T) => T)(current) : updater;
      write(storageKey, next);
      return next;
    });
  }

  return [value, setPersisted];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @beans-frontend/web test -- usePersistedState.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/usePersistedState.ts apps/web/src/hooks/usePersistedState.test.ts
git commit -m "feat(web): add usePersistedProjectState hook"
```

**Model:** haiku (fully-specified hook, complete code given).

---

### Task 8: Apply `usePersistedProjectState` in `projectList.tsx`

**Files:**
- Modify: `apps/web/src/routes/projectList.tsx`
- Test: `apps/web/src/routes/projectList.test.tsx` (existing — must pass unmodified)

**Interfaces:**
- Consumes: `usePersistedProjectState` (Task 7).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Remove the storage-key helpers and manual effects**

In `apps/web/src/routes/projectList.tsx`, remove `viewStorageKey` and `loadViewMode` (originally lines 83-89):

```typescript
function viewStorageKey(project: string): string {
  return `beans:view:${project}`;
}

function loadViewMode(project: string): ViewMode {
  return readString(viewStorageKey(project)) === "flat" ? "flat" : "hierarchy";
}
```

Remove this block entirely.

- [ ] **Step 2: Replace the state declaration and effects**

Replace (originally lines 95, 97-103):

```typescript
  const [view, setView] = useState<ViewMode>(() => loadViewMode(project));

  useEffect(() => {
    setView(loadViewMode(project));
  }, [project]);

  useEffect(() => {
    writeString(viewStorageKey(project), view);
  }, [project, view]);
```

with:

```typescript
  const [view, setView] = usePersistedProjectState<ViewMode>(
    project,
    "view",
    (key) => (readString(key) === "flat" ? "flat" : "hierarchy"),
    writeString,
  );
```

- [ ] **Step 3: Update imports**

Remove `import { useEffect, useMemo, useState } from "react";` and replace with `import { useMemo } from "react";` — `useEffect` and `useState` are no longer used directly in this file (verify by checking no other `useEffect`/`useState` call remains in the file before removing; if one does, keep the corresponding import).

Replace `import { readString, writeString } from "../lib/storage.js";` — keep this import, it's still needed for the inline `read` function and the `write` argument.

Add: `import { usePersistedProjectState } from "../hooks/usePersistedState.js";`

- [ ] **Step 4: Run typecheck and the existing test suite**

Run: `pnpm --filter @beans-frontend/web typecheck`
Expected: PASS.

Run: `pnpm --filter @beans-frontend/web test -- projectList.test.tsx`
Expected: PASS, all existing tests unmodified.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/projectList.tsx
git commit -m "refactor(web): use usePersistedProjectState in ProjectList"
```

**Model:** sonnet (must correctly reason about which React imports are still needed after removing 2 effects).

---

### Task 9: Apply `usePersistedProjectState` in `HierarchyList.tsx`

**Files:**
- Modify: `apps/web/src/components/HierarchyList.tsx`
- Test: `apps/web/src/components/HierarchyList.test.tsx` (existing — must pass unmodified, including its direct `localStorage.getItem("beans:expanded:demo")` assertions)

**Interfaces:**
- Consumes: `usePersistedProjectState` (Task 7).
- Produces: nothing new for later tasks.

`HierarchyList.tsx`'s existing tests read `beans:expanded:demo` directly from `localStorage` — Task 7's hook builds the identical key (`beans:${name}:${project}` = `beans:expanded:demo` when `name="expanded"`, `project="demo"`), so these assertions keep passing unmodified.

- [ ] **Step 1: Remove the storage-key helper**

In `apps/web/src/components/HierarchyList.tsx`, remove `expandedStorageKey` (originally lines 18-20):

```typescript
function expandedStorageKey(project: string): string {
  return `beans:expanded:${project}`;
}
```

Remove this block entirely.

- [ ] **Step 2: Replace the state declaration, effect, and `toggle`**

Replace (originally lines 90-105):

```typescript
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
```

with:

```typescript
  const [expanded, setExpanded] = usePersistedProjectState<ReadonlySet<string>>(
    project,
    "expanded",
    readStringSet,
    writeStringSet,
  );

  function toggle(id: string) {
    setExpanded((current) => {
      const next = toggleId(current, id);
      return new Set([...next].filter((value) => knownIds.has(value)));
    });
  }
```

The comment immediately above the original `useState` call (`// Expanded ids, not collapsed ones: ...`) documents a real, still-true invariant — keep it directly above the new `usePersistedProjectState` call.

- [ ] **Step 3: Update imports**

Replace `import { useEffect, useMemo, useState } from "react";` with `import { useMemo } from "react";` — verify no other `useEffect`/`useState` call remains in the file first; if one does, keep the corresponding import.

Add: `import { usePersistedProjectState } from "../hooks/usePersistedState.js";`

`readStringSet`/`writeStringSet` stay imported from `"../lib/storage.js"` — they're now passed directly as the hook's `read`/`write` arguments instead of being called inline.

- [ ] **Step 4: Run typecheck and the existing test suite**

Run: `pnpm --filter @beans-frontend/web typecheck`
Expected: PASS.

Run: `pnpm --filter @beans-frontend/web test -- HierarchyList.test.tsx`
Expected: PASS, all existing tests unmodified — including the 3 tests that read `beans:expanded:demo` directly from `localStorage`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/HierarchyList.tsx
git commit -m "refactor(web): use usePersistedProjectState in HierarchyList"
```

**Model:** sonnet (must preserve the prune-on-write transform exactly while removing the manual key-builder and effect).

---

### Task 10: Final gate verification

**Files:**
- None expected, unless a gate surfaces an issue — in that case, fix it in the smallest way that satisfies the gate without changing behavior, and note what was fixed in the commit message.

**Interfaces:**
- Consumes: the complete state of the repo after Tasks 1-9.
- Produces: a repo state where every project gate passes.

- [ ] **Step 1: Run the full gate suite**

From the repo root:

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage && pnpm knip && pnpm spell
```

Expected: every command exits 0.

- [ ] **Step 2: If `pnpm knip` reports unused exports, investigate each one**

Likely candidates worth checking specifically: `viewStorageKey`/`loadViewMode`/`expandedStorageKey` should already be gone (Tasks 8-9 deleted them). If `knip` flags anything else, confirm it's genuinely dead (not a false positive from a dynamic import or type-only usage) before removing it — do not remove anything still referenced.

- [ ] **Step 3: If coverage dropped below 90% on any package/metric, add a targeted test**

Identify the specific uncovered line/branch from the coverage report (`apps/*/coverage/index.html` or the terminal summary), and add one test that exercises it — do not weaken the threshold.

- [ ] **Step 4: If `pnpm spell` flags a new word**

New identifiers introduced by this plan (`EnumSelect`, `parseEnumValue`, `usePersistedProjectState`, `saveField`) are all standard English/camelCase and should not trigger `cspell` — if one does, this is unexpected; check `cspell.json`'s existing word list conventions before adding an entry.

- [ ] **Step 5: Commit any fixes**

If Steps 2-4 required changes:

```bash
git add -A
git commit -m "fix: address final gate findings from simplify sweep"
```

If all gates were already green after Task 9, this task needs no commit — report DONE with a note that no fixes were needed.

**Model:** sonnet (may require judgment to diagnose and fix whatever a gate surfaces).

---

## Self-Review Notes

- **Spec coverage:** Section A (discovery) → Task 1. Section B (`beanDetail.tsx` decomposition: `saveField`, `BeanDetailHeader`, `BeanDetailBody`, `BeanDetailDialogs`) → Tasks 5-6. Section C (`EnumSelect`, `parseEnumValue`, `usePersistedProjectState`) → Tasks 2-4, 7-9. Section D (testing/safety: pure refactor, direct tests on new units, coverage/knip held) → enforced per-task plus a final check in Task 10. Section E (out of scope) → no task touches `apps/server`, spec 2, CSS, or dependencies.
- **Corrected from the design doc:** the design doc originally listed `overview.tsx` and `Charts.tsx` as enum-select duplication sites; verifying against the actual source during plan-writing found their `.map()` calls build chart/summary data, not `<select>` options — the design doc has been corrected (commit follows this plan's Task 1 verification) and this plan reflects the accurate 2-file, 6-instance scope throughout.
- **Type consistency:** `EnumSelect`'s `value: string` / `onChange: (value: T) => void` shape (Task 3) is used identically in Tasks 4-6 — verified against `CreateBeanForm.tsx`'s controlled state (`type: BeanType`, `status: BeanStatus`, `priority: BeanPriority`, all `string`-assignable) and `InlineEditRow`'s `editor` render-prop signature (`value: string`, `onValue: (v: string) => void`), both of which accept `EnumSelect`'s props without any cast.
- **Placeholder scan:** no `TBD`/`TODO` in any task; every step carries complete code.
