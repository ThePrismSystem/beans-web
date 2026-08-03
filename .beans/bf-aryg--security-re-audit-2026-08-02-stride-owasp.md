---
# bf-aryg
title: Security re-audit 2026-08-02 (STRIDE + OWASP)
status: completed
type: task
priority: normal
created_at: 2026-08-02T21:25:11Z
updated_at: 2026-08-02T21:43:24Z
---

Second full STRIDE/OWASP audit of beans-frontend, following remediation of the 2026-08-01 findings. Output: security/260802-1624-stride-owasp-full-audit/.

## Todo

- [x] Recon + asset/trust-boundary map
- [x] STRIDE threat model
- [x] Attack surface map
- [x] Loop: test each OWASP category
- [x] Historical comparison vs 260801-1010
- [x] Write reports

## Summary of Changes

28 vectors tested, 10/10 OWASP + 6/6 STRIDE covered, metric 89/100. Static review plus live validation against a running server over 2- and 12-project throwaway GIT_ROOT trees.

**All 6 findings from the 2026-08-01 audit verified fixed** by adversarial re-test, including the High arg-injection jail escape (`--beans-path=/etc` and three other flag-shaped queries all bounce off the `--` separator). No regressions.

**7 new + 2 informational findings**, none introduced by the remediation work:

- **F-01 (Med)** `BEANS_CONCURRENCY=8` is a per-request pool, not a server-wide cap — `mapWithConcurrency` allocates a fresh pool per call. Measured 120 concurrent GETs -> 162 live beans children, latency 0.072s -> 4.23s median. GET is exempt from the cross-origin guard, so drive-by triggerable.
- **F-02 (Med)** raw beans stderr returned verbatim discloses absolute host paths + OS username; partially reverses the F-07 fix, which only covered /api/projects.
- **F-03 (Low)** cross-origin guard content-type check uses `includes()`, matched by `multipart/form-data; boundary=application/json` (CORS-safelisted, no preflight); write lands. Origin check still blocks browsers, so not presently exploitable.
- **F-04..F-07 (Low)** container runs as root with RW host mount; `BEANS_VERSION=latest` in the image build while CI pins v0.4.2; no audit logging of writes; unbounded SSE streams.
- **F-08/F-09 (Info)** no rate limiting; no auth (by design, documented).

Cleared 13 vectors: XSS (23 payloads through DOMPurify), static traversal (9 encodings), filename traversal, YAML front-matter injection, introspection, Origin bypass, SSRF, dependency CVEs, committed secrets.

Report: `security/260802-1624-stride-owasp-full-audit/overview.md` (gitignored).
