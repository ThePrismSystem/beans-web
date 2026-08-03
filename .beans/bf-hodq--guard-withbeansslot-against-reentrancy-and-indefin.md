---
# bf-hodq
title: Guard withBeansSlot against reentrancy and indefinite waits
status: todo
type: task
priority: low
created_at: 2026-08-03T03:22:33Z
updated_at: 2026-08-03T03:22:33Z
---

withBeansSlot (util/concurrency.ts) is non-reentrant and undocumented, and acquire() has no timeout: 8 nested calls would deadlock forever. No call site nests today, so this is a latent trap rather than a live bug. Either document the constraint at the export or add a timeout/reentrancy guard.
