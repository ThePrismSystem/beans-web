---
# bf-a3tl
title: Remediate third-round audit findings (8 issues, P1-P3)
status: completed
type: task
priority: high
created_at: 2026-08-02T20:41:37Z
updated_at: 2026-08-02T20:51:19Z
---

Third audit scored 19/20. The remaining P1s are all long-standing defects that
three audits missed because every pass reviewed rendered output rather than
what happens when you actually operate the interface.

## Todo

- [x] P1 harden: per-route document.title (was always "beans-frontend")
- [x] P1 harden: role=status / role=alert on the nine loading and error states
- [x] P1 harden: move focus to #main-content on navigation
- [x] P1 harden: InlineEditRow returns focus — editor on open, pencil on save/cancel
- [x] P2 normalize: demote markdown body headings so bodies cannot inject a second h1
- [x] P3 polish: rel=noopener and a new-tab notice on rendered links
- [x] P3 polish: replace the title="Edit title" hint with aria-describedby
- [x] P3 polish: guarded backdrop click gives visible feedback
- [x] Gates green; CHANGELOG 0.1.4; PR merged

## Summary of Changes

All 8 findings from the 19/20 audit addressed.

### Why three audits missed these

Every previous pass reviewed what the app _renders_. Each finding here only
appears when you _operate_ it: click a pencil, navigate, wait for a load. The
markup was fine in all three cases; the behavior around it was not.

### What was wrong

The app never spoke. Every route was titled "beans-frontend", navigation left
focus on <body>, and nine loading and error states were plain text — so a
screen reader user got no signal that anything had happened, including failure.
Separately, editing type/status/priority/tags destroyed keyboard focus on every
interaction, on the view where most editing happens.

### Verified

Focus behavior is asserted in unit tests (editor on open, pencil on save and
cancel, nothing grabbed on first render) and in e2e (main landmark focused on
navigation, untouched on first paint). Titles are asserted per route in a real
browser, and the error path is driven by intercepting the API.

### One test-quality fix along the way

The first version of the title test asserted the seeded bean's name, which
another spec renames mid-run — shared-fixture coupling that would have gone
flaky. It now reads the title off the page instead.

### Gates

format, lint, typecheck, knip, spell, codegen:check and build all pass. 491
unit tests pass (was 477); web coverage 99.07%. 48 e2e pass (was 44).
