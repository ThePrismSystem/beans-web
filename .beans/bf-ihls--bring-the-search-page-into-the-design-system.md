---
# bf-ihls
title: Bring the search page into the design system
status: completed
type: bug
priority: high
created_at: 2026-08-02T21:02:48Z
updated_at: 2026-08-02T21:11:54Z
---

A scoped audit of /search scored it 11/20, against 19/20 for the app as a whole.
Root cause: `.search-page` and `.bean-list` have no CSS rules at all, and
`.filter-search` takes its appearance from the compound selector
`.filter-bar input`, which does not match outside the filter bar. The page's
primary control therefore renders as a raw browser input — measured identical at
375px and 1280px.

## Todo

- [x] P1 normalize: style .filter-search on the class itself, not via .filter-bar input
- [x] P1 adapt: input fills its column instead of a fixed 185px
- [x] P1 adapt: stack result rows on narrow viewports (they wrap mid-word at 375px)
- [x] P2 adapt: page max-width so desktop rows stop spanning 1040px
- [x] P2 arrange: hairline separators on the result list
- [x] P2 harden: role=alert on "Search failed." — missed by the 0.1.4 sweep of this file
- [x] P3 harden: announce the result count, as the header search already does
- [x] P3 polish: 16px input font so iOS stops zooming on focus
- [x] Regression tests pinning the input's width and appearance
- [x] Gates green; CHANGELOG 0.1.5; PR merged

## Summary of Changes

`.filter-search` is now styled on its own class rather than through the
compound `.filter-bar input` selector, so the control keeps its appearance
wherever it is used. `.search-page` and `.bean-list` gained the rules they
never had: a 46rem column cap, a full-width input, hairline-ruled rows, and a
narrow-viewport layout that stacks the project name onto its own line instead
of wrapping the title mid-word. The input drops to a 16px font below 768px so
iOS Safari stops zooming on focus.

Two behavioural fixes on the same page: `Search failed.` is a live region
(the 0.1.4 sweep of this file replaced only the loading branch), and the page
now states its result count, visibly and announced.

Seven Playwright assertions read resolved style back out of a real browser at
375px and 1280px. Five of them fail against the previous stylesheet, which is
the point — the defect was a rule that silently did not match, invisible to
any test that only inspects markup.

Measured before and after at 375px: input width 185px to 343px, font 13.3px
Arial to 16px system-ui, border `2px inset` to a 1px hairline, background
pure white to `--paper-raised`. At 1280px: 185px to 736px, with the column
capped at the same 736px instead of spanning 1040px.
