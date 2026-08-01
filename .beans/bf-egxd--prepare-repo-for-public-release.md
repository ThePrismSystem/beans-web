---
# bf-egxd
title: Prepare repo for public release
status: completed
type: task
priority: high
created_at: 2026-08-01T19:40:56Z
updated_at: 2026-08-01T19:49:47Z
---

Close gaps before flipping beans-frontend to public. Branch: chore/prepare-public-release.
Plan: docs/superpowers/plans/2026-08-01-prepare-public-release.md.

## Todo

- [x] Bundle beans Apache-2.0 LICENSE in the Docker image (verify build)
- [x] Add e2e npm script; verify Playwright suite passes locally
- [x] Add CI e2e job (blocking)
- [x] Add CHANGELOG.md with v0.1.0 entry
- [x] README: credit beans Apache-2.0 + link changelog + e2e script
- [x] Full gates green, push, PR, merge on green CI
- [x] Tag v0.1.0 + GitHub release (post-merge)
- [x] Set GitHub description + topics (post-merge)
- [x] Secret-scan git history; deliver hand-off checklist (user flips visibility)

## Summary of Changes

Public-release prep landed via PR #21 (squash \`3ab6af6\`), all CI green incl. the new E2E job.

- **Docker** bundles beans' Apache-2.0 LICENSE at \`/usr/local/share/licenses/beans/LICENSE\` (verified by local build).
- **CI** gained a blocking \`E2E\` job (installs beans + Playwright chromium, runs \`apps/web/e2e\`); passed in 2m4s. Added \`e2e\` npm script.
- **CHANGELOG.md** (Keep a Changelog) seeded with v0.1.0; **README** credits beans Apache-2.0 + links changelog.
- Tagged **v0.1.0** and cut the GitHub release.
- GitHub **description + 15 topics** set.
- **gitleaks** full-history scan: 0 leaks across 158 commits. \`security/\`, \`docs/superpowers/\`, \`.env\` confirmed gitignored.

Remaining: user flips visibility to public (deliberately left to them).
