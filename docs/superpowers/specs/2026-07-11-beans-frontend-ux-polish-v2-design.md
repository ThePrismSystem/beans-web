# beans-frontend — UX Polish v2 (mobile, filters, hierarchy, bean detail)

**Status:** Approved (2026-07-11)
**Owner:** callie.sarenpa@gmail.com
**Branch:** `fix/mobile-responsive-a11y` (continues the mobile/a11y work)

## 1. Purpose

A second polish pass on the beans-frontend web UI, driven by real-device (phone) use. It fixes data
correctness (open-work counts), removes duplicate projects, reworks filtering, cleans up the hierarchy
and bean-detail views, and finishes the mobile touch-sizing. All changes are frontend + a small server
counts addition; no change to the beans integration model.

This builds on the editorial "engineering logbook" design language from
`2026-07-11-beans-frontend-design.md` — same palette, serif titles, hairline rules, type-colored tags,
status dots. New surfaces must match that language, not introduce a different one.

## 2. Scope

Fourteen items, grouped below. Everything lands on the existing `fix/mobile-responsive-a11y` branch.
Out of scope: nested/monorepo sub-project discovery (removed by the depth change), any beans CLI
changes, new routes.

## 3. Discovery & data

### 3.1 Discovery depth 4 → 1
- Change `SCAN_DEPTH` default in `apps/server/src/env.ts` from `4` to `1`.
- Effect: only direct `~/git/*` directories containing `.beans.yml` are discovered. The embedded repos
  `mediabox-dc/simply-plural` and `mediabox-dc/ringoutmn-monorepo` (separate git repos) and the
  `handbellhub/apps/*` sub-projects are no longer found, eliminating all duplicate project names and
  the name-collision routing hazard. Still overridable via the `SCAN_DEPTH` env var (min 1, max 8).
- No routing changes needed: with depth 1, project `name` (basename) is unique again.

### 3.2 Open-by-type counts
- `ProjectCounts` (in `packages/shared/src/types.ts`) gains **`openByType: Record<BeanType, number>`** —
  count of beans whose status ∈ `OPEN_STATUSES` (draft, todo, in-progress), grouped by type. `byType`
  (totals) and `byStatus` stay as-is.
- `apps/server/src/discovery/scan.ts` already reads `{ beans { type status } }` per project; extend the
  tally loop to also increment `openByType[type]` when `OPEN_STATUSES.includes(status)`. Use the shared
  `zeroCounts(BEAN_TYPES)` helper. Update `emptyCounts()`, `fixtures.fakeCounts()`, and all test
  fixtures that build a `ProjectCounts` literal to include `openByType`.

## 4. Overview cards — ledger lines (Option A)

Replace the boxed `.project-card` grid in `apps/web/src/routes/overview.tsx` with ledger rows:

- Each project renders as a row (bordered list, hairline separators — not individual cards):
  - **Top line:** serif project name (left) + monospace **`{open} open · {total} total`** (right,
    open emphasized).
  - **Types line:** open-only counts per type, pipe-separated and color-coded via the `--t-*` tokens,
    e.g. `epic 4 | feature 3 | task 30 | bug 3`. Uses `project.counts.openByType`. **Types with 0 open
    are omitted.**
- Clicking a row navigates to `/p/$project` (as today).
- Styling added to `global.css`; remove the now-unused `.project-card` / `.project-grid` /
  `.project-types` rules that this replaces.

## 5. Filters (list views + picker)

The GraphQL `BeanFilter` already accepts arrays; `BeanFilterInput` already models arrays. Changes are UI
plus one new client-side facet.

### 5.1 Checkbox-popover multi-select
- Rework `FilterBar` so **Type / Status / Priority** are each a button that opens a small checkbox menu
  (multi-select). The button shows a count when any value is selected (e.g. `Type (2)`). Replaces the
  single-value `<select>`s.
- Build a small reusable `FilterPopover` (or `CheckboxMenu`) component: a trigger button + a popover
  listing the facet's values as checkboxes; closes on outside-click / Escape; keyboard-navigable.
- The existing mobile "Filters" disclosure still wraps the whole set on small screens.

### 5.2 New dynamic Prefix facet
- **Prefix** = `bean.id.slice(0, bean.id.lastIndexOf('-'))` (everything before the final hyphen;
  e.g. `hhroot-o5e5` → `hhroot`, `cc-web-ab12` → `cc-web`). Add a `beanPrefix(id)` helper (shared or
  `apps/web/src/lib`), unit-tested.
- Options are **enumerated from the currently-shown beans** (distinct prefixes, sorted). Filtering is
  **client-side**: after the server returns the filtered list, keep beans whose prefix ∈ selected
  prefixes (empty selection = all). Because options derive from the list, an active prefix selection
  that no longer appears is simply inert.
- **In hierarchy view**, prefix filtering behaves like the existing type filter: prune to matching beans
  **plus their ancestor section chain** (reuse `pruneTreeToMatches`) so containers stay as context. In
  flat view it is a straight filter. Prefix options are enumerated from the full fetched list (pre-prune)
  so toggling one prefix doesn't remove the others from the menu.
- Appears as another checkbox popover in the FilterBar (and in the picker modal).

### 5.3 Default: hide completed + scrapped
- On every list view (flat + hierarchy) and the picker, the **Status filter initializes to the open
  statuses** `[draft, todo, in-progress]` rather than empty. This hides completed + scrapped by default;
  the user widens Status to see them. Update `EMPTY_BEAN_FILTER` consumers / initial filter state
  accordingly (introduce a `DEFAULT_BEAN_FILTER` with `status: [...OPEN_STATUSES]`; keep
  `EMPTY_BEAN_FILTER` for "no filter" contexts). URL still reflects the effective status filter.
- **Container edge case:** because status is filtered server-side, a `completed` milestone/epic is hidden
  by default even if it has open children. `buildTree` already reparents orphans (a bean whose parent
  isn't in the returned set becomes a root), so those still-open children surface at the top level — the
  intended "remaining work" view. Acceptable for v1; widening Status brings the container back.

### 5.4 Tags input sizing
- Shrink the tags input to a sensible fixed-ish width (e.g. `flex: 0 1 160px` desktop, full-width only
  inside the mobile disclosure). No longer a large box.

### 5.5 URL persistence
- Prefix selection persists in the project route search params like the other facets (extend
  `ProjectSearch` / `validateProjectSearch` in `projectList.tsx` with `prefix?: string[]`).

## 6. Global search — header search bar with live dropdown

- Replace the header's `Search beans` link (`AppShell.tsx`) with a **search input** in the header.
- As the user types (debounced), show a **dropdown** of matching beans (reusing `useSearch`), each a
  row (type chip + title + project + status dot) linking to that bean's detail page. **Enter** navigates
  to the full `/search` page with the query.
- Dropdown closes on outside-click / Escape / selection. On mobile it drops below the header full-width.
- The `/search` page route stays.

## 7. Hierarchy view

In `apps/web/src/components/HierarchyList.tsx` and `apps/web/src/lib/hierarchy.ts`:

### 7.1 Start fully collapsed
- Initialize `collapsed` to contain **every collapsible node/section id** (any node/section with
  children/leaves) so only top-level beans and section headers show on first render. Recompute the
  initial collapsed set when the tree identity changes (new project / filter). Expansion state is not
  persisted across navigations (v1).

### 7.2 Section headers render like beans + link + subtle tint
- Section headers (milestones, and epics in the grouped view) render the **same bean presentation** as a
  normal row: type chip + title + status dot, wrapped in a `Link` to the bean's detail page — reuse the
  `BeanRow` presentation rather than a bespoke `<h2>` title-only header. The caret sits to the left of
  the row.
- A **subtle background tint** on the section-header row distinguishes it as a section (per the original
  design concept), applied via a CSS class — the bean-data rendering itself is identical to other rows.
- Because the header is now a `Link`, the collapse/expand caret is a separate button beside it (so
  tapping the row navigates, tapping the caret toggles).

### 7.3 Flush-left when no milestones/epics
- When a project has no milestone/epic section headers, top-level beans align **flush to the left edge**
  (no reserved caret-spacer indent). The caret-spacer/indent should only apply where nesting/sections
  actually exist. Fix the leaf/root rendering so depth-0 rows with no sibling carets don't reserve caret
  width.

## 8. Bean detail

In `apps/web/src/routes/beanDetail.tsx` (+ new components), decompose the header and body into focused
pieces.

### 8.1 Header (Layout A — inline labeled rows)
- **Title:** serif, with a small ✎ edit button; tapping it swaps to the inline title input (existing
  commit-on-enter/blur behavior), no longer crammed in a baseline row with selects.
- **Metadata rows**, one per line, `label : value ✎`:
  - **Type:** type chip + ✎. Tapping ✎ swaps the chip for a `<select>`; a green **✔ Save** button
    appears **only when the value differs** from the current, plus a **✕ cancel**. Save fires the
    `updateBean` mutation; cancel reverts and exits edit mode.
  - **Status:** status dot + label + ✎, same pattern.
  - **Priority:** value + ✎, same pattern.
  - **Tags:** tag chips + ✎; editing swaps to a comma-separated text input with ✔/✕.
- Extract a small reusable `InlineEditRow` (label, rendered value, edit control, dirty-aware Save/Cancel)
  to avoid four near-duplicate blocks. Remove the current dual dropdown-plus-chip rendering.
- Below the rows: id (mono), created/updated timestamps (muted), as today.
- Mobile: rows stack cleanly full-width; controls meet the ≥44px touch target.

### 8.2 Body — rendered by default, edit toggle
- Show the **rendered markdown** by default (as the current `.bean-detail-body`).
- An **Edit** button beneath the body swaps the rendered view for a raw `<textarea>` (the existing
  `BodyEditor` textarea) with **Save** and **Cancel**. Save commits via `updateBean` and returns to the
  rendered view; Cancel discards the draft and returns.
- This replaces the always-visible "Edit body" section and the `BodyEditor`'s separate Preview toggle
  (rendered-by-default makes preview redundant). `BodyEditor` is simplified to a controlled textarea (or
  folded into the detail page).

### 8.3 Relationships — bean-picker modal
- Replace the `RelationEditor` `<select>` dropdowns with a **bean-picker** dialog (centered on desktop,
  bottom-sheet on mobile), reused for Parent, Blocks, and Blocked-by:
  - Header (title like "Set parent" / "Add blocks") + close ✕.
  - **Search input** (matches title) + the **checkbox-popover filters** (Type / Status / Prefix).
  - Candidate list rendered as bean rows (type chip + title + status dot). **Completed + scrapped hidden
    by default** (Status filter defaults to open, as §5.3); user can widen.
  - **Single mode** (Parent): tapping a row selects it and closes; a "(none)" row clears the parent.
  - **Multi mode** (Blocks / Blocked-by): checkboxes on rows + an "Add N" primary button + Cancel.
  - Candidate sets still respect hierarchy validity (`canParent`) for Parent and exclude self / already-
    linked beans, as the current `RelationEditor` does.
  - Reuse the `ConfirmDialog` focus-trap/Escape/restore infrastructure for the modal shell.

## 9. Mobile touch sizing (finish)

The earlier pass keyed touch sizing on `@media (pointer: coarse)`, which some devices/report paths miss.
Additionally apply the touch sizing at **mobile width** (`@media (max-width: 768px)`), so all
buttons, selects, carets, popover triggers, filter chips, picker rows, and inline-edit controls are
≥44px with ≥16px text and adequate padding regardless of reported pointer type. Re-verify on a 390px
viewport with a real touch/`hasTouch` emulation (not desktop chromium) via screenshots.

## 10. Testing

Maintain the ≥80% coverage gate. Add/adjust:

- **Server:** `openByType` tallies in `scan.ts` (unit + the discovery integration test asserting open
  counts differ from totals when some beans are completed).
- **Shared/web lib:** `beanPrefix(id)` derivation edge cases (multiple hyphens, no hyphen).
- **Filters:** checkbox-popover multi-select state; prefix option enumeration + client-side filtering;
  default status = open statuses on list mount.
- **Overview:** ledger row renders open-by-type, pipes, omits zero-open types, shows open·total.
- **Hierarchy:** collapsed-on-load (only top level visible initially); section header is a link with
  chip+dot; flush-left when no sections.
- **Bean detail:** `InlineEditRow` state machine (resting → editing → dirty shows Save → save/cancel);
  body edit/save/cancel toggle; header no longer double-renders type.
- **Picker:** single-select chooses & closes; multi-select adds N; search + filters narrow candidates;
  completed hidden by default; parent validity respected.
- **Header search:** dropdown shows results while typing; Enter routes to `/search`.
- **E2E:** extend the Playwright flow for the header search bar, body edit, and the relationship picker.

## 11. Rollout

Single branch `fix/mobile-responsive-a11y`, incremental commits by area (data/counts → overview →
filters → search → hierarchy → bean detail → picker → mobile sizing → tests). Full local gate
(format, lint, typecheck, tests, coverage, knip, spell, build, E2E) green before pushing; the existing
PR updates. Visual re-verification on a mobile viewport before finishing.
