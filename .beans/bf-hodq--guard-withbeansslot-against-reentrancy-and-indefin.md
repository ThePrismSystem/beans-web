---
# bf-hodq
title: Guard withBeansSlot against reentrancy and indefinite waits
status: completed
type: task
priority: low
created_at: 2026-08-03T03:22:33Z
updated_at: 2026-08-03T17:33:12Z
---

withBeansSlot (util/concurrency.ts) is non-reentrant and undocumented, and acquire() has no timeout: 8 nested calls would deadlock forever. No call site nests today, so this is a latent trap rather than a live bug. Either document the constraint at the export or add a timeout/reentrancy guard.

## Summary of Changes

`withBeansSlot` now detects reentrancy via `AsyncLocalStorage` and throws with an explanatory message instead of deadlocking. The docblock states the constraint.

No timeout was added: the saturation policy is deliberately FIFO with no rejection, and a timeout would reintroduce rejection under exactly the load the queue exists to absorb. Reentrancy is the real trap — with every slot held by a caller awaiting a nested acquire, nothing can ever release — and converting that silent hang into a loud error is the part worth having. Tests cover both the throw and that the outer slot is still released afterwards.
