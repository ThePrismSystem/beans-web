---
# bf-zv3j
title: Remediate design audit findings (24 issues, P1-P3)
status: completed
type: task
priority: high
created_at: 2026-08-02T17:00:11Z
updated_at: 2026-08-02T17:27:36Z
---

Technical design audit scored 14/20. Remediate all findings across accessibility,
theming, responsive design, and performance. Aesthetic direction ("warm engineering
logbook") is settled and unchanged — this is defect work within it.

Contrast ratios below were computed against WCAG 2.1 formulas, not estimated.

## Todo

- [x] P1 colorize: chart layer reads theme tokens instead of 13 hard-coded hex values
- [x] P1 colorize: axis tick text meets AA in both themes (was 3.40:1 light / 4.00:1 dark)
- [x] P1 harden: --on-accent on save button (was 4.16:1 light / 2.64:1 dark)
- [x] P1 harden: warning banners off --s-in-progress as text (was 2.27:1 light)
- [x] P1 harden: closed mobile drawer inert so it leaves the tab order
- [x] P1 harden: replace window.prompt() for scrap reason
- [x] P1 extract: base button style so buttons stop falling back to UA chrome
- [x] P1 extract: spacing, radius and type-size scales in tokens.css
- [x] P1 optimize: coalesce SSE invalidations; scope analytics invalidation
- [x] P1 optimize: bean-detail dataset investigated — see Summary; no change needed
- [x] P1 a11y: HeaderSearch combobox ARIA + arrow-key navigation
- [x] P2 adapt: flex-wrap on .analytics-totals (overflowed at 320px)
- [x] P2 adapt: merge duplicated media blocks; keep CheckboxMenu in viewport
- [x] P2 normalize: skip link, h1 on bean detail, analytics heading order
- [x] P2 normalize: warm ink scrims replace six pure-black literals
- [x] P2 a11y: focus management for the mobile drawer
- [x] P2 a11y: text alternative for charts (WCAG 1.1.1)
- [x] P3 polish: uniform focus rings, --on-accent off pure white, reduced-motion coverage
- [x] P3 polish: CheckboxMenu aria-haspopup/aria-controls
- [x] Extend e2e a11y scan to dialogs and mobile viewport
- [x] Gates green; CHANGELOG 0.1.2; PR merged

## Summary of Changes

All 24 audit findings addressed. Audit score was 14/20.

### Verified, not asserted

Every contrast figure quoted was computed against the WCAG 2.1 formula rather
than eyeballed, and the chart fixes are now guarded by an e2e test that reads
the resolved paint out of a real browser in both schemes and asserts the ratio.
That test earned its keep immediately: the first version of the axis-tick rule
did not match recharts v3's DOM, so the label-contrast fix was silently inert.
Nothing else in the suite would have noticed — axe's contrast rule skips SVG
text, which is why the bug existed in the first place.

### One finding downgraded rather than fixed

The audit flagged bean detail as re-fetching the whole project dataset per
view. On reading `useBeans.ts` this was overstated: `useProjectBeans(project,
"")` shares its query key with the project list, so the common path is a cache
hit, not a second fetch. The dataset is also genuinely required — orphan
detection walks the full ancestor chain and the relation picker needs every
candidate. Narrowing it would need a server-side change for no measured gain,
so it was left alone deliberately.

### Scope note

`tokens.css` gained spacing, radius and type-size scales, and radii were
converted throughout. Spacing was converted in the rules already being touched;
a blind sweep of the remaining ~100 padding/margin declarations carried
regression risk with no way to see the result, so it was not attempted.

### Gates

format, lint, typecheck, knip, spell, codegen:check, build all pass. 461 unit
tests pass (was 444); web coverage 96.26% -> 99.11%. 37 e2e pass (was 33).
