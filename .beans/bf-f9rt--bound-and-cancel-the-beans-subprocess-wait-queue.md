---
# bf-f9rt
title: Bound and cancel the beans subprocess wait queue
status: completed
type: task
priority: normal
created_at: 2026-08-03T03:22:33Z
updated_at: 2026-08-03T17:33:12Z
---

The FIFO gate added for F-01 (util/concurrency.ts, withBeansSlot) queues callers without limit and without cancellation.

Two consequences found in review:

- A client that disconnects while queued still spawns its child later, burning a slot on abandoned work.
- One request enqueues up to 8 acquires, not 1 — search.ts:22 and analytics.ts:23 fan out per project — and index.ts:29-35 has no in-flight dedup, so a cold-cache stampede of K requests queues KxN waiters.

Follows from the deliberate FIFO/no-rejection saturation policy, so it is a design follow-up rather than a defect. Consider an AbortSignal-aware acquire plus in-flight dedup for identical project queries.

## Summary of Changes

`withBeansSlot(fn, signal?)` now takes an optional AbortSignal. A caller that aborts while queued is spliced out of the waiter list and rejected, so it never reaches the front and spawns a child. The signal is deliberately NOT forwarded to `execFile`: killing a `beans` mutation mid-write could truncate a bean file, and a client hanging up is not worth that risk. Threaded from `c.req.raw.signal` through the graphql route, `AppDeps.runGraphql`, and `RunOpts`.

Separately, `listProjects` in `index.ts` now shares its in-flight discovery promise. Previously every request arriving on a cold or just-expired cache started its own pass, each fanning out one child per project — so K concurrent requests queued KxN children for the same answer. They now collapse onto one pass.

Three tests cover the cancellation path, including that an aborted waiter's slot goes to the next caller rather than leaking (a leaked slot would shrink the pool permanently).
