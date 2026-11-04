---
# bf-fv21
title: Apply Renovate security updates and release 0.3.1
status: completed
type: task
priority: normal
created_at: 2026-11-04T14:33:56Z
updated_at: 2026-11-04T14:41:32Z
---

Apply the five open Renovate security PRs (#48 hono 4.13.11, #49 vitest 4.1.11, #50 dompurify 3.4.17, #51 vite 8.2.4, #52 zod 4.6.6) in one PR with the 0.3.1 changelog entry, and run the full gate and E2E. Merging and tagging v0.3.1 follow the PR.

- [x] Bump hono, vitest, dompurify, vite, zod
- [x] Full CI gate + E2E pass
- [x] CHANGELOG 0.3.1 entry

## Summary of Changes

- Lockfile-only bumps: hono 4.13.11, zod 4.6.6, dompurify 3.4.17, vite 8.2.4, vitest 4.1.11, plus @vitest/coverage-v8 4.1.11 (exact peer of vitest). `pnpm dedupe` removed the zod 4.4.3 copy held by knip and eslint-plugin-react-hooks.
- Checked reachability: no runtime advisory reaches this code (node-server serveStatic, no parseBody/jsx, no constrained zod collections, DOMPurify string mode with a non-removing hook). vite/vitest are dev-only.
- CHANGELOG 0.3.1 entry, also covering the #46 toolchain upgrades.
- Full gate passed (715 tests, 98%+ coverage); E2E 60/60.
- Pre-existing, not introduced here: MaxListenersExceededWarning in apps/server events.test.ts (same count on main lockfile).
