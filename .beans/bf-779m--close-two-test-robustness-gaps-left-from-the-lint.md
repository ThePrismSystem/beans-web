---
# bf-779m
title: Close two test-robustness gaps left from the lint gate repair
status: completed
type: task
priority: low
created_at: 2026-08-03T03:22:33Z
updated_at: 2026-08-03T17:35:47Z
---

Deferred minors from the lint-gate branch (PR #31) and round-2 review:

- apps/web/src/components/Charts.tsx: the Cell -> shape={renderBar} change is a runtime change guarded only by two unit tests; the e2e theming spec probes a different chart. If recharts changes props.index semantics, bars paint with the wrong status colour and only those tests catch it.
- apps/web/src/hooks/useDebouncedValue.test.ts:22,25: void act(...) discards React 19 act thenables in a sync test, so a future act warning or rejection goes unnoticed.
- apps/server/src/beans/executor.test.ts drain loop depends on the exact microtask depth of reject -> catch -> finally -> release -> acquire; if that chain lengthens the test hangs to timeout instead of failing legibly.

## Summary of Changes

All three gaps closed.

`Charts.tsx` now has browser coverage: a new e2e test reads the status chart's own accessible table, maps each non-zero row's label to its status slug, and asserts the rendered `.recharts-bar-rectangle` paths carry exactly those `chart-fill-*` classes in that order. Deriving the expectation from the table rather than the fixture keeps it honest if the seed data changes. Verified by neutering `rows[props.index]` to `rows[0]`, which fails it.

`useDebouncedValue.test.ts` awaits its `act` calls in an async test instead of discarding the React 19 thenables.

The `executor.test.ts` drain loop no longer depends on microtask depth — it counts outstanding calls and polls with `vi.waitFor`, so a longer reject → catch → finally → release chain fails legibly instead of hanging to timeout.
