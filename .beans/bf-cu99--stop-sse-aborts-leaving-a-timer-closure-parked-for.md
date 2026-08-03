---
# bf-cu99
title: Stop SSE aborts leaving a timer closure parked for 25s
status: completed
type: task
priority: low
created_at: 2026-08-03T03:22:33Z
updated_at: 2026-08-03T17:35:47Z
---

routes/events.ts releases the stream slot from the abort listener so capacity frees immediately, but the stream callback stays parked in stream.sleep(HEARTBEAT_MS = 25_000) until that timer fires. Connect/abort churn therefore accumulates zombie closures (timer + TransformStream) at connection rate for up to 25s, uncapped by MAX_SSE_CLIENTS.

Memory-only: the socket and the watcher listener are already freed, and this is still far better than the uncapped behaviour before F-07. Fix would be racing the sleep against an abort promise.

## Summary of Changes

Replaced `stream.sleep(HEARTBEAT_MS)` with a local `sleepUntilAborted(signal, ms)` that races the timer against the request's abort event, clearing the timeout and removing its listener whichever fires first. Connect/abort churn no longer parks a timer plus TransformStream closure for up to 25s per dropped connection.

Test asserts `vi.getTimerCount()` is 0 immediately after abort without advancing timers — reverting to `stream.sleep` fails it and nothing else, so it discriminates the exact behaviour.
