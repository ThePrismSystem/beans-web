# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-01

First public release: a web UI for [`beans`](https://github.com/hmans/beans), the
local-first, Markdown-backed issue tracker.

### Added

- Project discovery across one or more configured `GIT_ROOT` roots, each project
  read directly from its on-disk `.beans` files (no database).
- Per-project overview with type and status counts, plus hierarchy and flat bean
  lists.
- Bean detail view with inline editing and relationship management (parent,
  children, blocking, blocked-by).
- Cross-project search and simple analytics.
- Live updates over Server-Sent Events as `.beans` files change on disk.
- Docker image and `docker-compose.yml` for self-hosting; the bundled `beans` CLI
  is built from source in a multi-stage build.

### Security

- Argument-injection hardening on the `beans` CLI invocation, a cross-origin
  request guard, security headers with a self-only CSP, a request body cap, and a
  subprocess timeout. Host filesystem paths are no longer exposed by
  `GET /api/projects`. See [`docs/SECURITY.md`](docs/SECURITY.md).

[0.1.0]: https://github.com/ThePrismSystem/beans-frontend/releases/tag/v0.1.0
