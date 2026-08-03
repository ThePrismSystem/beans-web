---
# bf-k35d
title: Single-source the beans CLI version pin
status: todo
type: task
priority: normal
created_at: 2026-08-03T03:22:33Z
updated_at: 2026-08-03T03:22:33Z
---

The beans version is pinned in four places kept in sync only by comments: Dockerfile ARG BEANS_VERSION, docker-compose.yml build.args.BEANS_VERSION (which overrides the ARG default), and .github/workflows/ci.yml at two go install lines. All are v0.4.2 today.

Nothing prevents drift, and the compose override means bumping only the Dockerfile silently ships the old binary — the doc bug that shipped in round 2 and was corrected in docs/SECURITY.md. Consider a single source (env file, or CI reading the Dockerfile ARG) plus a check that fails the build on mismatch.
