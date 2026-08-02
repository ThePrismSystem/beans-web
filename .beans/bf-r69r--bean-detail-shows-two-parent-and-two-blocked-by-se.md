---
# bf-r69r
title: Bean detail shows two Parent and two Blocked by sections with different beans
status: completed
type: bug
priority: high
created_at: 2026-08-02T15:13:55Z
updated_at: 2026-08-02T15:26:57Z
---

## Summary

The bean detail page renders every relationship twice, and the two Blocked by lists
disagree. `beanDetail.tsx` mounts `RelationEditor` and `LinkedBeans` back to back
(lines 545-554). `RelationEditor` renders plain titles with the edit controls;
`LinkedBeans` renders clickable rows with type tags. They came from separate features
(`ef47972`, `bfcd3ce`) and both were left mounted.

Reported against `flarecast-34gc`.

## Root cause

The two components read different GraphQL fields, and in beans those fields hold
different sets:

| Field          | Meaning                                             | Read by        |
| -------------- | --------------------------------------------------- | -------------- |
| `blockedByIds` | this bean's own `blocked_by:` frontmatter           | RelationEditor |
| `blockedBy`    | beans whose `blocking:` frontmatter names this bean | LinkedBeans    |

beans records each edge on whichever side declared it and never resolves the inverse.
For `flarecast-34gc` the two sets are disjoint:

```
blockedByIds = [flarecast-tmts, flarecast-fyp2]   # 34gc declares these
blockedBy    = [flarecast-2dxv, flarecast-7qu0]   # these declare they block 34gc
```

Four beans block `34gc`. Each section shows a different two and nothing shows all four.

Blocks has the same hole in the other direction: `blocking` resolves only from
`blockingIds`, so a bean that declares `blocked_by: X` never appears under X's Blocks.
Verified: `34gc` declares `blocked_by: tmts`, and `tmts.blocking` returns `[]`.

Parent is unaffected. `parentId` and `parent` are the same underlying field, so that
duplication is cosmetic.

## Probe results

Against a scratch project, with A declaring `blocking: B`:

- `removeBlockedBy(id: B, targetId: A)` **reports success and changes nothing.** It
  only rewrites B's own `blocked_by:` list, so an inbound edge silently survives. A
  Remove button on such a row would appear to work and the row would return.
- `removeBlocking(id: A, targetId: B)` does remove it. Inbound edges are removable
  through the inverse mutation on the other bean.
- `beans(filter: { blockedById: X })` returns the beans that declare `blocked_by: X`,
  which is the missing half of X's Blocks.
- `bean(id: ID!)` and `blockedById: String` need separate variables in one document:
  `query D($id: ID!, $idStr: String!)`.

## Fix

One merged Relationships section. Delete `LinkedBeans`, give the editor's rows the
type tag and link, and build each list from the union of both directions.

- Blocked by = `blockedByIds` union `blockedBy`
- Blocks = `blockingIds` union `beans(filter: { blockedById: <id> })`

Each row carries which side declared it, so Remove dispatches the mutation that
actually works: own-side rows use `removeBlockedBy` / `removeBlocking` on this bean,
inbound rows use the inverse on the other bean.

## Acceptance criteria

- [x] `BEAN_DETAIL_QUERY` fetches the inbound half of Blocks via `blockedById`
- [x] One Parent, one Blocks, one Blocked by, one Children section on the page
- [x] Each list shows the union of both directions, deduplicated
- [x] Rows are clickable and carry a type tag
- [x] Remove on an inbound row issues the inverse mutation and the row does not return
- [x] `LinkedBeans` and its test deleted; `knip` clean
- [x] Unit tests cover both edge directions for Blocks and Blocked by

## Summary of Changes

One Relationships section now. `LinkedBeans` is gone and `RelationEditor` renders every
relation, so each of Parent, Blocks, Blocked by and Children appears once, with rows
that carry a type tag and link through to the bean.

Each blocking list is the union of both directions. The own half of each comes from
this bean's own id list matched against the project, the other half from the server:
`blockedBy` for beans whose `blocking` names this one, and a new `blocksInbound`
top-level `beans(filter: { blockedById: })` call for the reverse. `bean(id:)` takes an
`ID!` while the filter takes a `String`, so the query declares the id twice. An edge
declared on both sides appears once, as own, so its Remove uses the mutation that acts
on this bean. `BeanDetail.blocking` was dropped: it only ever resolved `blockingIds`,
which the union now reads directly.

Removal dispatches on which file holds the edge. `removeBlocking` on an inbound row
would report success and change nothing, so those go out as `removeBlockedBy` against
the other bean, and vice versa. `useLinkMutation` also invalidates the target now, not
just `v.id` — for an inbound removal `v.id` is the other bean, so the page you are
looking at would otherwise stay stale. That was already wrong before this change: any
link edit left the far bean's cached detail behind.

Verified against the reported bean by running the real query through the beans binary.
`flarecast-34gc` has four blockers, two per direction, where each old section showed a
different two. It also blocks `flarecast-ey69` ("Ruleset-version re-review flow"),
which declared the edge from its own side and so appeared in neither section — the
Blocks list was empty on a bean that blocks something.

Tests: 13 in `RelationEditor.test.tsx` covering the union, dedup, dangling ids and both
removal directions; the inbound dispatch case in `beanDetail.test.tsx`; `blocksInbound`
folding in `useBean.test.tsx`; target invalidation across all four link mutations; and
the query-shape assertions in `operations.test.ts`. 440 unit tests and 23 e2e pass.

## Notes

`pnpm codegen` is broken in this checkout, unrelated to this change: the CLI cannot
resolve the `typescript-operations` plugin even though it is installed and resolvable
from Node, and a fully-qualified plugin name does not help. CI never runs it. The
`BeanDetailQuery` type in `apps/web/src/api/generated.ts` is not consumed by anything —
`useBean` declares its own result type — so it was hand-edited to match the operation.
Worth a follow-up bean.
