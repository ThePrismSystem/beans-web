---
# bf-f9rt
title: Bound and cancel the beans subprocess wait queue
status: todo
type: task
priority: normal
created_at: 2026-08-03T03:22:33Z
updated_at: 2026-08-03T03:22:33Z
---

The FIFO gate added for F-01 (util/concurrency.ts, withBeansSlot) queues callers without limit and without cancellation.

Two consequences found in review:

- A client that disconnects while queued still spawns its child later, burning a slot on abandoned work.
- One request enqueues up to 8 acquires, not 1 — search.ts:22 and analytics.ts:23 fan out per project — and index.ts:29-35 has no in-flight dedup, so a cold-cache stampede of K requests queues KxN waiters.

Follows from the deliberate FIFO/no-rejection saturation policy, so it is a design follow-up rather than a defect. Consider an AbortSignal-aware acquire plus in-flight dedup for identical project queries.
