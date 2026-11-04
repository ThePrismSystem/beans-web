---
# bf-fv21
title: Apply Renovate security updates and release 0.3.1
status: completed
type: task
priority: normal
created_at: 2026-11-04T14:33:56Z
updated_at: 2026-11-04T18:09:13Z
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

## Follow-up: CI audit and image scan

CI on #53 failed Audit (62 advisories) and Image Scan (30 node-pkg + 15 gobinary HIGH/CRITICAL), all accumulated on main since August.

- Refreshed transitive deps within range (undici, fast-uri, shell-quote, seroval, js-yaml, brace-expansion, busboy, graphql-tools, smol-toml), @hono/node-server 2.1.6, vitest/coverage-v8 4.1.12, jsdom 30.1.3, codegen chain (graphql-tools/utils 12).
- Ignored GHSA-g3hv-75wg-m249 (minimatch 10, ESLint) and GHSA-mrhx-c7xc-m3w5 (zod 3, codecov plugin) in pnpm-workspace.yaml auditConfig: no upstream fix; user chose ignore. Server zod floored at ^4.6.6.
- Go 1.26.10, x/net 0.60.0, x/text 0.42.0 in build-beans.sh; local Trivy scan clean.
- Gate, server integration and E2E (60/60) re-run against the rebuilt beans binary.
