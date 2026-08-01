---
# bf-vq0w
title: useBeans hook over-fetches bean body for list views
status: completed
type: task
priority: normal
created_at: 2026-08-01T13:38:55Z
updated_at: 2026-08-01T13:45:32Z
---

Already resolved by earlier work (spec 1, client-side-filtering refactor): `useBeans.ts`'s
`BEANS_QUERY` deliberately omits `body` (comment at line 8-10). `body` is only requested by
`BEAN_DETAIL_QUERY` (packages/shared/src/graphql/operations.ts), used solely by `useBean.ts` for
the single-bean detail view. Verified via grep — no list-view query requests `body`. No code
change needed.
