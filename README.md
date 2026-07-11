# beans-frontend

A web UI for [`beans`](https://github.com/hmans/beans) — the local-first, Markdown-backed issue
tracker. `beans-frontend` discovers every `beans` project under a configured root directory,
gives each one a browsable overview, hierarchy/flat bean lists, a detail view with inline editing
and relationship management, cross-project search, and simple analytics — all backed directly by
your on-disk `.beans` files (there is no separate database).

It is a pnpm monorepo with two apps and a shared package:

- `apps/server` — a [Hono](https://hono.dev) API server that discovers `beans` projects, proxies
  GraphQL queries/mutations to the `beans` CLI per project, aggregates cross-project search and
  analytics, streams file-change events over SSE, and serves the built web app in production.
- `apps/web` — a React + [TanStack Router](https://tanstack.com/router)/[Query](https://tanstack.com/query)
  single-page app.
- `packages/shared` — bean type/status/priority enums, hierarchy rules, and generated GraphQL
  operation strings shared by both apps.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the pieces fit together, and
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the development workflow.

## Prerequisites

- **Node.js 22+** (see `.nvmrc`)
- **pnpm** (see [pnpm.io/installation](https://pnpm.io/installation); this repo was built against
  pnpm 10)
- The **`beans`** CLI binary on your `PATH`. Install it with:

  ```bash
  go install github.com/hmans/beans@latest
  ```

  and confirm it resolves:

  ```bash
  beans version
  ```

- At least one existing `beans` project (a directory containing a `.beans.yml`, created via
  `beans init`) somewhere under the directory you'll point `GIT_ROOT` at.

## Install

```bash
pnpm install
```

## Configuration

Copy `.env.example` to `.env` (or export the variables directly) and adjust as needed:

| Variable     | Default     | Description                                                                   |
| ------------ | ----------- | ----------------------------------------------------------------------------- |
| `GIT_ROOT`   | `~/git`     | Root directory scanned for `beans` projects (any dir with a `.beans.yml`).    |
| `SCAN_DEPTH` | `4`         | Max recursion depth (1–8) when scanning `GIT_ROOT` for projects.              |
| `PORT`       | `4780`      | Port the server listens on.                                                   |
| `HOST`       | `127.0.0.1` | Bind address — keep this loopback unless you intend to expose it on a LAN.    |
| `BEANS_BIN`  | `beans`     | Path to (or name of) the `beans` binary; defaults to resolving it via `PATH`. |

The server never reads or writes outside `GIT_ROOT` — every resolved project path is checked
against it before use (see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#the-git_root-path-jail)).

## Development

Runs both apps with hot reload — the server via `tsx watch`, the web app via Vite:

```bash
pnpm dev
```

The web dev server proxies API requests to the server (see `apps/web/vite.config.ts`); by default
the server listens on `http://127.0.0.1:4780`.

## Production

Build the web app and start the server, which serves the built SPA and the `/api/*` routes from
one process:

```bash
pnpm start
```

This runs `pnpm --filter @beans-frontend/web build` followed by
`pnpm --filter @beans-frontend/server start`. The server is started via `tsx` rather than plain
`node` — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#why-tsx-in-production) for why.

```bash
GIT_ROOT=/path/to/your/git/projects PORT=4780 pnpm start
```

Then visit `http://127.0.0.1:4780`.

## Quality checks

```bash
pnpm format      # prettier --check
pnpm lint        # eslint, zero warnings
pnpm typecheck   # tsc across all packages
pnpm test        # unit + integration tests (needs `beans` on PATH)
pnpm -r knip     # unused files/exports/dependencies
pnpm spell       # cspell
```

End-to-end tests (Playwright) live in `apps/web/e2e`:

```bash
pnpm --filter @beans-frontend/web build
pnpm --filter @beans-frontend/web exec playwright test
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for more detail on the development workflow.

## License

[MIT](LICENSE)
