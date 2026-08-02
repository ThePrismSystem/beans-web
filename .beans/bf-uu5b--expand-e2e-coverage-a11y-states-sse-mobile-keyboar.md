---
# bf-uu5b
title: "Expand e2e coverage: a11y, states, SSE, mobile, keyboard"
status: completed
type: task
priority: normal
created_at: 2026-08-01T20:02:49Z
updated_at: 2026-08-01T20:26:36Z
---

Add five e2e coverage areas to apps/web/e2e. Branch: test/expand-e2e-coverage.
Plan: docs/superpowers/plans/2026-08-01-expand-e2e-coverage.md.

## Todo

- [ ] Add @axe-core/playwright dep + seed a second empty project
- [x] a11y.spec.ts: scan key surfaces (WCAG 2.1 AA) light+dark, fix all violations, assert 0
- [x] states.spec.ts: empty (real) + error (mocked) states
- [x] live-update.spec.ts: SSE surfaces on-disk beans create without reload
- [x] mobile.spec.ts: Pixel-5 viewport, drawer, no horizontal overflow
- [x] keyboard.spec.ts: focus trap, Escape-restore (+ BeanPicker focus-restore fix), keyboard-operable toggle
- [x] Full gates green, push, PR, merge on green CI

## Summary of Changes

Merged via PR #22 (squash c5cb97c), all CI green incl. the E2E job (23 tests, 2m52s).

Five new e2e specs in apps/web/e2e: a11y (axe, light+dark, 5 surfaces), states (empty real + error mocked), live-update (SSE), mobile (Pixel-5 drawer + overflow), keyboard (focus trap + Escape-restore). Harness seeds a second empty project; added @axe-core/playwright.

App fixes surfaced by the tests:

- WCAG AA contrast: type/accent/scrapped tokens converted to per-theme light-dark() values; delete button given an explicit bg so dark mode doesn't fall back to UA gray. 0 axe violations in both schemes.
- WCAG 2.4.3: BeanPicker restores focus to its opener on close (+ unit test).

Gates green; web unit/component tests 311, coverage thresholds met.
