---
# bf-x62e
title: Security hardening round 2 — remediate F-01..F-07
status: completed
type: task
priority: high
created_at: 2026-08-02T22:26:51Z
updated_at: 2026-08-03T17:33:12Z
---

Remediate the seven actionable findings from the 2026-08-02 audit (security/260802-1624-stride-owasp-full-audit).

Branch: fix/security-hardening-round-2
Spec: docs/superpowers/specs/2026-08-02-security-hardening-round-2-design.md
Plan: docs/superpowers/plans/2026-08-02-security-hardening-round-2.md

Out of scope by design: F-08 rate limiting, F-09 authentication.

## Todo

- [x] Task 1: F-01 process-wide beans subprocess gate
- [x] Task 2: F-02 redact host paths from error messages
- [x] Task 3: F-03 parse content-type essence in CSRF guard
- [x] Task 4: F-06 log API requests
- [x] Task 5: F-07 cap concurrent SSE connections
- [x] Task 6: F-04/F-05 harden the container image
- [x] Task 7: docs + full gate suite
- [x] Task 8: live verification + PR

## Summary of Changes

All seven actionable audit findings (F-01..F-07) remediated on `fix/security-hardening-round-2`,
each with a regression test that fails without its fix. F-08 (rate limiting) and F-09 (auth) were
scoped out by design.

Verified against a live server, not only in tests: content-type bypass returns 415; error responses
carry a basename with no absolute path; peak 8 `beans` children across 39 samples during a 4.7s
burst of 120 concurrent requests; 33rd SSE stream returns 503 and a freed slot is reused. Container
built and booted at both uid 1000 and uid 1001, read-only with all capabilities dropped.

Three defects were found by review rather than by the plan:

1. Request logging (F-06) reopened the disclosure F-02 had just closed — `hono/logger` logs the
   path with its query string, and `/api/search?q=…` carries the user's search text. Fixed by
   stripping the query in the log sink rather than exempting the endpoint.
2. The path-redaction control shipped with a test that could not fail; deleting the redaction left
   the suite green. Replaced with one driving real stderr through the executor.
3. The container hardening bricked the configuration compose itself recommends: Docker sets
   `HOME=/` for a numeric uid, so under `read_only: true` corepack died before reaching the
   `/home/node/.cache` tmpfs. Fixed with `ENV HOME=/home/node`. README also still claimed the
   container ran as root.

Full gate green (format, lint, typecheck, test:coverage, knip, spell, codegen:check) plus 55/55 e2e.
Follow-up work deferred deliberately is tracked in separate beans.
