# Architecture

## Overview

`beans-web` is a pnpm monorepo with three packages:

- **`apps/server`** is a small [Hono](https://hono.dev) API server that owns no data of its own.
  It discovers `beans` projects on disk and shells out to the `beans` CLI's GraphQL interface per
  project. On top of that it aggregates results across projects for search and analytics, and
  streams file-change events over Server-Sent Events (SSE). In production it also serves the built
  web app.
- **`apps/web`** is a React SPA (Vite + TanStack Router + TanStack Query) typed against the
  `beans` GraphQL schema.
- **`packages/shared`** holds bean type/status/priority enums, hierarchy validation rules, and the
  GraphQL operation strings the web app's mutations and queries use. Both apps consume it as
  TypeScript source (see [Why `tsx` in production](#why-tsx-in-production)).

## The server: thin passthrough + discovery + aggregation + SSE

The server holds no bean data itself. On startup and on each `/api/projects` request, it walks
every configured `GIT_ROOT` entry (`apps/server/src/discovery/scan.ts`) up to `SCAN_DEPTH`
levels looking for directories containing a `.beans.yml`; each one becomes a `Project` (name,
path, the specific root it was found under, prefix, and counts by type/status, read via
`beans`). Projects found under different roots (or nested/overlapping roots) are deduped by
resolved path; same-name collisions are resolved by qualifying the name with the owning root's
basename, falling back to a numeric suffix if that still collides.

Per-project GraphQL traffic is a **passthrough**: `POST /api/projects/:name/graphql` resolves the
project's `.beans.yml`, then spawns `beans graphql --json --config <path> <query>`
(`apps/server/src/beans/executor.ts`) and relays stdout back as the response body. The server
never parses or validates the GraphQL query itself; `beans` does, using the exact schema captured
in `apps/web/beans.schema.graphql` (regenerate with `beans graphql --schema` if `beans` is
upgraded and the schema drifts).

Two things the server *does* compute itself, by fanning a query out to every discovered project
and merging the results:

- **Global search** (`apps/server/src/aggregate/search.ts`, `GET /api/search`) queries each
  project for matching beans and flattens the results into one ranked list with the owning
  project attached.
- **Analytics** (`apps/server/src/aggregate/analytics.ts`, `GET /api/analytics`) returns
  per-project totals plus cross-project breakdowns by type/status and completions by month.

Live updates go out over SSE (`GET /api/events`, `apps/server/src/routes/events.ts`).
`BeansWatcher` (`apps/server/src/watch/watcher.ts`) uses `chokidar` to watch each project's
resolved data directory non-recursively — `.beans/` unless the project's `.beans.yml` moves it. It maps any add/change/unlink back to its owning project and
re-emits it as a `{ project, kind }` event, which the SSE route relays to every connected client. The web app's `useEvents` hook consumes this to invalidate its TanStack Query caches, so
edits made outside the browser (e.g. via the `beans` CLI or another tab) show up without a
manual refresh.

## The `GIT_ROOT` path jail

The configured `GIT_ROOT` directories are the only trees the server is allowed to touch. Every
project path used to build a `--config` argument or serve a file goes through
`assertWithinRoot(root, candidate)` (`apps/server/src/util/containment.ts`), which resolves both
paths and rejects the candidate when the first segment of its path relative to `root` is `..`.
That covers anything outside the root, whether it got there by symlink traversal or a crafted
`:name` route param. Comparing the first segment rather than testing the relative path with
`startsWith("..")` is deliberate: a directory legitimately named something like `..config` would
fail the naive check.

Each project validates against the specific root it was discovered under (`Project.root`, set
once at discovery) rather than against any configured root, so a project found under one root
cannot borrow another root's permission. The server therefore cannot read or execute `beans`
against arbitrary filesystem paths even if a project name or path were attacker controlled.

The project directory is only half of it. A project's `.beans.yml` chooses where its bean files
live, and `beans.path: ../../elsewhere` is a perfectly valid thing to write there — the CLI
honours it. Containing the project directory would do nothing if the data directory could point
anywhere. So discovery resolves that path through `realpathContained` and stores the result on
the project record, and every `beans` invocation passes it explicitly as `--beans-path` rather
than letting the child re-read the config and decide for itself. That closes the config as an
input: whatever `.beans.yml` says, the child operates on the directory the server chose.

One check is not enough, because discovery's answer is cached and the filesystem is not. Between
a directory being resolved and a subprocess acting on it, that directory can be replaced with a
symlink pointing out of the root. `assertDataPathStillContained` therefore re-resolves the path
inside the subprocess slot, immediately before spawning (`apps/server/src/beans/executor.ts`),
so the window between the check and the use is as small as the code can make it.

## The web app: an SPA typed from the `beans` schema

`apps/web` is a single-page app served by the server in production (see
`apps/server/src/routes/static.ts`: static assets, with an SPA fallback to `index.html` for
client-side routes) and by Vite's dev server (with an API proxy) in development.

Routing is TanStack Router (`apps/web/src/router.tsx`): `/` (cross-project overview), `/p/$project`
(hierarchy/flat bean list with filters), `/p/$project/$beanId` (detail, inline editing,
relationships), `/analytics`, and `/search`.

Data fetching is TanStack Query, calling the thin `apps/web/src/api/client.ts` wrapper around
`fetch`. Mutations POST GraphQL documents from `packages/shared/src/graphql/operations.ts` (kept
in sync with `apps/web/beans.schema.graphql` via `graphql-codegen`, see `apps/web/codegen.ts`) to
`/api/projects/:name/graphql`, so the request/response shapes are checked against the real
`beans` schema at build time rather than hand-typed.

## Known limitation — optimistic concurrency

The `beans` GraphQL schema supports optimistic-concurrency guarding via an `ifMatch` etag argument
on mutations, and the web app's mutation hooks (`apps/web/src/hooks/useMutations.ts`) still carry
`isEtagConflict`/`describeMutationError` and a "this bean changed on disk — reload" UI prompt for
it. In the installed `beans` v0.4.2 binary, though, mutation resolvers reject a freshly-queried
etag as a mismatch even immediately after a read with no intervening write. Every etag-guarded
mutation fails, which makes editing impossible. Until that's fixed upstream, no mutation sends
`ifMatch`, so bean edits are **last-write-wins**: if a bean is edited both in the browser and via
an external `beans` CLI invocation (or another agent/tab) between load and save, whichever save
lands last silently overwrites the other, with no conflict surfaced. The conflict-handling code
and UI are intentionally retained (not deleted) so re-adding `ifMatch` to the mutation documents is
enough to reactivate real conflict detection once the upstream bug is fixed.

## Data flow

```
                          ┌────────────────────────┐
  beans CLI (per project) │  beans graphql --json   │
  spawned per request     │  --config <proj>.beans  │
                          └───────────▲─────────────┘
                                      │ stdout (JSON)
                    ┌─────────────────┴──────────────────┐
                    │  apps/server (Hono)                 │
GIT_ROOT  ─scan──▶  │  discovery │ passthrough │ aggregate│ ─SSE (chokidar)─▶
(filesystem)        │  /api/projects  /api/projects/:n/   │
                    │  graphql  /api/search /api/analytics│
                    │  /api/events                        │
                    └─────────────────▲────────────────────┘
                                      │ fetch (JSON) / EventSource
                    ┌─────────────────┴──────────────────┐
                    │  apps/web (React SPA)               │
                    │  TanStack Router + Query            │
                    └──────────────────────────────────────┘
```

## Why `tsx` in production

`apps/server` consumes `@beans-web/shared` as **TypeScript source**
(`"main": "./src/index.ts"` in its `package.json`, not a compiled `dist/`). Plain `node` running
compiled server output cannot resolve those `.ts` imports at runtime (`ERR_MODULE_NOT_FOUND`), so
the server's `start` script runs `NODE_ENV=production tsx src/index.ts`. That is the same
`tsx`-based execution used in development (`tsx watch`), minus the watch and reload behavior.
`tsx` is therefore a runtime dependency of `apps/server` rather than a dev-only tool. `pnpm start` at the repo
root builds the web app first, then runs this production server start script.

## Codecov setup

CI (`.github/workflows/ci.yml`) sends coverage and test-result data to codecov.io. Two tokens are
involved, and they are not interchangeable:

- **`CODECOV_TOKEN` (GitHub repo secret)** authenticates uploads. The `test` job passes it as the
  `token:` input to six upload steps: three `codecov/codecov-action` steps (one per package:
  `shared`, `server`, `web`) each uploading that package's `coverage/lcov.info`, and three
  `codecov/test-results-action` steps each uploading that package's `test-report.junit.xml`. It's
  a private, repo-scoped write credential. Never commit or log it.
- **`CODECOV_TOKEN` as a build-time env var (same secret)** gates bundle analysis in
  `apps/web/vite.config.ts`: `codecovVitePlugin({ enableBundleAnalysis:
  Boolean(process.env.CODECOV_TOKEN), uploadToken: process.env.CODECOV_TOKEN, ... })`. This is the
  identical secret value, just read a second way: as a process env var during `vite build` rather
  than as an action input. The CI `build` job declares `env: CODECOV_TOKEN: ${{
  secrets.CODECOV_TOKEN }}` at the job level, so `pnpm -r build` runs with the secret exported and
  bundle analysis runs on every push/PR to `main` where the secret is available. On fork PRs,
  GitHub Actions sets the secret to an empty string rather than leaving it unset;
  `Boolean(process.env.CODECOV_TOKEN)` treats `""` the same as unset and skips analysis, so those
  builds still no-op cleanly instead of attempting an upload with a blank token. Bundle analysis
  can also be triggered manually outside CI, e.g. `CODECOV_TOKEN=<token> pnpm --filter
  @beans-web/web build`.
- **`flags: shared` / `flags: server` / `flags: web`** scope each upload step to exactly one
  package's report, tagged with exactly one flag, so Codecov keeps the three packages' coverage
  and test results separate instead of blending them into one repo-wide number. In the Codecov UI
  these appear as three distinct entries under the repo's Flags tab (`shared` → `packages/shared`,
  `server` → `apps/server`, `web` → `apps/web`), and can be turned into Components for per-package
  status checks or badges. The repo's `codecov.yml` sets only the patch coverage target (90%), so
  the flag-to-path mapping lives in the Codecov dashboard rather than in the repo.
- **The README badge's token (`N7I7FNHSIO`)** is a different kind of token: a Codecov *graph
  token*, scoped only to fetching a badge SVG
  (`https://codecov.io/gh/ThePrismSystem/beans-web/graph/badge.svg?token=...`), not to
  uploading data. It's public by design and safe to embed directly in `README.md`. It is unrelated
  to `CODECOV_TOKEN`; rotating one has no effect on the other.
