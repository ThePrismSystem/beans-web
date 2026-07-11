# Architecture

## Overview

`beans-frontend` is a pnpm monorepo with three packages:

- **`apps/server`** — a small [Hono](https://hono.dev) API server. It does not own any data; it
  discovers `beans` projects on disk, shells out to the `beans` CLI's own GraphQL interface per
  project, aggregates results across projects for search/analytics, and streams file-change
  events over Server-Sent Events (SSE). In production it also serves the built web app.
- **`apps/web`** — a React SPA (Vite + TanStack Router + TanStack Query) typed against the
  `beans` GraphQL schema.
- **`packages/shared`** — bean type/status/priority enums, hierarchy validation rules, and the
  GraphQL operation strings used by the web app's mutations/queries. Consumed as TypeScript
  source by both apps (see [Why `tsx` in production](#why-tsx-in-production)).

## The server: thin passthrough + discovery + aggregation + SSE

The server holds no bean data itself. On startup and on each `/api/projects` request, it walks
`GIT_ROOT` (`apps/server/src/discovery/scan.ts`) up to `SCAN_DEPTH` levels looking for
directories containing a `.beans.yml`; each one becomes a `Project` (name, path, prefix, and
counts by type/status, read via `beans`).

Per-project GraphQL traffic is a **passthrough**: `POST /api/projects/:name/graphql` resolves the
project's `.beans.yml`, then spawns `beans graphql --json --config <path> <query>`
(`apps/server/src/beans/executor.ts`) and relays stdout back as the response body. The server
does not parse or validate the GraphQL query itself — `beans` does, using the exact schema
captured in `apps/web/beans.schema.graphql` (regenerate with `beans graphql --schema` if `beans`
is upgraded and the schema drifts).

Two things the server *does* compute itself, by fanning a query out to every discovered project
and merging the results:

- **Global search** (`apps/server/src/aggregate/search.ts`, `GET /api/search`) — queries each
  project for matching beans and flattens the results into one ranked list with the owning
  project attached.
- **Analytics** (`apps/server/src/aggregate/analytics.ts`, `GET /api/analytics`) — per-project
  totals plus cross-project breakdowns by type/status and completions by month.

**Live updates** are pushed over SSE (`GET /api/events`, `apps/server/src/routes/events.ts`).
`BeansWatcher` (`apps/server/src/watch/watcher.ts`) uses `chokidar` to watch each project's
`.beans/` directory non-recursively; any add/change/unlink is mapped back to its owning project
and re-emitted as a `{ project, kind }` event, which the SSE route relays to every connected
client. The web app's `useEvents` hook consumes this to invalidate its TanStack Query caches, so
edits made outside the browser (e.g. via the `beans` CLI or another tab) show up without a
manual refresh.

## The `GIT_ROOT` path jail

`GIT_ROOT` is the only directory tree the server is allowed to touch. Every project path used to
build a `--config` argument or serve a file is passed through `assertWithinRoot(root, candidate)`
(`apps/server/src/discovery/scan.ts`), which resolves both paths and rejects anything whose
relative path from `root` starts with `..` — i.e. anything outside `GIT_ROOT`, including via
symlink traversal or a crafted `:name` route param. This keeps the server unable to read or
execute `beans` against arbitrary filesystem paths even if a project name or path were attacker
controlled.

## The web app: an SPA typed from the `beans` schema

`apps/web` is a single-page app served by the server in production (see
`apps/server/src/routes/static.ts` — static assets, with an SPA fallback to `index.html` for
client-side routes) and by Vite's dev server (with an API proxy) in development.

Routing is TanStack Router (`apps/web/src/router.tsx`): `/` (cross-project overview), `/p/$project`
(hierarchy/flat bean list with filters), `/p/$project/$beanId` (detail, inline editing,
relationships), `/analytics`, and `/search`.

Data fetching is TanStack Query, calling the thin `apps/web/src/api/client.ts` wrapper around
`fetch`. Mutations POST GraphQL documents from `packages/shared/src/graphql/operations.ts` (kept
in sync with `apps/web/beans.schema.graphql` via `graphql-codegen`, see `apps/web/codegen.ts`) to
`/api/projects/:name/graphql`, so the request/response shapes are checked against the real
`beans` schema at build time rather than hand-typed.

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

`@beans-frontend/shared` is consumed by `apps/server` as **TypeScript source**
(`"main": "./src/index.ts"` in its `package.json`, not a compiled `dist/`). Plain `node` running
compiled server output cannot resolve those `.ts` imports at runtime (`ERR_MODULE_NOT_FOUND`), so
the server's `start` script runs `NODE_ENV=production tsx src/index.ts` — the same `tsx`-based
execution used in development (`tsx watch`), just without the watch/reload behavior. `tsx` is
therefore a runtime dependency of `apps/server`, not a dev-only tool. `pnpm start` at the repo
root builds the web app first, then runs this production server start script.
