---
# bf-vq0w
title: useBeans hook over-fetches bean body for list views
status: completed
type: task
priority: normal
created_at: 2026-08-01T13:38:55Z
updated_at: 2026-08-01T14:47:24Z
---

Already resolved by earlier work (spec 1, client-side-filtering refactor): `useBeans.ts`'s
`BEANS_QUERY` deliberately omits `body` (comment at line 8-10). Only `BEAN_DETAIL_QUERY`
(packages/shared/src/graphql/operations.ts) requests `body`, and only `useBean.ts` uses it, for
the single-bean detail view. Verified via grep: no list-view query requests `body`, so no code
change is needed.
