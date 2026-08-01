---
# bf-j5jh
title: Security audit hardening — remediate all findings
status: completed
type: task
priority: high
created_at: 2026-08-01T16:28:11Z
updated_at: 2026-08-01T16:39:33Z
---

Remediate every finding from the 2026-08-01 security audit (security/260801-1010-stride-owasp-full-audit).
Branch: fix/security-audit-hardening. Plan: docs/superpowers/plans/2026-08-01-security-audit-hardening.md.

## Todo

- [x] F-01 (High): end-of-options `--` separator in buildBeansArgs — stop arg injection / jail escape
- [x] F-04 (Med): execFile timeout + SIGKILL — reap hung beans children
- [x] F-07 (Info): keep host paths off /api/projects (Project wire type vs ProjectRecord internal)
- [x] F-06 (Low): secureHeaders + self-only CSP
- [x] F-02 (Med): cross-origin guard middleware (Origin + JSON content-type)
- [x] F-05 (Low): cap graphql request body (256 KB)
- [x] Docs: update SECURITY.md
- [x] Full gate suite green, push, PR, merge on green CI

## Summary of Changes

All seven audit findings remediated on branch \`fix/security-audit-hardening\`, TDD (red→green) each:

- **F-01 (High)** \`buildBeansArgs\` now appends the query after a \`--\` separator, so a \`-\`-leading query can't be parsed as a beans flag (\`--beans-path=\` jail escape closed). Integration test proves the escape against the real binary.
- **F-04 (Med)** \`execFile\` gets a 15s timeout + SIGKILL so hung beans children are reaped.
- **F-07 (Info)** wire \`Project\` type stripped to name/prefix/counts; server-internal \`ProjectRecord\` keeps path/root. \`/api/projects\` no longer leaks host paths.
- **F-06 (Low)** \`secureHeaders\` + self-only CSP (\`frame-ancestors 'none'\`, nosniff).
- **F-02 (Med)** cross-origin guard middleware: non-GET/HEAD \`/api/*\` requires JSON content-type and same-origin Origin.
- **F-05 (Low)** graphql route body capped at 256 KB (\`bodyLimit\` → 413).

Gates green: format, lint, typecheck, coverage (server 97%/94%, web 99%/98%, thresholds met), knip, spell. 7 commits.
