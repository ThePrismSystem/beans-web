---
# bf-k35d
title: Single-source the beans CLI version pin
status: completed
type: task
priority: normal
created_at: 2026-08-03T03:22:33Z
updated_at: 2026-08-03T17:35:47Z
---

The beans version is pinned in four places kept in sync only by comments: Dockerfile ARG BEANS_VERSION, docker-compose.yml build.args.BEANS_VERSION (which overrides the ARG default), and .github/workflows/ci.yml at two go install lines. All are v0.4.2 today.

Nothing prevents drift, and the compose override means bumping only the Dockerfile silently ships the old binary — the doc bug that shipped in round 2 and was corrected in docs/SECURITY.md. Consider a single source (env file, or CI reading the Dockerfile ARG) plus a check that fails the build on mismatch.

## Summary of Changes

The Dockerfile's `ARG BEANS_VERSION` is now the only place the version appears. The compose `build.args` override was deleted (it silently won over the ARG default, which is how the round-2 doc bug shipped), and both CI `go install` steps now read the ARG out of the Dockerfile with `sed` and fail loudly if it comes back empty.

`scripts/check-beans-pin.sh` (`pnpm check:pins`, run in CI's Quality job) greps the build inputs — workflows, Dockerfiles, compose files — for any literal `hmans/beans@v…` and fails on a hit, so a second pin cannot be reintroduced without the build going red. Verified by planting a stray pin in `docker-compose.yml` and watching it fail. `CLAUDE.md`, `CONTRIBUTING.md` and `docs/SECURITY.md` now describe the single source.
