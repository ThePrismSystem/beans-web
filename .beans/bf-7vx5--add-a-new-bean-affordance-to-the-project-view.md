---
# bf-7vx5
title: Add a new-bean affordance to the project view
status: scrapped
type: feature
priority: high
created_at: 2026-08-06T14:33:39Z
updated_at: 2026-08-06T14:56:03Z
---

The project view (/p/$project) has no create affordance. The only way to create a bean is from a bean detail page, so an empty project is a dead end and a top-level bean requires opening an unrelated bean to clear its parent. Reuse the existing CreateBeanForm and the '+ New bean' disclosure pattern; place it responsively for mobile and desktop.

## Reasons for Scrapping

Duplicate. A `beans create` whose JSON I mis-parsed had in fact succeeded, so the retry created a second bean for the same work. [[bf-65xl]] carries the work and its summary.
