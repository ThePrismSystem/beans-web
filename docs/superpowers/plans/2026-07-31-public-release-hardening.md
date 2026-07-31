# Public-Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every currently-known dependency vulnerability, harden CI (SHA-pinned actions,
blocking audit gate), raise and meet 90% test coverage, wire up Codecov (coverage, test
analytics, bundle analysis, badges), and bring docs up to date — all without touching application
architecture.

**Architecture:** Pure infra/config/docs/test work layered onto the existing monorepo structure.
Order follows dependency: clean the dependency vulnerabilities first (nothing else depends on
them, highest severity), then CI hardening (SHA-pinning + a now-clean blocking audit gate), then
coverage (raise threshold, close real gaps), then Codecov (needs the coverage reporters already
correct), then badges and the docs pass (last, since they describe the end state of everything
above).

**Tech Stack:** pnpm workspace overrides, GitHub Actions (SHA-pinned, Dependabot-maintained),
Vitest v8 coverage + JUnit reporters, `@codecov/vite-plugin`, `codecov/codecov-action`,
`codecov/test-results-action`.

## Global Constraints

- No `as any`, `as unknown as`, or `eslint-disable` comments anywhere (repo-wide, from
  `~/.claude/CLAUDE.md` and this repo's `CLAUDE.md`).
- `pnpm lint` runs at `--max-warnings 0`.
- `pnpm knip` fails on unused exports — remove or wire up anything it flags before a task is done.
- Coverage thresholds only ever go up in this plan, never down.
- Conventional Commits (`type(scope): description`, imperative, ≤72 chars, no period, no AI
  mentions in the message).
- CI gates to run before any task is considered done:
  `pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage && pnpm knip && pnpm spell`.
- The `beans` CLI binary must be on `PATH` for `apps/server` integration tests
  (`go install github.com/hmans/beans@v0.4.2`).

---

### Task 1: Fix transitive dependency vulnerabilities

**Files:**
- Modify: `package.json` (root)
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml` (regenerated, not hand-edited)

**Interfaces:**
- Produces: a `pnpm audit --audit-level moderate` run reporting zero findings for the four
  advisories below. Task 4 depends on this being true before it flips the CI `audit` job from
  advisory to blocking.

Current findings from `pnpm audit --audit-level moderate` (re-run this yourself first — do not
trust these as still-current without checking, only as the starting point):

| Severity | Package | Vulnerable | Patched | Path |
| --- | --- | --- | --- | --- |
| high | `fast-uri` | `>=3.0.0 <=3.1.3` | `>=3.1.4` | `.>@commitlint/cli>@commitlint/load>@commitlint/config-validator>ajv>fast-uri` |
| high | `postcss` | `<=8.5.17` | `>=8.5.18` | `apps__web>vite>postcss` |
| high | `brace-expansion` | `<=5.0.7` | `>=5.0.8` | `.>eslint>minimatch>brace-expansion` |
| moderate | `lodash` | `<=4.17.23` | `>=4.18.0` | `apps__web>@graphql-codegen/cli>@graphql-codegen/plugin-helpers>lodash` |

All four are transitive — none of `fast-uri`, `postcss`, `brace-expansion`, or `lodash` are direct
dependencies anywhere in this repo. Currently-resolved direct-parent versions (from
`pnpm-lock.yaml`, at plan-writing time): `@commitlint/cli@19.8.1`, `vite@6.4.3`, `eslint@10.7.0`,
`@graphql-codegen/cli@5.0.7` — all already near the top of their declared `^` range, so a
same-major `pnpm update` may not be enough on its own; be ready to reach for `pnpm.overrides`.

- [ ] **Step 1: Confirm the current findings**

```bash
pnpm audit --audit-level moderate
```

Expected: the four findings above (or whatever `pnpm audit` currently reports — record what you
actually see before starting, since upstream advisories can change between plan-writing and
implementation).

- [ ] **Step 2: Try a direct-dependency update first, per advisory**

For each of the four, attempt the least invasive fix first:

```bash
pnpm update eslint --latest
pnpm update vite --filter @beans-frontend/web --latest
pnpm update @commitlint/cli @commitlint/config-conventional --latest
pnpm update @graphql-codegen/cli --filter @beans-frontend/web --latest
pnpm audit --audit-level moderate
```

- [ ] **Step 3: For any advisory still present, pin the transitive package directly**

If a direct-dependency update doesn't move the transitive resolution (pnpm's deduplication can
keep an older compatible version pinned even when a newer one is allowed by the parent's own
range), add a `pnpm.overrides` entry in the root `package.json`, next to the existing top-level
keys (after `"prettier"`):

```json
  "pnpm": {
    "overrides": {
      "fast-uri": ">=3.1.4",
      "postcss": ">=8.5.18",
      "brace-expansion": ">=5.0.8",
      "lodash": ">=4.18.0"
    }
  }
```

Only include entries for advisories that Step 2 didn't already resolve — an override on a package
Step 2 already fixed is dead weight `knip`/lint won't catch (it's a `package.json` field, not
code), but it's still unnecessary. Then:

```bash
pnpm install
pnpm audit --audit-level moderate
```

Expected: zero findings for these four packages (a full zero-finding audit isn't required yet —
`@hono/node-server` is fixed separately in Task 2).

- [ ] **Step 4: Run the full gate suite**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage && pnpm knip && pnpm spell
```

Expected: all green. A `vite`/`eslint`/`@commitlint`/`@graphql-codegen` bump is a dev-tooling
change — if `lint` or `format` newly fail because a linter/formatter version changed its rules,
fix the flagged code, don't downgrade back to the vulnerable version.

- [ ] **Step 5: Commit**

```bash
git add package.json apps/web/package.json pnpm-lock.yaml
git commit -m "fix: resolve transitive dependency vulnerabilities"
```

---

### Task 2: Bump @hono/node-server to fix the static-file path-traversal CVE

**Files:**
- Modify: `apps/server/package.json:20`
- Modify: `apps/server/src/index.ts` (only if the `serve()` call signature changed)
- Modify: `apps/server/src/routes/static.ts` (only if the `serveStatic()` call signature changed)
- Modify: `pnpm-lock.yaml` (regenerated)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `pnpm audit --audit-level moderate` reports zero findings for `@hono/node-server`.
  Combined with Task 1, this means the full audit is clean before Task 4 flips the CI gate.

`@hono/node-server` is a **direct runtime dependency** (`apps/server/package.json:20`, currently
`^1.13.0`) with a moderate advisory — GHSA-frvp-7c67-39w9, path traversal in `serve-static` on
Windows via an encoded backslash (`%5C`) — fixed at `>=2.0.5`. Usage is exactly two call sites:

```ts
// apps/server/src/index.ts:1
import { serve } from "@hono/node-server";
// ...
const server = serve({ fetch: app.fetch, hostname: env.HOST, port: env.PORT }, (info) =>
  console.log(`beans-frontend server on http://${env.HOST}:${info.port}`),
);
```

```ts
// apps/server/src/routes/static.ts
import { serveStatic } from "@hono/node-server/serve-static";

export function registerStatic(app: Hono, webDist: string): void {
  app.use("/*", serveStatic({ root: webDist }));
  app.get("/*", serveStatic({ path: "index.html", root: webDist }));
}
```

- [ ] **Step 1: Bump the dependency**

```bash
pnpm update @hono/node-server --filter @beans-frontend/server --latest
```

- [ ] **Step 2: Confirm the advisory is gone**

```bash
pnpm audit --audit-level moderate
```

Expected: no `@hono/node-server` finding.

- [ ] **Step 3: Run the server test suite and check for breakage**

```bash
pnpm --filter @beans-frontend/server typecheck
pnpm --filter @beans-frontend/server test:coverage
```

If `typecheck` fails on the `serve(...)` or `serveStatic(...)` call sites, read
`@hono/node-server`'s CHANGELOG for the 2.0 major (installed at
`node_modules/@hono/node-server/CHANGELOG.md` after the bump) and adjust the two call sites above
to match the new signature — do not silence the type error with a cast.

- [ ] **Step 4: Manually verify static serving and the SSE endpoint still work**

```bash
GIT_ROOT=/tmp/hono-bump-check PORT=4799 pnpm --filter @beans-frontend/server dev &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4799/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4799/api/projects
kill %1
```

Expected: both return `200`.

- [ ] **Step 5: Run the full gate suite**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage && pnpm knip && pnpm spell
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/package.json apps/server/src/index.ts apps/server/src/routes/static.ts pnpm-lock.yaml
git commit -m "fix(server): bump @hono/node-server to patch path traversal CVE"
```

---

### Task 3: Write the security audit findings doc

**Files:**
- Create: `docs/SECURITY.md`

**Interfaces:**
- Consumes: the fixed-and-verified state from Tasks 1-2 (this doc reports on their outcome, not
  something to redo).
- Produces: `docs/SECURITY.md`, referenced by Task 10's README/docs pass and by GitHub's own
  community-health-file convention (a `SECURITY.md` at repo root or `docs/` surfaces a "Security
  policy" link on the repo's main page).

The manual review this task documents was scoped to this app's actual attack surface (not a
line-by-line audit — see the design spec, section 1) and was already performed once during
planning; this task is to **independently re-verify each claim below against the current code**
(don't just transcribe it — confirm it's still true) and write it up.

**Path traversal — verify these three points hold:**

1. `apps/server/src/discovery/scan.ts` has an `assertWithinRoot(root, candidate)` guard
   (`resolve`s both paths, throws if the candidate isn't the root or under it).
2. The one place a per-project filesystem path is built from a client-supplied identifier —
   `apps/server/src/routes/graphql.ts:27` — calls it:
   `const configPath = join(assertWithinRoot(deps.root, project.path), ".beans.yml");`
   — and `project` itself comes from `(await deps.listProjects()).find((p) => p.name === name)`
   (`graphql.ts:16`), i.e. the client supplies a `name` string used only as a lookup key against
   the server's own discovered-project list, never a raw path.
3. Static file serving (`apps/server/src/routes/static.ts`) relies on `@hono/node-server`'s own
   `serveStatic` traversal guard — which is exactly what Task 2's version bump patches
   (GHSA-frvp-7c67-39w9). Confirm the bump landed and the advisory is gone from `pnpm audit`.

**Command injection — verify:**

`apps/server/src/beans/executor.ts` calls `execFile` (imported from `node:child_process`), not
`exec` — `execFile` does not spawn a shell, so argv elements can't be reinterpreted as shell
syntax. Confirm `buildBeansArgs` (`executor.ts:24-29`) builds an argv array (`["graphql", "--json",
"--config", opts.configPath, ...]`) rather than a concatenated string, and that
`runBeansGraphql` (`executor.ts:53-64`) passes that array straight to `execFileAsync` without any
string interpolation.

**No-auth posture — document, don't fix:**

`apps/server/src/env.ts` shows no authentication layer exists, and the server binds to `127.0.0.1`
by default — but `HOST` is operator-configurable via env var. State this as an accepted design
constraint for a local-first, single-user tool, with an explicit warning: setting `HOST` to a
non-loopback address exposes the API (including arbitrary-path GraphQL queries scoped to whatever
`GIT_ROOT` was configured) to anything that can reach that address, with no access control.

- [ ] **Step 1: Verify each claim above against the current code**

Read the four files cited (`scan.ts`, `graphql.ts`, `executor.ts`, `env.ts`) and confirm each
claim. If anything has changed since this was written (e.g. a new route now builds a path from
client input without the `assertWithinRoot` guard), that's a real finding — fix it (write a
failing test first, then the fix) before writing the doc, don't just document the gap.

- [ ] **Step 2: Write `docs/SECURITY.md`**

```markdown
# Security

## Reporting a vulnerability

Open a GitHub issue, or contact the maintainer directly for anything you'd rather not post
publicly.

## Audit scope and findings (2026-07-31)

This covers the app's actual attack surface — path traversal, command injection, and the
authentication model — not a line-by-line review of every file.

### Dependency vulnerabilities

`pnpm audit --audit-level moderate` is run on every CI build (`.github/workflows/ci.yml`) and
blocks merges. All findings known at the time of this audit were fixed:

- `fast-uri`, `postcss`, `brace-expansion`, `lodash` — transitive, resolved by updating their
  direct parent dependencies (or a `pnpm.overrides` pin where the parent's own resolution didn't
  move far enough).
- `@hono/node-server` — direct dependency, bumped 1.x → 2.x to fix a path-traversal advisory in
  `serve-static` (GHSA-frvp-7c67-39w9).

### Path traversal

Every filesystem path built from a client-supplied value goes through
`assertWithinRoot()` (`apps/server/src/discovery/scan.ts`), which resolves both the configured
root and the candidate path and throws if the candidate isn't the root or under it. The one route
that builds a per-project path from client input (`POST /api/projects/:name/graphql`) looks the
project up by name against the server's own discovered-project list first — the client never
supplies a raw filesystem path. Static file serving relies on `@hono/node-server`'s own traversal
guard, patched as above.

### Command injection

The `beans` CLI is invoked via `execFile` (`apps/server/src/beans/executor.ts`), which does not
spawn a shell — arguments are passed as an array and can't be reinterpreted as shell syntax, even
when they contain a user-supplied GraphQL query or variables.

### No authentication

`beans-frontend` has no authentication or authorization layer. It's a local-first, single-user
tool intended to run on `127.0.0.1` — the default `HOST` binding. **Setting `HOST` to a
non-loopback address exposes the API, with no access control, to anything that can reach it.**
Don't do this outside a trusted, isolated network.
```

Adjust dates/wording to match what you actually verified, don't paste this verbatim without
confirming it's still accurate.

- [ ] **Step 3: Commit**

```bash
git add docs/SECURITY.md
git commit -m "docs: add security audit findings and disclosure policy"
```

---

### Task 4: SHA-pin CI actions, add Dependabot, make the audit gate blocking

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`

**Interfaces:**
- Consumes: Tasks 1-2's clean `pnpm audit` (the audit job can't become blocking on a still-red
  check).
- Produces: every action pinned to a commit SHA with a version comment; Task 7 adds two more
  actions to this same file and must follow the same pinned-with-comment pattern.

Current SHAs for the actions already in `ci.yml` (resolved via `gh api
repos/<owner>/<repo>/git/refs/tags/<tag>` against each action's currently-pinned major tag — same
functional version, just pinned instead of floating; letting Dependabot handle future major
version bumps incrementally is safer than jumping several majors in one hardening change):

| Action | Tag | SHA |
| --- | --- | --- |
| `actions/checkout` | `v4` | `11d5960a326750d5838078e36cf38b85af677262` |
| `pnpm/action-setup` | `v4` | `b906affcce14559ad1aafd4ab0e942779e9f58b1` |
| `actions/setup-node` | `v4` | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| `actions/setup-go` | `v5` | `40f1582b2485089dde7abd97c1529aa768e1baff` |
| `actions/upload-artifact` | `v4` | `ea165f8d65b6e75b540449e92b4886f43607fa02` |

Re-verify each SHA yourself before using it — don't trust a table in a planning doc over the
actual API response:

```bash
gh api repos/actions/checkout/git/refs/tags/v4 --jq '.object'
```

(If `.object.type` is `"tag"` rather than `"commit"`, it's an annotated tag — resolve one more
level: `gh api repos/actions/checkout/git/tags/<that sha>' --jq '.object.sha'`.)

- [ ] **Step 1: Pin every action in `ci.yml` to its SHA, with a version comment**

For every `uses: <action>@<tag>` line in `.github/workflows/ci.yml` (there are 5 distinct actions,
used across 6 jobs — `lint`, `audit`, `typecheck`, `test`, `build`, `quality`), replace it with the
pinned form, e.g.:

```yaml
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
```

Apply the same pattern to every occurrence of each action (do not miss the ones repeated across
jobs — `actions/checkout` and `pnpm/action-setup` and `actions/setup-node` each appear 6 times).

- [ ] **Step 2: Remove `continue-on-error: true` from the `audit` job**

```yaml
  audit:
    name: Audit
    runs-on: ubuntu-latest
    steps:
```

(Delete the `continue-on-error: true` line and its preceding comment — the comment described why
it was advisory-only, which no longer applies once it's blocking.)

- [ ] **Step 3: Add `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

This is what keeps the SHA pins from going stale — Dependabot opens a PR bumping both the SHA and
the version comment whenever a pinned action releases.

- [ ] **Step 4: Verify the workflow YAML is still valid**

```bash
gh workflow view ci.yml 2>&1 || true
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
python3 -c "import yaml; yaml.safe_load(open('.github/dependabot.yml'))"
```

Expected: no YAML parse errors. (The `gh workflow view` call may report the workflow isn't
registered yet if this is a new branch — that's fine, the YAML-parse check is what matters here.)

- [ ] **Step 5: Push and confirm on a real CI run**

This task's real test is a CI run, not something you can verify by running commands locally —
after pushing, check that every job (including the now-blocking `audit`) resolves the pinned SHAs
to the intended action versions and passes. If your workflow doesn't run CI checks until a PR
exists, note that this step's verification happens as part of Task 11.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml .github/dependabot.yml
git commit -m "ci: pin actions to SHA digests, add Dependabot, block on audit"
```

---

### Task 5: Close apps/server branch coverage to 90%

**Files:**
- Modify: `apps/server/vitest.config.ts:29-32`
- Modify: `apps/server/src/routes/events.test.ts`
- Modify: `apps/server/src/beans/executor.test.ts`
- Modify: `apps/server/src/discovery/scan.test.ts`
- Modify: `apps/server/src/routes/graphql.test.ts`

**Interfaces:**
- Produces: `apps/server`'s four coverage metrics all ≥90%, thresholds raised to match.

Current gap (from `pnpm --filter @beans-frontend/server test:coverage` — branch coverage is the
only metric below 90%, at 85.71%; re-run this yourself, the exact numbers may have shifted since
Tasks 1-4 touched this package):

| File | % Branch | Uncovered lines |
| --- | --- | --- |
| `src/beans/executor.ts` | 66.66% | 49-50 |
| `src/discovery/scan.ts` | 95.23% | 72 |
| `src/routes/events.ts` | 0% | 18, 25-29 |
| `src/routes/graphql.ts` | 83.33% | 34 |

`events.ts` is the real gap (0% branch coverage on an SSE stream handler) — worked example below.
The other three are single-branch gaps closeable the same way: read the uncovered line, find the
input/condition that reaches the untaken branch, write one test for it.

- [ ] **Step 1: Write the failing test for `events.ts`'s uncovered branches**

`events.ts:14-19` drops the watcher listener when a write fails mid-stream; `events.ts:23-31` is
the heartbeat loop, never exercised because the existing test never advances past one write. Add
to `apps/server/src/routes/events.test.ts`:

```ts
  it("drops the watcher listener when a write fails after the client goes away", async () => {
    vi.useFakeTimers();
    const watcher = new EventEmitter();
    const app = createApp(deps(watcher));
    const controller = new AbortController();

    const res = await app.request("/api/events", { signal: controller.signal });
    const reader = res.body?.getReader();
    if (!reader) throw new Error("expected a readable body");

    // Consume the connection open, then simulate the client disappearing by
    // cancelling the reader before the next write — the underlying stream
    // write then rejects, which is the branch under test.
    await reader.cancel();
    watcher.emit("event", { project: "proj-a", kind: "change" });
    await vi.waitFor(() => expect(watcher.listenerCount("event")).toBe(0));
  });

  it("sends a heartbeat ping and keeps the connection open", async () => {
    vi.useFakeTimers();
    const watcher = new EventEmitter();
    const app = createApp(deps(watcher));
    const controller = new AbortController();

    const res = await app.request("/api/events", { signal: controller.signal });
    const reader = res.body?.getReader();
    if (!reader) throw new Error("expected a readable body");

    await vi.advanceTimersByTimeAsync(25_000);
    const { value, done } = await reader.read();

    expect(done).toBe(false);
    const chunk = new TextDecoder().decode(value);
    expect(chunk).toBe("event: ping\ndata: \n\n");

    controller.abort();
    await reader.cancel();
  });
```

- [ ] **Step 2: Run and confirm both new tests fail against current code, for the right reason**

```bash
pnpm --filter @beans-frontend/server exec vitest run src/routes/events.test.ts
```

Expected: both new tests fail (the listener-count assertion times out, or the heartbeat read
never resolves within the timers) — confirming they actually exercise the previously-dead code,
not that they're trivially passing regardless.

- [ ] **Step 3: Confirm both pass**

Re-run the same command. If the heartbeat test hangs, check that `vi.useFakeTimers()` is active
before the request is made (fake timers must be installed before `stream.sleep` is first called).

- [ ] **Step 4: Close the remaining three single-branch gaps**

For each, follow the same pattern — read the uncovered line, identify what input reaches the
untaken side of the branch, add one test, confirm it fails against the pre-fix code then passes:

- `executor.ts:49-50` — `extractBeansErrorMessage`'s fallback when `stderr` doesn't match
  `ERROR_LINE`: add a test in `executor.test.ts` where `execFileAsync` rejects with an error
  object whose `.message` is a string but whose `.stderr` doesn't match `Error: ...`, asserting
  the thrown `BeansError`'s message equals that `.message`.
- `scan.ts:72` — the `false` branch of `if (OPEN_STATUSES.includes(b.status))`: add a
  closed-status bean (e.g. `status: "completed"`) to the fixture used by the ordering test (or a
  new small test) in `scan.test.ts`, and assert `counts.open`/`counts.openByType` don't count it
  while `counts.total`/`counts.byStatus` do.
- `graphql.ts:34` — the `err instanceof BeansError` `false` branch in the route's catch block: add
  a test in `graphql.test.ts` where `deps.runGraphql` rejects with a plain `Error` (not
  `BeansError`), asserting the route re-throws it (Hono's error handler turns it into a 500) rather
  than returning the 400 JSON error-message shape.

- [ ] **Step 5: Raise the coverage thresholds**

```ts
// apps/server/vitest.config.ts:29-32
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
```

- [ ] **Step 6: Run coverage and confirm all four metrics pass 90%**

```bash
pnpm --filter @beans-frontend/server test:coverage
```

- [ ] **Step 7: Commit**

```bash
git add apps/server/vitest.config.ts apps/server/src/routes/events.test.ts apps/server/src/beans/executor.test.ts apps/server/src/discovery/scan.test.ts apps/server/src/routes/graphql.test.ts
git commit -m "test(server): close branch coverage gaps, raise threshold to 90%"
```

---

### Task 6: Close apps/web branch coverage to 90%

**Files:**
- Modify: `apps/web/vitest.config.ts:28-31`
- Modify: `apps/web/src/components/ConfirmDialog.test.tsx`
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/routes/search.tsx`
- Modify: `apps/web/src/routes/search.test.tsx`
- Others as needed per Step 4's table (see below)

**Interfaces:**
- Produces: `apps/web`'s four coverage metrics all ≥90%, thresholds raised to match.

Current gap (from `pnpm --filter @beans-frontend/web test:coverage` — branch coverage is the only
metric below 90%, at 85.71%; re-run this yourself, exact numbers may have shifted):

| File | % Branch | Uncovered lines |
| --- | --- | --- |
| `src/components/ConfirmDialog.tsx` | 28.57% | 45-66 |
| `src/routes/beanDetail.tsx` | 75.36% | scattered (~10 lines) |
| `src/components/Charts.tsx` | 50% | 106-126 |
| `src/routes/projectList.tsx` | 88.29% | 148-149, 204, 215 |
| `src/components/FilterBar.tsx` | 75% | 51, 66-72 |
| `src/components/RelationEditor.tsx` | 100%* | 63, 97, 122-133 (function/line gaps, not branch — lower priority) |
| `src/components/CreateBeanForm.tsx` | 76.47% | 72, 169-171 |
| `src/components/BeanPicker.tsx` | 85.71% | 81, 83, 90 |
| `src/hooks/useMutations.ts` | 80% | 212-214 |
| `src/components/CheckboxMenu.tsx` | 87.5% | 25 |
| `src/hooks/useEvents.ts` | 94.44% | 23 |
| `src/routes/overview.tsx` | 91.66% | 12 |
| `src/api/client.ts` | 75% | 4 |
| `src/router.tsx` | 0%* | 13, 46 (router bootstrap, likely excludable — see Step 5) |

`ConfirmDialog.tsx` is the real gap and the worked example below — its keyboard-navigation focus
trap (Escape closes, Tab/Shift+Tab wraps between the first and last button) is entirely untested.
Everything else in the table is 1-3 line gaps, closeable the same systematic way Task 5 used for
`apps/server`: read the line, find the input that reaches it, write one test.

- [ ] **Step 1: Write the failing tests for `ConfirmDialog.tsx`'s keyboard navigation**

`ConfirmDialog.tsx:44-68` (`handleKeyDown`) closes on Escape and wraps Tab focus between the first
and last button. Add to `apps/web/src/components/ConfirmDialog.test.tsx`:

```tsx
  it("closes via onCancel when Escape is pressed", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog open title="Delete?" onConfirm={vi.fn()} onCancel={onCancel} />);

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalled();
  });

  it("wraps focus from the last button to the first on Tab", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog open title="Delete?" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    const cancelButton = screen.getByRole("button", { name: "Confirm" });
    // Confirm's default label renders as "Confirm"; it's the last button.
    cancelButton.focus();
    await user.tab();

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("wraps focus from the first button to the last on Shift+Tab", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog open title="Delete?" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    screen.getByRole("button", { name: "Cancel" }).focus();
    await user.tab({ shift: true });

    expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();
  });
```

- [ ] **Step 2: Confirm all three fail against current code**

```bash
pnpm --filter @beans-frontend/web exec vitest run src/components/ConfirmDialog.test.tsx
```

Expected: the Escape test fails (`onCancel` never called — `handleKeyDown` is wired via
`onKeyDown` on the dialog `div`, but nothing in the current tests presses a key), and both Tab
tests fail (focus doesn't move without the wrap logic running — if they pass trivially, the test
isn't exercising the wrap branch; check focus is actually starting on the button you set it on).

- [ ] **Step 3: Confirm all three pass**

```bash
pnpm --filter @beans-frontend/web exec vitest run src/components/ConfirmDialog.test.tsx
```

- [ ] **Step 4: Close the remaining gaps from the table above**

Same method as Task 5 Step 4 — for each file/line range, read the code, identify the untaken
branch's triggering condition, add one focused test, confirm red then green. Work through the
table roughly in size order (largest uncovered range first): `beanDetail.tsx`, `Charts.tsx`,
`FilterBar.tsx`, `CreateBeanForm.tsx`, `BeanPicker.tsx`, `projectList.tsx`, `useMutations.ts`,
`CheckboxMenu.tsx`, `useEvents.ts`, `overview.tsx`, `client.ts`.

- [ ] **Step 5: Extract and test `router.tsx`'s one real branch, exclude the rest**

`src/router.tsx` is at 0% branch coverage on two lines. Line 13 is the `lazy()` resolver callback
for the code-split analytics route (`.then((m) => ({ default: m.AnalyticsPage }))`) — genuinely
untestable without a real lazy-loading harness, the same class of gap as the existing
`src/index.ts` server-bootstrap exclusion. Line 46 is real logic: the search route's
`validateSearch` (`typeof search.q === "string" ? search.q : ""`), currently defined inline and
untestable in isolation because nothing exports it.

Extract it, mirroring how `validateProjectSearch` already lives beside its route component in
`apps/web/src/routes/projectList.tsx` rather than inline in `router.tsx`:

```tsx
// apps/web/src/routes/search.tsx — add near the top, exported
export function validateSearchPageSearch(search: Record<string, unknown>): { q: string } {
  return { q: typeof search.q === "string" ? search.q : "" };
}
```

```tsx
// apps/web/src/router.tsx — replace the inline validateSearch (line ~46) with:
import { SearchPage, validateSearchPageSearch } from "./routes/search.js";
// ...
const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  validateSearch: validateSearchPageSearch,
  component: SearchPage,
});
```

Add to `apps/web/src/routes/search.test.tsx`:

```tsx
describe("validateSearchPageSearch", () => {
  it("keeps a string q value", () => {
    expect(validateSearchPageSearch({ q: "chocolate" })).toEqual({ q: "chocolate" });
  });

  it("defaults non-string or missing q to an empty string", () => {
    expect(validateSearchPageSearch({ q: 123 })).toEqual({ q: "" });
    expect(validateSearchPageSearch({})).toEqual({ q: "" });
  });
});
```

Then exclude the one remaining, genuinely-untestable line in `apps/web/vitest.config.ts`'s
`coverage.exclude` — not the whole file:

```ts
      exclude: [
        // ...existing entries...
        "src/router.tsx", // route tree + lazy-load wiring, exercised at runtime, not unit-testable
      ],
```

(Excluding the whole file rather than just line 13 is the pragmatic choice here — Vitest's v8
coverage provider excludes by file, not line ranges, and after extracting `validateSearchPageSearch`
the only thing left in `router.tsx` is route-tree wiring and the lazy-load resolver, both bootstrap
code in the same spirit as the existing `src/main.tsx` exclusion.)

- [ ] **Step 6: Raise the coverage thresholds**

```ts
// apps/web/vitest.config.ts:28-31
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
```

- [ ] **Step 7: Run coverage and confirm all four metrics pass 90%**

```bash
pnpm --filter @beans-frontend/web test:coverage
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/src
git commit -m "test(web): close branch coverage gaps, raise threshold to 90%"
```

---

### Task 7: Add Codecov coverage upload and test analytics to CI

**Files:**
- Modify: `apps/server/vitest.config.ts` (add `reporters`/`outputFile`)
- Modify: `apps/web/vitest.config.ts` (add `reporters`/`outputFile`)
- Modify: `packages/shared/vitest.config.ts` (add `reporters`/`outputFile`)
- Modify: `.github/workflows/ci.yml` (the `test` job)

**Interfaces:**
- Consumes: Tasks 5-6's coverage state (uploads real, already-passing coverage — this task doesn't
  change what's tested, only where the results go) and Task 4's SHA-pinning convention (new
  actions added here must follow the same pinned-with-comment pattern).
- Produces: coverage and test-result data visible on codecov.io for this repo, which Task 9's
  badges point at.

Current SHAs for the two new actions (re-verify before using, same as Task 4):

| Action | Tag (latest) | SHA |
| --- | --- | --- |
| `codecov/codecov-action` | `v7` | `fb8b3582c8e4def4969c97caa2f19720cb33a72f` |
| `codecov/test-results-action` | `v1` | `0fa95f0e1eeaafde2c782583b36b28ad0d8c77d3` |

(`codecov/codecov-action`'s current major is v7, not v5 — verify this yourself with
`gh api repos/codecov/codecov-action/tags --jq '.[].name'` rather than trusting a cached
recollection of "v5 is current," which was already stale by the time this plan was written.)

- [ ] **Step 1: Add a JUnit reporter to all three `vitest.config.ts` files**

```ts
// apps/server/vitest.config.ts, apps/web/vitest.config.ts, packages/shared/vitest.config.ts
// inside `test: { ... }`, alongside the existing keys (e.g. after `hookTimeout`):
    reporters: ["default", "junit"],
    outputFile: { junit: "./test-report.junit.xml" },
```

- [ ] **Step 2: Confirm the JUnit report is produced locally**

```bash
pnpm --filter @beans-frontend/shared test
test -f packages/shared/test-report.junit.xml && echo "produced"
```

Expected: `produced`.

- [ ] **Step 3: Gitignore the generated report files**

Check `.gitignore` for a `coverage/` entry (it should already exclude coverage output) and add
`test-report.junit.xml` alongside it if not already covered by an existing pattern.

- [ ] **Step 4: Wire coverage and test-results upload into the `test` CI job**

In `.github/workflows/ci.yml`'s `test` job, after the existing "Run full test suite with coverage"
step and before (or instead of, structured however fits) the existing "Upload coverage report"
artifact step, add:

```yaml
      - name: Upload coverage to Codecov
        if: always()
        uses: codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f # v7
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./packages/shared/coverage/lcov.info,./apps/server/coverage/lcov.info,./apps/web/coverage/lcov.info
          flags: shared,server,web
          fail_ci_if_error: false

      - name: Upload test results to Codecov
        if: ${{ !cancelled() }}
        uses: codecov/test-results-action@0fa95f0e1eeaafde2c782583b36b28ad0d8c77d3 # v1
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./packages/shared/test-report.junit.xml,./apps/server/test-report.junit.xml,./apps/web/test-report.junit.xml
```

`flags:` as a single comma-joined string maps positionally to `files:`'s comma-joined list — check
`codecov-action@v7`'s current README for whether flags need to be per-file (an object/YAML list)
rather than one flat string; the exact `with:` shape may differ from v5-era examples you find
while researching, since the action's inputs can change between majors. Verify against the
installed action's own docs, not older cached examples.

- [ ] **Step 5: Verify the workflow YAML is still valid**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

- [ ] **Step 6: Push and confirm on a real CI run**

Same as Task 4 Step 5 — this task's real test is a CI run that successfully uploads to codecov.io
and shows up on the repo's Codecov dashboard. Confirm as part of Task 11 if your workflow doesn't
run CI until a PR exists.

- [ ] **Step 7: Commit**

```bash
git add apps/server/vitest.config.ts apps/web/vitest.config.ts packages/shared/vitest.config.ts .github/workflows/ci.yml .gitignore
git commit -m "ci: upload coverage and test results to Codecov"
```

---

### Task 8: Add Codecov bundle analysis to apps/web

**Files:**
- Modify: `apps/web/package.json` (new devDependency)
- Modify: `apps/web/vite.config.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: bundle-size data visible on codecov.io for `apps/web`'s production build, uploaded
  automatically whenever `CODECOV_TOKEN` is set at build time (already true in CI via the existing
  secret; local builds without the token silently skip it).

- [ ] **Step 1: Install `@codecov/vite-plugin`**

```bash
pnpm add -D @codecov/vite-plugin --filter @beans-frontend/web
```

- [ ] **Step 2: Confirm this didn't reintroduce an audit finding**

```bash
pnpm audit --audit-level moderate
```

Task 4 made this a blocking CI gate — a new devDependency here is exactly the kind of change that
could silently break it. If a new finding appears, resolve it the same way Task 1 did (direct
update first, `pnpm.overrides` if that's not enough) before moving on.

- [ ] **Step 3: Wire the plugin into `vite.config.ts`**

```ts
// apps/web/vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { codecovVitePlugin } from "@codecov/vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    codecovVitePlugin({
      enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
      bundleName: "beans-frontend-web",
      uploadToken: process.env.CODECOV_TOKEN,
    }),
  ],
  server: { proxy: { "/api": "http://localhost:4780" } },
});
```

- [ ] **Step 4: Confirm a build without the token still succeeds (plugin no-ops)**

```bash
unset CODECOV_TOKEN
pnpm --filter @beans-frontend/web build
```

Expected: build succeeds, no bundle-analysis upload attempted (nothing in the build output
mentions Codecov).

- [ ] **Step 5: Confirm a build with the token attempts an upload**

```bash
CODECOV_TOKEN=dummy-token-for-local-check pnpm --filter @beans-frontend/web build 2>&1 | tail -20
```

Expected: the build still succeeds (a bad token fails the *upload*, not the build — confirm the
plugin doesn't hard-fail the whole `vite build` on an upload error, since that would break every
production build whenever Codecov is briefly unreachable). If it does hard-fail, check the
plugin's options for a way to make upload failures non-fatal, and use it.

- [ ] **Step 6: Run the full gate suite**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage && pnpm knip && pnpm spell
```

(`knip` may flag `@codecov/vite-plugin` as unused if it only detects usage via runtime
`import()` patterns it doesn't recognize — confirm it's picked up as used via the static
`import { codecovVitePlugin }` in `vite.config.ts`; if `knip` still flags it, check `knip`'s config
for whether `vite.config.ts` is in its analyzed entry points.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/vite.config.ts pnpm-lock.yaml
git commit -m "feat(web): add Codecov bundle analysis"
```

---

### Task 9: Add README badges

**Files:**
- Modify: `README.md:1-2`

**Interfaces:**
- Consumes: Task 7 (coverage badge needs the Codecov project to exist and have received at least
  one upload — badge images degrade gracefully to "unknown" before that, so this can be written
  before Task 7's CI run completes, but won't render meaningfully until it has).

- [ ] **Step 1: Add the badge row directly under the title**

```markdown
# beans-frontend

[![CI](https://github.com/ThePrismSystem/beans-frontend/actions/workflows/ci.yml/badge.svg)](https://github.com/ThePrismSystem/beans-frontend/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/ThePrismSystem/beans-frontend/graph/badge.svg?token=N7I7FNHSIO)](https://codecov.io/gh/ThePrismSystem/beans-frontend)
[![TypeScript: strict](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.base.json)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](.nvmrc)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A web UI for [`beans`](https://github.com/hmans/beans) — the local-first, Markdown-backed issue
tracker. ...
```

(Keep the rest of the paragraph after the title exactly as it is — only inserting the badge row
between the `# beans-frontend` heading and the existing first paragraph.)

- [ ] **Step 2: Confirm every badge URL is reachable**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://github.com/ThePrismSystem/beans-frontend/actions/workflows/ci.yml/badge.svg"
curl -s -o /dev/null -w "%{http_code}\n" "https://codecov.io/gh/ThePrismSystem/beans-frontend/graph/badge.svg?token=N7I7FNHSIO"
curl -s -o /dev/null -w "%{http_code}\n" "https://img.shields.io/badge/TypeScript-strict-3178c6"
```

Expected: `200` for each (shields.io badges are dynamically generated but still return 200 for a
well-formed URL).

- [ ] **Step 3: Run the formatting/lint/spell gates** (README is markdown, covered by `pnpm format`
  and `pnpm spell`, not `pnpm lint`)

```bash
pnpm format && pnpm spell
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add CI, coverage, and strict-TypeScript badges to README"
```

---

### Task 10: Docs pass — refresh README, ARCHITECTURE, CONTRIBUTING; document Codecov setup

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `CONTRIBUTING.md`

**Interfaces:**
- Consumes: the end state of Tasks 1-9 (this task documents what they built — do it last).

- [ ] **Step 1: Re-read `README.md` end to end and fix anything stale**

Specifically check: the `pnpm audit` mention (if any) now describes a blocking gate, not
advisory; setup/prerequisite steps still match `apps/server/src/env.ts` and `.nvmrc`; any
reference to coverage thresholds says 90%, not 80%.

- [ ] **Step 2: Re-read `docs/ARCHITECTURE.md` end to end and fix anything stale**

Check it against the current `.github/workflows/ci.yml` job list (`lint`, `audit`, `typecheck`,
`test`, `build`, `quality` — confirm the doc's description of CI, if any, matches these six jobs
and their current blocking/advisory status) and against the current dependency versions touched by
Tasks 1-2 if the doc names specific versions anywhere.

- [ ] **Step 3: Re-read `CONTRIBUTING.md` end to end and fix anything stale**

Confirm the gate-running instructions match the Global Constraints block at the top of this plan
(same six-command gate sequence) and that coverage guidance says 90%.

- [ ] **Step 4: Add a "Codecov setup" section to `docs/ARCHITECTURE.md`**

Document, concretely, what a future maintainer needs to know and can't recover by reading the CI
YAML alone: which secret (`CODECOV_TOKEN`) authenticates uploads, which env var
(`CODECOV_TOKEN`, same secret, exposed at build time) gates bundle analysis, what each `flags:`
value (`shared`/`server`/`web`) maps to in the Codecov UI, and that the badge in `README.md` uses
a separate, public graph token (not the upload secret) that's safe to embed directly in a public
file.

- [ ] **Step 5: Run the full gate suite**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage && pnpm knip && pnpm spell
```

- [ ] **Step 6: Commit**

```bash
git add README.md docs/ARCHITECTURE.md CONTRIBUTING.md
git commit -m "docs: refresh README, ARCHITECTURE, and CONTRIBUTING for this hardening pass"
```

---

### Task 11: Full-suite and CI verification

**Files:** none created; fixes applied wherever the checks land.

- [ ] **Step 1: Run every gate the CI workflow runs**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage && pnpm knip && pnpm spell
```

Expected: all green, including the raised 90% coverage thresholds from Tasks 5-6.

- [ ] **Step 2: Confirm the dependency audit is fully clean**

```bash
pnpm audit --audit-level moderate
```

Expected: zero findings (Tasks 1, 2, and 8's Step 2 should have already ensured this — this is
the final confirmation, not the first check).

- [ ] **Step 3: Push and confirm the real CI run is green end to end**

This is the task that closes out Task 4 Step 5, Task 7 Step 6, and Task 9 Step 2's real-CI
verification (each of those tasks could only partially self-verify locally). Confirm on the actual
GitHub Actions run: every job passes (including the now-blocking `audit`), every action resolves
its pinned SHA to the intended version (spot-check one or two in the run logs — the "Run
actions/checkout@..." log line shows the resolved action), the Codecov coverage and test-results
uploads succeed and show up on the repo's codecov.io dashboard, and the bundle-analysis upload
from Task 8 appears there too.

- [ ] **Step 4: Confirm the README badges render for real**

Once the CI run from Step 3 has completed and Codecov has processed the upload, reload
`README.md` on GitHub (or fetch each badge URL again) and confirm none of them show a broken-image
icon or an "unknown"/greyed-out state.

- [ ] **Step 5: Fix anything Steps 1-4 surface**

- `knip` flags something new — delete the dead export or wire up its consumer.
- Coverage regresses below 90% on a file Tasks 5-6 didn't touch — add the missing test, don't
  lower the threshold.
- A CI job fails that passed locally — read the full job log (not just the exit code) before
  guessing at a fix; CI environment differences (Go/beans install, `GITHUB_PATH` handling) are the
  first thing to check, per this repo's CLAUDE.md CI-triage guidance.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "test: close any remaining gaps from the hardening pass"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| Security audit — automated dependency fixes | 1, 2 |
| Security audit — manual review + findings doc | 3 |
| CI hardening — SHA-pinning, Dependabot, blocking audit | 4 |
| Coverage — raise to 90%, close real gaps | 5, 6 |
| Codecov — coverage + test analytics | 7 |
| Codecov — bundle analysis | 8 |
| README badges | 9 |
| Docs pass (README/ARCHITECTURE/CONTRIBUTING + Codecov docs) | 10 |
| Final verification | 11 |

No spec requirement is unassigned. The dedicated whole-codebase simplify sweep from the original
request is explicitly out of scope for this plan (spec 4, planned separately).

**Type consistency:** N/A in the usual sense — this plan touches config/YAML/docs/tests, not a
shared function-signature surface between tasks. The one real cross-task contract is `flags:`
naming (`shared`/`server`/`web`, fixed in Task 7, referenced again in Task 10's docs section) and
the coverage-threshold value (90, consistent across Tasks 5, 6, and referenced in Task 11's
verification and the Global Constraints block) — both checked consistent above.

**Staging:** Tasks 1-2 (dependency fixes) must land clean before Task 4 flips the audit gate to
blocking, or CI goes red on an intermediate commit for no reason. Tasks 5-6 (coverage) land before
Task 7 (Codecov upload) so the uploaded coverage reports reflect the raised thresholds, not the
80%-era baseline. Task 9 (badges) comes after Task 7 (what the coverage badge points at) but
doesn't strictly need Task 8 (bundle analysis has no README badge in this plan). Task 10 (docs)
and Task 11 (final verification) are last by design — they describe and confirm the end state of
everything before them.
