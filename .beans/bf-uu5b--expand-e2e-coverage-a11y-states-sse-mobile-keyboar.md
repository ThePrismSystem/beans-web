---
# bf-uu5b
title: "Expand e2e coverage: a11y, states, SSE, mobile, keyboard"
status: in-progress
type: task
priority: normal
created_at: 2026-08-01T20:02:49Z
updated_at: 2026-08-01T20:17:46Z
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
- [ ] Full gates green, push, PR, merge on green CI
