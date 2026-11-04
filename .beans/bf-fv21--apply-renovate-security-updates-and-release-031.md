---
# bf-fv21
title: Apply Renovate security updates and release 0.3.1
status: in-progress
type: task
priority: normal
created_at: 2026-11-04T14:33:56Z
updated_at: 2026-11-04T14:40:37Z
---

Apply the five open Renovate security PRs (#48 hono 4.13.11, #49 vitest 4.1.11, #50 dompurify 3.4.17, #51 vite 8.2.4, #52 zod 4.6.6) in one PR, run the full gate and E2E, then cut v0.3.1.

- [x] Bump hono, vitest, dompurify, vite, zod
- [x] Full CI gate + E2E pass
- [x] CHANGELOG 0.3.1 entry
- [ ] PR merged, Renovate PRs closed
- [ ] Tag and GitHub release v0.3.1
