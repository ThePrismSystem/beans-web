# Whole-Codebase Simplify Sweep — Design

## Context

Fourth of four specs decomposed from "prepare beans-frontend for public
visibility." Spec 1 (list stability + orphans) and spec 3 (public-release
hardening) are complete and merged into `main`. Spec 2 (multi-directory
scanning) is unstarted and out of scope here. This spec was split out during
spec 3's brainstorming specifically because the user wanted a dedicated,
codebase-wide simplification pass rather than incidental cleanup.

## Current state

`apps/server` is already small and clean: every file is under 90 lines, zero
`TODO`/`FIXME`/`HACK` comments, zero `eslint-disable` anywhere in the repo.
The size and duplication concentration is in `apps/web`.

Concrete findings from sampling the largest files
(`beanDetail.tsx` 520 lines, `projectList.tsx` 280, `useMutations.ts` 259,
`CreateBeanForm.tsx` 228, `BeanPicker.tsx` 188):

- **`beanDetail.tsx`**: `BeanDetailContent` is a single ~440-line function
  holding 9 mutation hooks, 4 near-identical `save<Field>` handlers (find
  matching enum value, compare to current, mutate if changed), relation/
  scrap/delete/reopen handlers, and a large JSX return including two
  `ConfirmDialog` instances with nontrivial dynamic content.
- **Enum-select JSX duplication**: the `<select>` + `.map()` over
  `BEAN_TYPES`/`BEAN_STATUSES`/`BEAN_PRIORITIES` to render `<option>` tags is
  copy-pasted across `overview.tsx`, `Charts.tsx`, `CreateBeanForm.tsx`, and
  `beanDetail.tsx`.
- **Enum-parse duplication**: `array.find((option) => option === value)`
  against one of the three enum arrays repeats 6 times across
  `CreateBeanForm.tsx` (3x) and `beanDetail.tsx` (3x).
- **Persisted-state duplication**: `projectList.tsx` (view mode) and
  `HierarchyList.tsx` (expanded-node set) each hand-roll the same
  load-on-project-change / write-on-change effect pair against
  `lib/storage.ts`, differing only in the value shape (string vs. string
  set).
- **`useMutations.ts`** (259 lines) is already well-factored — one hook per
  mutation, duplication across the 4 link mutations already collapsed via a
  shared `useLinkMutation` helper — and needs no changes.

## Approach

Evidence-driven targeted sweep: fix the confirmed findings above, preceded
by one full-codebase discovery pass (Task 1) that greps for the same three
pattern classes — repeated JSX blocks, repeated parsing/lookup snippets, and
repeated hook-effect shapes — plus a size check on every non-generated
`.ts`/`.tsx` file, so the plan isn't limited to the files sampled during
brainstorming. Every change in this spec is a pure refactor: no new
features, no behavior change, no visual change.

Rejected alternative: rewriting every file above ~100 lines regardless of
whether it shows a specific problem. Higher churn and risk for files (like
`useMutations.ts`) that are already well-structured — file size alone is not
evidence of a problem.

## Design

### A. Discovery pass

The plan's first task runs a full-codebase sweep and produces a findings
list that drives every subsequent task:

1. Grep for the enum-select JSX pattern, the enum-find parse pattern, and
   the load/write-on-change localStorage effect pattern across all of
   `apps/web/src` (not just the files already sampled) — confirm the full
   set of call sites for each of the three duplications identified above.
2. List every non-generated, non-test `.ts`/`.tsx` file in the repo by line
   count, to confirm `beanDetail.tsx` is the only file that clears a
   "genuinely oversized" bar and to catch anything not already sampled.
3. Any new pattern-class duplication or oversized file this pass surfaces
   that isn't already covered by Sections B or C below gets added to the
   plan as an additional task, scoped the same way (mechanical extraction,
   behavior-preserving, direct tests on the extracted unit).

### B. `beanDetail.tsx` decomposition

Split the current single `BeanDetailContent` function into:

- **`saveField(mutate, options, current, value)`** — a generic helper
  replacing the `saveStatus`/`saveType`/`savePriority` handlers (each is:
  find `value` in an enum array, compare to the current field, call
  `mutate` if different). `saveTags` is not an enum lookup and stays as its
  own handler.
- **`BeanDetailHeader`** — title edit/display toggle, the 4 `InlineEditRow`s
  (type/status/priority/tags), and the created/updated timestamp meta line.
- **`BeanDetailBody`** — the markdown view/edit toggle section (textarea vs.
  rendered HTML, save/cancel actions).
- **`BeanDetailDialogs`** — the two `ConfirmDialog` instances (delete
  confirmation, reopen-ancestors confirmation), whose dynamic content
  (pluralized titles, ancestor list rendering) is the single largest JSX
  block in the file.

`BeanDetailContent` retains the mutation hooks, component state, and event
handlers, and composes the four pieces above via props. Props for each
extracted component are the minimum needed for that piece — no shared
context object introduced. No prop, DOM output, or test-observable behavior
changes; existing `beanDetail` tests must pass unmodified.

### C. Cross-file duplication removal

- **`EnumSelect<T>`** (`apps/web/src/components/EnumSelect.tsx`) — a
  generic `<select>` component taking `options: readonly T[]`,
  `value: T`, `onChange: (value: T) => void`, and the existing per-call-site
  `aria-label`/`id`, rendering the `.map()` over options as `<option>` tags.
  Replaces the 4 duplicated inline instances.
- **`parseEnumValue<T>(value: string, options: readonly T[]): T | undefined`**
  (`apps/web/src/lib/enum.ts`) — replaces the 6 `array.find(option => option
  === value)` call sites.
- **`usePersistedProjectState<T>(project: string, key: string, read: (k:
  string) => T, write: (k: string, v: T) => void, initial: T)`**
  (`apps/web/src/hooks/usePersistedState.ts`) — encapsulates "load this
  project-scoped value on project change, persist it on every change,"
  parameterized over the existing `readString`/`writeString` and
  `readStringSet`/`writeStringSet` pairs so `projectList.tsx` and
  `HierarchyList.tsx` each pass their own read/write functions and value
  type. Replaces the duplicated effect pairs in both files.

Each replacement is call-site-for-call-site — no new options, props, or
behavior beyond what today's 4 (or 6, or 2) call sites already do.

### D. Testing & safety

- Pure refactor discipline: before touching a file, its existing tests are
  green; after, the same tests pass unmodified unless a test asserted on
  now-removed internal structure (in which case the test is updated to
  assert the same behavior through the new structure, not weakened).
- Every newly extracted unit (`EnumSelect`, `parseEnumValue`,
  `usePersistedProjectState`, `saveField`, `BeanDetailHeader`,
  `BeanDetailBody`, `BeanDetailDialogs`) gets direct unit tests, since none
  had isolated coverage as inline code.
- The 90% coverage threshold (all three `vitest.config.ts` files, set in
  spec 3) must hold across every task — this sweep should raise coverage on
  files it touches, never lower it.
- `pnpm knip` stays clean: any code an extraction makes obsolete (e.g. an
  inline handler fully replaced by `saveField`) is deleted in the same task
  it's replaced, not left dangling.
- Any Section A discovery-pass finding that turns out to require a behavior
  decision, not a mechanical extraction, is surfaced to the human partner
  rather than resolved silently.

## Out of scope

- `apps/server` — already small and clean, no findings.
- Spec 2 (multi-directory scanning) — not yet built.
- Visual/CSS changes.
- Dependency version changes.
- Files sampled during brainstorming and found already well-factored
  (e.g. `useMutations.ts`) — the discovery pass, not file size alone,
  determines what's in scope for this plan.

## Testing

Standard project gates apply and must pass before this spec is considered
done: `pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage
&& pnpm knip && pnpm spell`. No new test infrastructure is introduced; this
spec adds unit tests for newly extracted units using the existing
Vitest/Testing Library setup.
