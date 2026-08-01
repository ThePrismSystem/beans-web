---
# bf-egxd
title: Prepare repo for public release
status: in-progress
type: task
priority: high
created_at: 2026-08-01T19:40:56Z
updated_at: 2026-08-01T19:40:56Z
---

Close gaps before flipping beans-frontend to public. Branch: chore/prepare-public-release.
Plan: docs/superpowers/plans/2026-08-01-prepare-public-release.md.

## Todo

- [ ] Bundle beans Apache-2.0 LICENSE in the Docker image (verify build)
- [ ] Add e2e npm script; verify Playwright suite passes locally
- [ ] Add CI e2e job (blocking)
- [ ] Add CHANGELOG.md with v0.1.0 entry
- [ ] README: credit beans Apache-2.0 + link changelog + e2e script
- [ ] Full gates green, push, PR, merge on green CI
- [ ] Tag v0.1.0 + GitHub release (post-merge)
- [ ] Set GitHub description + topics (post-merge)
- [ ] Secret-scan git history; deliver hand-off checklist (user flips visibility)
