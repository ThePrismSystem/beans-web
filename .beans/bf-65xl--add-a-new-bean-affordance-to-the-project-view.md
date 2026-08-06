---
# bf-65xl
title: Add a new-bean affordance to the project view
status: completed
type: feature
priority: high
created_at: 2026-08-06T14:33:51Z
updated_at: 2026-08-06T14:55:43Z
---

The project view has no create affordance. The only way to create a bean is from a bean detail page, so an empty project is a dead end and a top-level bean requires opening an unrelated bean to clear its parent. Reuse the existing CreateBeanForm and the '+ New bean' disclosure pattern; place it responsively for mobile and desktop.

## Summary of Changes

The project view now carries the same `+ New bean` disclosure the bean detail page has, reusing `CreateBeanForm` unchanged. Its candidate list comes from the unfiltered project dataset, so an active search cannot narrow what the new bean may be attached to, and no parent is pre-selected — this is the only path in the UI that can produce a top-level bean.

Placement: grouped with the view toggle in a header actions cluster. On desktop the cluster sits opposite the project name; below 768px it takes its own full-width row with the toggle and the create action pushed to opposite ends, which separates two 44px touch targets by a thumb width instead of 9.6px. The button is accent-on-hairline rather than a filled control — it discloses the form, it does not commit. Hover resolves to `--paper` rather than the base button `--hairline`, because accent-on-hairline is 4.51:1 and would break on any token nudge.

Verified: full gate exit 0 (34/268/405), E2E 59/59. The mobile rule was mutation-tested — removing it collapses the measured gap to 9.6px and turns the spec red.
