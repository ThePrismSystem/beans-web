---
# bf-x62e
title: Security hardening round 2 — remediate F-01..F-07
status: in-progress
type: task
priority: high
created_at: 2026-08-02T22:26:51Z
updated_at: 2026-08-03T02:40:52Z
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
- [ ] Task 6: F-04/F-05 harden the container image
- [ ] Task 7: docs + full gate suite
- [ ] Task 8: live verification + PR
