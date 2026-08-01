# Multi-Root Directory Scanning — Design

## Context

Second of four specs decomposed from "prepare beans-frontend for public
visibility," and the last to be brainstormed. Specs 1 (list stability +
orphans), 3 (public-release hardening), and 4 (whole-codebase simplify
sweep) are complete and merged into `main`. This spec closes the gap the
original request called "multi-directory scanning support."

## Current state

The server discovers `beans` projects by walking a single `GIT_ROOT`
directory (`apps/server/src/env.ts`, default `~/git`) up to `SCAN_DEPTH`
levels (`apps/server/src/discovery/scan.ts`), collecting every directory
that contains a `.beans.yml`. This already supports "one root directory
holding multiple repos" — the gap is supporting **multiple, independent
root directories** (e.g. `~/work` and `~/personal` and
`/mnt/drive/projects`), which the current single-`GIT_ROOT` model cannot
express.

`GIT_ROOT` also anchors a security invariant (`docs/ARCHITECTURE.md`'s "the
`GIT_ROOT` path jail"): `assertWithinRoot(root, candidate)`
(`apps/server/src/discovery/scan.ts`) rejects any resolved path outside the
configured root before it's used to build a `--config` argument or serve a
file. Every project path flows through this check before the server acts
on it.

A codebase survey (see below) found the blast radius is narrow: only
`env.ts`, `scan.ts`, `app.ts`, `index.ts`, and `routes/graphql.ts` need
changes. `apps/web` has zero root-path assumptions. `watcher.ts`,
`executor.ts`, and the aggregate routes (`search.ts`, `analytics.ts`,
`projects.ts`) already operate on the discovered `Project[]` — each project
already carries its own absolute `path` — so they're root-count-agnostic
already.

A related, pre-existing correctness gap surfaced during discovery:
project lookup by name (`deps.listProjects().find((p) => p.name === name)`
in `routes/graphql.ts`) assumes every discovered project has a unique
`name` (`basename(dir)`). A comment in `scan.ts`'s `discoverProjects`
already acknowledges same-named projects in different directories are
possible today with `SCAN_DEPTH > 1` — the existing sort just makes their
*order* deterministic, not their *identity* unambiguous. Multiple roots
make this collision meaningfully more likely (e.g. two different
employers' repos both named `frontend`), so this spec addresses it.

## Approach

Widen the existing `GIT_ROOT` env var to accept a comma-separated list of
paths, rather than introducing a second env var or a config file.

Rejected alternatives:
- **A separate `GIT_ROOTS` (plural) env var alongside `GIT_ROOT`** — adds a
  second variable and a "which one wins" precedence question with no
  corresponding benefit.
- **A config file replacing env-var configuration** — a materially bigger
  structural change (new config-loading mechanism, new file format,
  migration path) than this feature needs; diverges from the project's
  existing all-env-var, Docker-friendly configuration style for no clear
  gain today.

## Design

### A. Config & env schema

`apps/server/src/env.ts`'s `GIT_ROOT` field changes from a single-path
`z.string()` to a comma-separated list, parsed via `.transform()` into
`string[]`: split on `,`, trim each entry, `resolve()` each to an absolute
path. Default remains `resolve(homedir(), "git")` as a 1-element array —
existing single-root deployments need no config change. `SCAN_DEPTH` stays
a single value shared across every root (no per-root depth). The env var
name itself is unchanged (`GIT_ROOT`, documented as now accepting a
comma-separated list) — no rename, so `.env.example`, Docker docs, and
existing deployments only need to widen their *value*.

### B. Discovery (`scan.ts`)

`discoverProjects(roots: string[], maxDepth: number)` (was
`(root: string, maxDepth: number)`) runs `findProjectDirs` against every
root using the existing `mapWithConcurrency` pattern, tagging each found
directory with the root it came from. Results are merged and then:

1. **Deduped by resolved absolute path** (first occurrence wins) —
   protects against overlapping or nested root entries double-counting the
   same project directory.
2. **Name collisions resolved**: group the deduped list by `name`
   (`basename(dir)`, as today). Any group with more than one entry gets
   each member renamed to `` `${basename(owningRoot)}-${name}` ``. If that
   still collides (two roots that themselves share a basename — a
   pathological edge case), append a numeric suffix (`-2`, `-3`, …) in the
   existing stable sort order as a final tiebreak.
3. Final sort is unchanged: by `name`, then `path`, for deterministic
   output.

`packages/shared`'s `Project` type gains a `root: string` field — the
specific configured root this project was discovered under, set once at
discovery and never recomputed. This is what Section C's validation relies
on.

### C. Security validation (`app.ts`, `index.ts`, `routes/graphql.ts`)

`assertWithinRoot(root, candidate)`'s signature and internal logic are
**unchanged** — it still validates one candidate path against one root
path. What changes is what each call site passes as `root`: instead of the
single global root, every call site passes the specific `project.root` for
the project being acted on (already looked up from `deps.listProjects()`
before the `assertWithinRoot` call in `routes/graphql.ts`). This is
strictly more precise than checking membership against "any configured
root" — a project can only ever validate against the exact root it was
actually discovered under.

`AppDeps.root: string` becomes `AppDeps.roots: string[]`, used only by the
discovery step (`discoverProjects(deps.roots, env.SCAN_DEPTH)`) — not for
per-request path validation, since that responsibility moves to the
per-project `root` field.

### D. Testing & docs

- `scan.test.ts`: multi-root discovery across 2+ roots, path-based dedup
  when roots overlap/nest, both disambiguation tiers (root-basename
  prefix; numeric-suffix fallback for a residual collision).
- `env.test.ts`: comma-separated parsing, including a single-path value
  producing a 1-element array (backward compatibility).
- Existing `graphql.test.ts` / `index.integration.test.ts` cases
  referencing `deps.root` update to the new shape (`deps.roots` /
  `project.root`); no single-root-case behavior these tests assert on
  should change.
- `README.md` and `docs/ARCHITECTURE.md` (including the "`GIT_ROOT` path
  jail" section and the Docker bind-mount note) updated to describe the
  list format and the per-project validation model.
- 90% coverage threshold (all three `vitest.config.ts` files) holds
  throughout — no change to the bar itself.

## Out of scope

- Per-root `SCAN_DEPTH` overrides — every root shares one depth.
- A config file replacing env-var configuration.
- Any `apps/web` changes — the web app has no root-path assumptions and
  needs none for this feature.
- `watcher.ts` changes — it already matches events by project-path prefix,
  independent of root count.

## Testing

Standard project gates apply and must pass before this spec is considered
done: `pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage
&& pnpm knip && pnpm spell`. No new test infrastructure — this spec extends
existing Vitest suites in `apps/server`.
