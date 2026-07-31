# Bean list stability and orphaned beans

Design for the first of three specs preparing `beans-frontend` for public visibility. The other
two — multi-root scanning, and public-release hardening — are separate specs and are out of scope
here.

## Problem

Two reported bugs share a root cause.

**The list reshuffles on its own.** `useEvents` invalidates `["beans", project]` on every `.beans`
file change, and the refetched list renders in whatever order the `beans` CLI emitted. Sort =
`Default` applies no ordering at all, and the explicit sort keys (`type`, `title`, `status`)
return `0` for equal values, so tied rows fall through to input order and move too. Separately,
`HierarchyList` recomputes `initialCollapsed` from a fresh `topNodes` identity on every refetch
(`HierarchyList.tsx:71-78`), so the entire tree snaps shut whenever a file changes on disk.

**Open beans under completed parents appear inconsistently.** `projectList.tsx` sends the
open-status filter to the server. A completed parent is therefore absent from the response, so
`buildTree` finds no entry for `parentId` and promotes the child to a root — it shows. Add
`completed` to the status filter and the parent returns, the child nests under it, the tree seeds
fully collapsed, and the open bean disappears. Same bean, two behaviors, decided by an unrelated
filter.

The common cause: the client never sees a completed parent, so it cannot distinguish "parent is
completed" from "parent does not exist", and every filter change swaps the entire dataset
identity out from under the components deriving state from it.

## Approach

Fetch each project's beans **once, unfiltered**, and derive every view from that single dataset in
the browser. Only `search` stays on the wire.

`search` cannot move client-side: the beans schema documents it as Bleve query syntax — fuzzy
(`login~2`), wildcard (`log*`), phrase (`"user login"`), boolean (`user AND login`), and
field-scoped (`title:login`) — and reimplementing that faithfully is not tractable.

Two alternatives were considered and rejected. Adding a second "skeleton" query purely to resolve
parent status keeps two datasets in sync across two invalidation paths and leaves the reordering
bug needing its own separate fix. Teaching the server to splice ancestors into bean queries puts
hierarchy logic into `/api/projects/:name/graphql`, which is otherwise a pure passthrough, and
also does not address reordering.

The chosen approach fixes both bugs at the same root, and removes code: `serverFilter` and its two
carve-out comments, `toGraphqlFilter`, `BeanFilterInput`, `DEFAULT_BEAN_FILTER`, and the
`initialCollapsed`/`seededFor` re-seed machinery all go away.

## Design

### Types

`BEANS_QUERY` fetches `body` for every bean, but no list row renders it — `BeanRow` uses only
type, title, and status, and the detail page gets `body` from its own `useBean` query. Dropping it
is what makes an unfiltered fetch cheap, and the type split records that honestly.

In `packages/shared/src/types.ts`:

```ts
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

export interface Bean extends BeanListItem {
  body: string;
}

export interface BeanDetail extends Bean {
  parent: LinkedBean | null;
  children: LinkedBean[];
  blocking: LinkedBean[];
  blockedBy: LinkedBean[];
}
```

`LinkedBean` becomes `Pick<BeanListItem, "id" | "title" | "type" | "status">`. `SearchHit`'s
`Pick<Bean, …>` is unchanged and still resolves.

Every list-facing component and helper takes `BeanListItem[]`. Only the detail page deals in
`Bean` / `BeanDetail`.

### Fetching

`apps/web/src/hooks/useBeans.ts`:

```ts
export function useProjectBeans(
  project: string,
  search: string,
): UseQueryResult<BeanListItem[]>;
```

- `queryKey: ["beans", project, search]`.
- Wire variables carry `{ search }` only when `search.trim()` is non-empty; no other filter fields
  are sent.
- `BEANS_QUERY` drops `body`; all other fields stay.
- `EMPTY_BEAN_FILTER`, `DEFAULT_BEAN_FILTER`, `BeanFilterInput`, and `toGraphqlFilter` are deleted.

`useEvents` continues to invalidate `["beans", project]`, which prefix-matches the new key. Live
refresh on disk change is retained deliberately — it is only the reshuffle and the collapse reset
that were jarring, not the refresh itself.

The detail page's `useBeans(project, EMPTY_BEAN_FILTER)` (used to populate `candidates` for
`BeanPicker` / `RelationEditor`) becomes `useProjectBeans(project, "")` — the same cache entry the
list already populated, so navigating into a bean stops triggering a second full project fetch.

### Client-side filtering

New `apps/web/src/lib/filter.ts`, holding the predicates that move off the server:

- `status`, `type`, `priority`, `tags` — OR within a facet, AND across facets, matching the beans
  schema's documented semantics.
- `prefix` — already client-side today; moves here for consistency.
- An empty facet is a no-op (matches everything), preserving current behavior.

Pure functions over `BeanListItem`, tested independently.

**Sequencing requirement:** `filter.ts` is written and its behavior verified against the current
server-side filtering *before* the server filter path is deleted. The risk in this whole approach
is silently changing filter semantics during the port; this ordering is the mitigation.

`ProjectList` keeps its existing URL-search-param contract (`validateProjectSearch`, the
`type`/`status`/`priority`/`tags`/`prefix`/`search`/`sort`/`dir` params) unchanged. Only where the
filtering happens moves.

The status default is unchanged in effect: with no `status` param present, the open statuses are
applied — now as a client-side predicate rather than a server filter.

### Ordering

New `defaultComparator` in `apps/web/src/lib/sort.ts`, ordering by:

1. **Priority**, in `BEAN_PRIORITIES` order (`critical`, `high`, `normal`, `low`, `deferred`).
2. **Type**, in `BEAN_TYPES` order (`milestone`, `epic`, `feature`, `task`, `bug`).
3. **Natural id.** Bean ids are `prefix-number` (`romn-1`, `hhroot-2`). Compare the prefix with
   `localeCompare`, then the numeric suffix numerically, so `romn-2` precedes `romn-10`. When a
   suffix is not numeric, fall back to `localeCompare` on the whole id. Ids are unique, so this
   step always resolves.

Applied in two places:

- **Sort = `Default`** — the full ordering, in both flat and hierarchy views.
- **Every explicit sort, as the final tiebreak.** `beanComparator("type", …)` currently returns
  `0` for two tasks, leaving their order to be decided by CLI emission order. Chaining
  `defaultComparator` after the primary key removes that.

`dir` inverts the primary comparison only. Ties always resolve through `defaultComparator`
ascending, so both directions are fully deterministic.

`buildTree` currently sorts children with `title.localeCompare`; it switches to `defaultComparator`
so nested order matches list order. Explicit sort continues to reorder top-level rows only, with
children keeping tree order — the existing documented behavior.

`discoverProjects` (`apps/server/src/discovery/scan.ts`) sorts its result by project name. The
Overview ledger renders directory-walk order today and `useEvents` invalidates `["projects"]` on
every file change, so it has the same reshuffle exposure from the server side.

### Orphan model

New `apps/web/src/lib/orphan.ts`, computed against the **full** project dataset — the reason the
unfiltered fetch is required:

```ts
isOrphaned(bean, byId): boolean =
  OPEN_STATUSES.includes(bean.status) &&
  bean.parentId !== null &&
  ["completed", "scrapped"].includes(byId.get(bean.parentId)?.status);
```

A `scrapped` parent orphans its children just as a `completed` one does — an open child under an
abandoned parent is at least as stranded.

A bean with no `parentId`, with a parent absent from the project entirely, with an open parent, or
which is not itself open, is not orphaned.

Placement is unchanged in mechanism: `buildTree` nests a bean when its parent is in the filtered
set and promotes it to a root when the parent is filtered out. Because that is now computed from a
stable dataset, it stops flip-flopping. The badge is what makes the state legible in both
positions.

### Collapse persistence

The re-seed machinery — `initialCollapsed`, `seededFor`, and the render-phase `setState` in
`HierarchyList` — is removed entirely, by **storing expanded ids rather than collapsed ones**.

Absence then means collapsed, which is already the desired default, so a node appearing for the
first time seeds collapsed with no seeding step — and there is no seeding step left to re-fire on
refetch. That is the structural fix for the snap-shut bug, not a guard bolted onto it.

- Key `beans:expanded:<project>`, a JSON array of bean ids, alongside the existing
  `beans:view:<project>`.
- Pruned on write against the ids present in the full project dataset, so it stays bounded by
  project size and deleted beans do not accumulate. Pruning on write (not read) means an id
  temporarily hidden by a filter keeps its expansion.
- Survives refetch, filter and sort changes, navigation, and reload.

New `apps/web/src/lib/storage.ts` — safe JSON get/set that falls back to an in-memory map when
`localStorage` throws (quota exceeded, private browsing, storage disabled). `loadViewMode` calls
`window.localStorage.getItem` unguarded today and would take the route down in those conditions;
it moves onto the same helper.

### Orphan UI

`BeanRow` gains an optional `orphaned?: boolean` and renders a text badge — text rather than a
bare glyph so it is announced by a screen reader. Applies in both flat and hierarchy views.

Hierarchy rows show `⚠ N orphaned` when their subtree contains orphaned beans, counted
recursively over descendants only, so a collapsed chain advertises stranded work at every level
above it. The count renders whether the node is expanded or collapsed. A row can carry both its
own orphan badge and a descendant count — the badge describes the bean, the count describes what
is nested beneath it. Flat view gets row badges only; there is no tree to count through.

`apps/web/src/theme/tokens.css` has no warning color. Add `--warn`, with light and dark values
following the existing `light-dark()` pattern, verified to meet WCAG AA (4.5:1) against `--paper`
in both schemes and documented with its measured ratio in a comment, as `--muted` already is.

### Re-open parent

On the detail page, when the current bean is orphaned: a warning naming the parent and its status,
plus a **Re-open parent** button.

Clicking walks up `parentId` collecting each consecutively completed-or-scrapped ancestor,
stopping at the first open ancestor, at a missing parent, or on revisiting an already-collected id
(the cycle guard `withAncestors` already uses). It then opens `ConfirmDialog` listing every
ancestor it will touch with its target status.

**Target status is the current bean's own status** — an `in-progress` orphan re-opens its
ancestors to `in-progress`, a `todo` orphan to `todo` — so parent and child end up coherent.

New `useReopenAncestors(project)` hook in `useMutations.ts` keeps the route thin. It fires
`UPDATE_BEAN_MUTATION` per ancestor **sequentially**: each call spawns a `beans` process writing
into the same project directory, and serializing avoids racing concurrent writes. It invalidates
once, after the chain completes.

There is no transaction to roll back with, so a mid-chain failure leaves earlier ancestors
re-opened. The hook reports which ancestors succeeded and surfaces the failure through the
existing `describeMutationError`, consistent with every other mutation on the page.

The hierarchy rules cap a chain at three ancestors (task → feature → epic → milestone), but the
walk is guarded rather than relying on that.

## Testing

Per-module unit tests for `filter`, `sort`, `orphan`, `hierarchy`, and `storage`. Two carry the
actual regressions and must fail against current code before the fix lands:

- **Ordering.** Shuffle an input array, sort, and assert byte-identical output — including under
  each explicit sort key, where ties previously fell through to input order.
- **Collapse.** Expand a node, then hand the component a fresh array with identical contents (what
  a refetch produces), and assert the expansion survives.

Further coverage:

- `filter.ts` — each facet in isolation, OR within a facet, AND across facets, empty facet as
  no-op. Verified against current server behavior before the server path is deleted.
- `orphan.ts` — open child with completed parent, with scrapped parent, with open parent;
  completed child with completed parent; parent absent from the project; no `parentId`.
- `hierarchy.ts` — recursive orphan counts, and placement with the parent present versus filtered
  out.
- `storage.ts` — round-trip, corrupt JSON, and a `localStorage` that throws.
- `beanDetail` — the warning renders only for orphans; the confirm dialog lists the full ancestor
  chain; mutations fire in ancestor order; a partial failure surfaces and reports what succeeded.
- `HierarchyList` — nodes appearing for the first time seed collapsed; badge counts render.

No new Playwright specs. The repo currently has no CI job running the existing E2E suite; that is
addressed in the public-release hardening spec.

## Out of scope

- Multi-root directory scanning (separate spec).
- Security audit, `pnpm audit` gating, SHA-pinned actions, Codecov integration, the 90% coverage
  target, the simplify pass, and the documentation pass (separate spec).
- Coverage thresholds stay at their current 80% for this work; raising them to 90% belongs to the
  hardening spec.
