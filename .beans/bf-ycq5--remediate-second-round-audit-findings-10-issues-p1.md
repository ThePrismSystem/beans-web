---
# bf-ycq5
title: Remediate second-round audit findings (10 issues, P1-P3)
status: completed
type: task
priority: high
created_at: 2026-08-02T20:12:50Z
updated_at: 2026-08-02T20:22:32Z
---

Follow-up to the 14/20 audit remediation. Re-audit scored 17/20 and surfaced 10
issues, including one Level A defect missed in the first pass and one regression
introduced by the first round of fixes.

## Todo

- [x] P1 harden: create-bean form errors — role=alert, aria-describedby, aria-invalid, required, focus the invalid input
- [x] P1 harden: axe-scan the create-bean form so it cannot regress
- [x] P2 normalize: h1 accessible name reads the bean title, not "Edit title: X"
- [x] P2 normalize: test asserting the heading resolves to the title itself
- [x] P2 optimize: React.memo on BeanRow
- [x] P2 optimize: lazy-load the markdown renderer out of the main chunk
- [x] P3 extract: migrate off-scale spacing literals onto the token scale
- [x] P3 extract: guard the 768px breakpoint against JS/CSS drift with a test
- [x] P3 polish: drop aria-haspopup (disclosure, not a menu)
- [x] P3 polish: arrow-key navigation in filter menus
- [x] P3 polish: backdrop click must not discard a typed scrap reason
- [x] P3 polish: chart table named by its heading instead of a duplicate caption
- [x] Gates green; CHANGELOG 0.1.3; PR merged

## Summary of Changes

All 10 findings from the 17/20 re-audit addressed.

### The two that mattered

The create-bean form had a WCAG Level A defect I missed entirely in the first
audit by never opening the file: an empty submit rendered an error no screen
reader could reach, with focus left on the button. It is now announced,
associated with the input, and focused.

The bean detail h1 announced as "Edit title: X" — a regression from 0.1.2's own
fix for the missing h1. A heading takes its name from its contents, so the edit
button's aria-label became the heading's name. Verified by role query rather
than by reading code: the heading now matches the bean title, and matches zero
elements under the old name.

### Measured, not asserted

Entry chunk 425.7 kB -> 330.7 kB (gzip 132.9 -> 103.8), confirmed by grepping
the built assets for marked and DOMPurify — both now live in beanDetail-*.js.

### Scope note

Spacing literals went from 16 declarations to 4. Each survivor is deliberate
and documented: one fluid clamp() and three horizontal paddings whose nearest
scale step would shift them by more than 0.05rem, which is enough to see.
Forcing those onto the scale would change a settled design to satisfy a metric.

The 768px breakpoint still appears in both CSS and JS. CSS variables cannot be
used in media queries, so it is guarded by tests at 768px and 769px rather than
deduplicated.

### Gates

format, lint, typecheck, knip, spell, codegen:check and build all pass. 477
unit tests pass (was 461); web coverage 99.11% -> 99.12%. 44 e2e pass (was 37).
