---
# bf-xcqu
title: Apply pending Renovate updates and release 0.4.0
status: completed
type: task
priority: normal
created_at: 2026-11-05T14:45:57Z
updated_at: 2026-11-05T15:27:37Z
---

Apply every open item on the Renovate dependency dashboard (#44), run the full gate and E2E, with the 0.4.0 changelog entry. Merging and tagging v0.4.0 follow the PR.

## Non-major

- [x] @tanstack/react-router 1.170.46, @tanstack/react-query 5.105.0
- [x] hono 4.13.14, tsx 4.23.15, zod 4.6.7, marked 18.1.2 (graphql 17.1.0 held: inside 7-day release age)
- [x] react / react-dom 19.3.1
- [x] dev dependencies (non-major) group
- [x] github actions group (setup-node, upload-artifact, codecov, codeql, pnpm/action-setup)
- [x] golang 1.27 docker tag
- [x] pnpm 11.28.9 (superseded by pnpm 12)
- [x] golang: 1.27.3 rather than the dashboard 1.27.2, which carries HIGH CVE-2026-111943 that 1.26.10 already fixed
- [x] zizmor 1.32.0 (held: inside 7-day release age)

## Major

- [x] @types/node v26
- [x] eslint-plugin-unicorn v79
- [x] typescript v7 (held at 6.0.3: typescript-eslint 8.72.1 still throws under TS 7)
- [x] node v26 (.nvmrc, engines, both Dockerfile stages, README, CONTRIBUTING; corepack installed from npm)
- [x] pnpm v12
- [x] vitest / @vitest/coverage-v8 v5
- [x] chokidar v6
- [x] jsdom v31 (held: published today, inside 7-day release age)

## Verification

- [x] Full CI gate locally
- [x] E2E (60/60)
- [x] docker build, Trivy HIGH/CRITICAL clean, read-only container smoke test
- [x] CHANGELOG 0.4.0 entry

## Summary of Changes

- Every dashboard update applied at the newest version at least 7 days old (Renovate minimumReleaseAge), locked with `pnpm add <pkg>@<exact>`, then written back as `^` ranges. Held: graphql 17.1.0, jsdom 31.0.0, zizmor 1.32.0 (inside the 7-day window; user chose to hold) and TypeScript 7 (typescript-eslint 8.72.1 still caps at <6.1.0 and throws at import; tsc 7 itself typechecks clean).
- Node 26 floor moved in .nvmrc, engines, both Dockerfile stages, README, CONTRIBUTING. Node 25+ ships no corepack, so the image installs corepack (ARG COREPACK_VERSION, tracked by a new Renovate regex manager).
- pnpm 12 is a native binary; corepack fetched it into the noexec /home/node/.cache tmpfs at first start and the container failed with EACCES. pnpm is now installed into the image at build (COREPACK_HOME=/usr/local/share/corepack, `corepack install && pnpm --version`). Verified: boots read-only, with and without the cache tmpfs, as uid 1234, and with --network none; nothing is written to /home/node/.cache, so the tmpfs was dropped from docker-compose.yml and the docs.
- Go 1.27.3 instead of the dashboard 1.27.2: 1.27.2 has HIGH CVE-2026-111943 (crypto/x509), fixed in 1.26.10 and 1.27.3; Trivy clean on 1.27.3.
- knip 6.43 fallout: RelationOrigin un-exported (only used in its file); redundant e2e/fixtures/serve.mjs entry removed.
- Gate: format, lint, typecheck, test:coverage (715 tests), knip, spell, codegen:check, check:pins, audit all pass on Node 26; E2E 60/60.

### Follow-up candidate

BeansWatcher attaches no `error` listener to chokidar. Both v5 and v6 emit `error` for non-ENOENT failures (e.g. EACCES on a .beans dir), which would throw. Pre-existing; not changed here.
