---
# bf-96xa
title: Repair the lint gate and fix surfaced violations
status: in-progress
type: bug
priority: high
created_at: 2026-08-02T22:57:26Z
updated_at: 2026-08-02T22:57:26Z
---

pnpm lint has never linted TypeScript source. ESLint 10 resolves the nearest eslint.config.js per file, so per-package re-export shims became the active config and the root's apps/server/**/*.ts globs (relative to the active config dir) matched nothing.

Evidence: a file with 'const v: any = x[0]!' passes pnpm lint --max-warnings 0. eslint . matches 10 files, none TypeScript source. Removing the shims -> 158 files, 446 errors + 19 warnings across 115 files.

Broken since scaffold commit ccbcdd5.

Branch: fix/lint-config-and-violations
Plan: docs/superpowers/plans/2026-08-02-lint-gate-repair.md

## Todo

- [ ] T1 config resolution + 14 parse errors
- [ ] T2 autofix sweep (269)
- [ ] T3 apps/server + packages/shared (56)
- [ ] T4 apps/web (121)
- [ ] T5 full gate + docs
