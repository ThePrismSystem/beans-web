---
# bf-96xa
title: Repair the lint gate and fix surfaced violations
status: in-progress
type: bug
priority: high
created_at: 2026-08-02T22:57:26Z
updated_at: 2026-08-03T00:53:01Z
---

pnpm lint has never linted TypeScript source. ESLint 10 resolves the nearest eslint.config.js per file, so per-package re-export shims became the active config and the root's apps/server/**/*.ts globs (relative to the active config dir) matched nothing.

Evidence: a file with 'const v: any = x[0]!' passes pnpm lint --max-warnings 0. eslint . matches 10 files, none TypeScript source. Removing the shims -> 158 files, 446 errors + 19 warnings across 115 files.

Broken since scaffold commit ccbcdd5.

Branch: fix/lint-config-and-violations
Plan: docs/superpowers/plans/2026-08-02-lint-gate-repair.md

## Todo

- [x] T1 config resolution + 14 parse errors
- [x] T2 autofix sweep (269)
- [x] T3 apps/server + packages/shared (56)
- [x] T4 apps/web (121)
- [x] T5 full gate + docs

## Summary of Changes

Deleted the three per-package `eslint.config.js` re-export shims so ESLint resolves the root flat config for every file. Repaired the 14 parse errors this surfaced by pointing the web block at a new `apps/web/tsconfig.eslint.json` covering `src`, `e2e`, and root-level `*.ts`.

Fixed all 446 errors + 19 warnings across 115 files: 269 by autofix (166 `import-x/order`), the rest by hand. No `eslint-disable`, no `as any`, no weakened assertions.

Also removed stale `eslint.config.js` entries from the four knip configs and typed the e2e seed fixture via `seed.d.mts`.

Acceptance test: a planted `const v: any = x[0]!;` now fails `eslint . --max-warnings 0` with 3 errors; before the fix it passed clean. `eslint .` matches 163 files, up from 10.

Gate verified green end to end: format, lint, typecheck, 496 unit tests, knip, spell, codegen:check, and 55/55 e2e.

Documented the constraint in `CONTRIBUTING.md` so a per-package config is not reintroduced.
