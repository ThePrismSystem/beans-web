# Public-Release Hardening — Design

**Status:** Approved
**Spec:** 3 of 4 (decomposed from the original public-visibility-prep request; specs 1 and 2 cover
list-stability/orphans and multi-directory scanning respectively; spec 4 covers a dedicated
whole-codebase simplify sweep, deliberately split out of this spec — see "Out of scope" below)

## Goal

Bring `beans-frontend` to a state safe and presentable for public visibility: no known-fixable
dependency vulnerabilities, a documented security posture, CI that actually gates on that posture,
enforced 90% test coverage, working Codecov integration (coverage, test analytics, bundle
analysis, badges), and docs that match the current codebase.

## Current state (as of this spec)

- CI (`​.github/workflows/ci.yml`): `lint`, `audit` (`continue-on-error: true`), `typecheck`,
  `test` (with coverage), `build`, `quality` (knip + spell). No action is SHA-pinned. No
  Dependabot config exists.
- `pnpm audit --audit-level moderate` currently reports 6 vulnerabilities (4 high, 2 moderate):
  `fast-uri` (via `commitlint`), `postcss` (via `vite`), `brace-expansion` (via `eslint`), `lodash`
  (via `@graphql-codegen/cli`) — all transitive dev-dependency chains — and `@hono/node-server`
  (direct runtime dependency, `^1.13.0`, needs `>=2.0.5` for a moderate path-traversal fix in
  `serveStatic`).
- Coverage thresholds are set to 80% in all three `vitest.config.ts` files. Actual coverage:
  `packages/shared` 100% (all four metrics), `apps/server` 93.3%/85.7%/90.3%/95.5%
  (stmts/branches/funcs/lines), `apps/web` 92.3%/85.7%/92.9%/92.9%. Branch coverage in `apps/server`
  and `apps/web` is the only metric currently below 90%.
- No Codecov integration. No README badges. `CODECOV_TOKEN` is already present as a repo secret
  (for CI uploads); the badge graph token `N7I7FNHSIO` was supplied separately, for direct use in
  the README badge URL.
- No `docs/SECURITY.md`. Existing docs: `README.md`, `docs/ARCHITECTURE.md`,
  `docs/DOCKER_HANDOFF.md`, `CONTRIBUTING.md`.
- The server has no authentication and binds to `127.0.0.1` by default (`apps/server/src/env.ts`);
  `HOST` is operator-configurable. `apps/server/src/discovery/scan.ts` already has an
  `assertWithinRoot` guard against path traversal in project discovery.
- `tsconfig.base.json` already has `"strict": true`.

## Architecture / approach

No application architecture changes. This spec is infra, dependency, config, docs, and test-gap
work layered onto the existing structure — a security audit and its fixes, a hardened CI pipeline,
a raised and met coverage bar, and a working Codecov + badges + docs setup. Order of work follows
dependency: fix vulnerabilities and write the audit findings doc first (nothing else depends on
this, and it's the highest-severity item), then CI hardening (SHA-pinning + Dependabot, and
flipping `audit` from advisory to blocking now that it's clean), then coverage (raise threshold,
close the branch-coverage gap), then Codecov + badges (depends on coverage reporters already being
correct), then the docs pass (last, since it documents the end state of everything above).

## 1. Security audit and dependency fixes

**Automated:** `pnpm audit --audit-level moderate` is the source of truth for the dependency
findings above. Each gets resolved at the dependency level:

- Transitive advisories (`fast-uri`, `postcss`, `brace-expansion`, `lodash`) are fixed by bumping
  the direct dev-dependency that pulls them in (`@commitlint/cli`, `vite`, `eslint`,
  `@graphql-codegen/cli`) to a version whose own lockfile resolves the patched transitive version.
  If a direct bump alone doesn't move the transitive resolution (pnpm's dedup can pin an older
  compatible version even when a newer one is allowed), add a `pnpm.overrides` entry in the root
  `package.json` for the specific transitive package instead of forcing an unrelated major bump
  elsewhere.
- `@hono/node-server` gets a direct major bump, `^1.13.0` → `^2.x` (patched at `>=2.0.5`). Usage is
  two call sites (`serve` in `apps/server/src/index.ts`, `serveStatic` in
  `apps/server/src/routes/static.ts`) — adapt to any breaking API changes as part of this task, not
  a follow-up.
- Re-run `pnpm audit --audit-level moderate` after fixes and confirm zero findings before moving
  on.

**Manual, scoped to this app's actual attack surface** (not a full line-by-line review):

- Path traversal: verify every filesystem path built from request input (project discovery,
  static file serving, any `GraphQL` variable that becomes a file path) is validated the way
  `assertWithinRoot` already validates project discovery — confirm there's no gap where a path
  reaches `fs` without going through an equivalent guard.
- Command/argument injection: how project paths and user-supplied GraphQL query/variable values
  reach the `beans` CLI child process (`apps/server/src/beans/executor.ts` and callers) — confirm
  arguments are passed as an argv array (not shell-interpolated) and that nothing user-controlled
  can inject an extra CLI flag.
- No-auth posture: the server has no authentication layer and defaults to `127.0.0.1`. This is a
  documented, accepted constraint for a local-first single-user tool, not something to fix —
  `docs/SECURITY.md` states it explicitly, including the operator risk of setting `HOST` to a
  non-loopback address.

**Deliverable:** `docs/SECURITY.md` — what was checked, what was found, what was fixed, what's
accepted as designed, and a disclosure-contact line (GitHub's community-health file convention).

## 2. CI hardening

- SHA-pin every action currently in `.github/workflows/ci.yml` (`actions/checkout`,
  `pnpm/action-setup`, `actions/setup-node`, `actions/setup-go`, `actions/upload-artifact`) and
  every action added by this spec (the two Codecov actions below), each with a trailing
  `# vX.Y.Z` comment for human readability. Exact SHAs are resolved at implementation time against
  each action's current release.
- Add `.github/dependabot.yml` with a `package-ecosystem: "github-actions"` entry so pinned SHAs
  get bumped automatically via PR instead of silently rotting.
- The `audit` job **loses `continue-on-error: true`** and becomes a normal blocking gate, same as
  every other job — once the dependency fixes above land, there's nothing outstanding for it to
  block on, and any future new advisory should stop a merge until triaged.

## 3. Coverage — raise to 90%

- Raise `thresholds.lines/functions/branches/statements` to 90 in all three `vitest.config.ts`
  files (`packages/shared`, `apps/server`, `apps/web`).
- `packages/shared` needs no new tests (already 100%). `apps/server` and `apps/web` need new tests
  covering the currently-uncovered branches (both sit at 85.71% branch coverage today) — found via
  each package's existing `text` coverage reporter output (`Uncovered Line #s` column), not
  guessed. New tests follow the repo's existing TDD/coverage conventions; no threshold gets
  adjusted to fit existing gaps.

## 4. Codecov integration, badges, docs

- **Coverage upload:** `codecov/codecov-action@v5` in the `test` CI job, one upload per package
  tagged with a `flags:` value (`shared` / `server` / `web`) pointing at that package's
  `coverage/lcov.info` (already produced — all three `vitest.config.ts` files already list `lcov`
  among their reporters), authenticated with the existing `CODECOV_TOKEN` secret.
- **Test analytics:** `codecov/test-results-action@v5`, fed by adding a `junit` reporter
  (`--reporter=junit --outputFile=test-report.junit.xml`) alongside each package's existing
  `text`/`lcov`/`html` reporters, uploaded with `if: ${{ !cancelled() }}` so a failing test run
  still reports results.
- **Bundle analysis:** `@codecov/vite-plugin` added as a devDependency in `apps/web`, wired into
  `apps/web/vite.config.ts`, `enableBundleAnalysis` gated on `CODECOV_TOKEN` being set so a local
  build without the token silently skips it.
- **README badges:** Codecov coverage badge (using the graph token `N7I7FNHSIO` directly in the
  badge image URL — this token is meant for public embedding, unlike the upload secret), CI status
  badge, a static "strict TypeScript" badge, an MIT license badge, a Node-version badge. No
  bundle-size badge — Codecov surfaces bundle-size changes as PR checks/comments, not a static
  badge.
- **Docs pass:** add `docs/SECURITY.md` (from §1); review `README.md`, `docs/ARCHITECTURE.md`, and
  `CONTRIBUTING.md` against current code and fix anything stale (setup steps, prerequisites,
  mentions of the now-changed CI gates); document the Codecov setup itself — which secrets/env vars
  exist, what each `flags:` tag maps to, and how bundle analysis is gated — so it doesn't silently
  rot the way the rest of this spec exists to prevent.

## Out of scope

A dedicated, codebase-wide simplification sweep was in the original request but is explicitly
**not** part of this spec — it's independent in scope and review criteria from the
security/CI/coverage/docs work above, and is deferred to spec 4, planned separately, likely last
(after specs 1-3 have settled the code it would sweep over).

## Testing

- Dependency fixes: `pnpm audit --audit-level moderate` reports zero findings; full gate suite
  (`pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage && pnpm knip && pnpm spell`)
  stays green through the `@hono/node-server` major bump.
- Coverage: `pnpm -r test:coverage` passes against the raised 90% thresholds with real new tests,
  not threshold adjustments.
- CI hardening: a CI run on the branch itself is the test — every job (including the now-blocking
  `audit`) must pass, and the workflow YAML must resolve pinned SHAs to the intended action
  versions (spot-checked, not just trusted).
- Codecov: confirmed via an actual CI run uploading to the real Codecov project (coverage, test
  results, and bundle stats all show up), and the README badges render (not broken-image icons)
  once that run completes.
